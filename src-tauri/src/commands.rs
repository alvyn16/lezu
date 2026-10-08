use crate::library::LibraryStore;
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    code: &'static str,
    message: &'static str,
    retryable: bool,
}

fn error(code: &'static str, message: &'static str) -> CommandError {
    CommandError {
        code,
        message,
        retryable: false,
    }
}

fn database_error() -> CommandError {
    error("database", "The game library could not be read or saved.")
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameView {
    id: String,
    title: String,
    source: String,
    installed: bool,
    installation_id: Option<String>,
    played: Option<String>,
    last_played: Option<String>,
    size: Option<String>,
    developer: Option<String>,
    year: Option<String>,
    tags: Vec<String>,
    description: Option<String>,
    theme: ThemeView,
    screenshots: Vec<String>,
    cover: Option<String>,
    hero: Option<String>,
    logo: Option<String>,
}

#[derive(Serialize)]
struct ThemeView {
    page: &'static str,
    sidebar: &'static str,
}

#[tauri::command]
pub fn list_library(store: State<'_, LibraryStore>) -> Result<Vec<GameView>, CommandError> {
    query_library(&store)
}

fn query_library(store: &LibraryStore) -> Result<Vec<GameView>, CommandError> {
    let connection = store.0.lock().map_err(|_| database_error())?;
    let mut statement = connection
        .prepare(
            "SELECT g.id, g.title, g.source, i.id, i.install_state
             FROM games g LEFT JOIN installations i ON i.id = (
                 SELECT candidate.id FROM installations candidate
                 WHERE candidate.game_id = g.id
                 ORDER BY CASE WHEN candidate.install_state = 'installed' THEN 0 ELSE 1 END,
                          candidate.rowid
                 LIMIT 1
             )
             ORDER BY g.title COLLATE NOCASE, g.id",
        )
        .map_err(|_| database_error())?;
    let records = statement
        .query_map([], |row| {
            let state: Option<String> = row.get(4)?;
            Ok(GameView {
                id: row.get(0)?,
                title: row.get(1)?,
                source: row.get(2)?,
                installed: state.as_deref() == Some("installed"),
                installation_id: row.get(3)?,
                played: None,
                last_played: None,
                size: None,
                developer: None,
                year: None,
                tags: vec![],
                description: None,
                theme: ThemeView {
                    page: "#30343b",
                    sidebar: "#23272d",
                },
                screenshots: vec![],
                cover: None,
                hero: None,
                logo: None,
            })
        })
        .map_err(|_| database_error())?;
    records
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| database_error())
}

#[tauri::command]
pub fn add_manual_game(
    store: State<'_, LibraryStore>,
    executable_path: String,
    title: Option<String>,
) -> Result<String, CommandError> {
    insert_manual_game(&store, &executable_path, title.as_deref())
}

fn insert_manual_game(
    store: &LibraryStore,
    executable_path: &str,
    title: Option<&str>,
) -> Result<String, CommandError> {
    let path = std::fs::canonicalize(executable_path).map_err(|_| {
        error(
            "invalid_path",
            "Choose an existing Windows game executable.",
        )
    })?;
    if !path.is_file()
        || !path
            .extension()
            .is_some_and(|part| part.eq_ignore_ascii_case("exe"))
    {
        return Err(error(
            "invalid_path",
            "Choose an existing Windows game executable.",
        ));
    }
    let name = title
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
        .or_else(|| {
            path.file_stem()
                .map(|name| name.to_string_lossy().into_owned())
        })
        .ok_or_else(|| error("invalid_title", "Enter a game title."))?;
    if name.chars().count() > 160 || name.chars().any(char::is_control) {
        return Err(error(
            "invalid_title",
            "Enter a title under 160 characters.",
        ));
    }
    let normalized = path.to_string_lossy().to_lowercase();
    let working_dir = path
        .parent()
        .ok_or_else(|| error("invalid_path", "Choose a game executable."))?;
    let game_id = uuid::Uuid::new_v4().to_string();
    let install_id = uuid::Uuid::new_v4().to_string();
    let mut connection = store.0.lock().map_err(|_| database_error())?;
    let transaction = connection.transaction().map_err(|_| database_error())?;
    let existing: Option<String> = transaction
        .query_row(
            "SELECT game_id FROM installations WHERE normalized_path = ?1",
            [&normalized],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| database_error())?;
    if existing.is_some() {
        return Err(error(
            "duplicate",
            "This executable is already in your library.",
        ));
    }
    transaction
        .execute(
            "INSERT INTO games(id, title, source, added_at) VALUES (?1, ?2, 'manual', strftime('%s','now'))",
            params![game_id, name],
        )
        .map_err(|_| database_error())?;
    transaction
        .execute(
            "INSERT INTO installations(id, game_id, source, executable_path, normalized_path, working_dir)
             VALUES (?1, ?2, 'manual', ?3, ?4, ?5)",
            params![install_id, game_id, path.to_string_lossy(), normalized, working_dir.to_string_lossy()],
        )
        .map_err(|_| database_error())?;
    transaction.commit().map_err(|_| database_error())?;
    Ok(game_id)
}

fn installation_path(
    store: State<'_, LibraryStore>,
    installation_id: &str,
) -> Result<(PathBuf, PathBuf), CommandError> {
    let connection = store.0.lock().map_err(|_| database_error())?;
    let found = connection
        .query_row(
            "SELECT executable_path, working_dir FROM installations WHERE id = ?1 AND install_state = 'installed'",
            [installation_id],
            |row| Ok((PathBuf::from(row.get::<_, String>(0)?), PathBuf::from(row.get::<_, String>(1)?))),
        )
        .optional()
        .map_err(|_| database_error())?;
    found.ok_or_else(|| {
        error(
            "missing_installation",
            "This installation is no longer available.",
        )
    })
}

fn validate_target(path: &Path, working_dir: &Path) -> Result<(), CommandError> {
    if !path.is_file() || !working_dir.is_dir() {
        return Err(error(
            "missing_file",
            "The game's executable or folder is missing. Rescan or edit this game.",
        ));
    }
    if !path
        .extension()
        .is_some_and(|part| part.eq_ignore_ascii_case("exe"))
    {
        return Err(error(
            "invalid_target",
            "This installation has no valid Windows executable.",
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn launch_installation(
    store: State<'_, LibraryStore>,
    installation_id: String,
) -> Result<(), CommandError> {
    let (path, working_dir) = installation_path(store, &installation_id)?;
    validate_target(&path, &working_dir)?;
    std::process::Command::new(path)
        .current_dir(working_dir)
        .spawn()
        .map_err(|_| error("launch_failed", "Windows could not start this game."))?;
    Ok(())
}

#[tauri::command]
pub fn reveal_installation(
    store: State<'_, LibraryStore>,
    installation_id: String,
) -> Result<(), CommandError> {
    let (path, working_dir) = installation_path(store, &installation_id)?;
    validate_target(&path, &working_dir)?;
    std::process::Command::new("explorer.exe")
        .arg(working_dir)
        .spawn()
        .map_err(|_| error("folder_failed", "Windows could not open this game folder."))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn manual_import_rejects_duplicates_and_keeps_one_library_card_per_game() {
        let directory =
            std::env::temp_dir().join(format!("lezu-manual-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&directory).unwrap();
        let executable = directory.join("Example Game.exe");
        fs::write(&executable, b"test fixture").unwrap();
        {
            let store = LibraryStore::open(&directory.join("library.db")).unwrap();
            let first =
                insert_manual_game(&store, executable.to_str().unwrap(), Some(" Example Game "))
                    .unwrap();
            let entries = query_library(&store).unwrap();
            assert_eq!(entries.len(), 1);
            assert_eq!(entries[0].id, first);
            assert_eq!(entries[0].title, "Example Game");
            assert!(entries[0].installed);
            assert!(entries[0].installation_id.is_some());
            let duplicate =
                insert_manual_game(&store, executable.to_str().unwrap(), None).unwrap_err();
            assert_eq!(duplicate.code, "duplicate");

            let second_installation = uuid::Uuid::new_v4().to_string();
            let connection = store.0.lock().unwrap();
            connection.execute(
                "INSERT INTO installations(id, game_id, source, executable_path, normalized_path, working_dir, install_state)
                 VALUES (?1, ?2, 'manual', ?3, ?4, ?5, 'missing')",
                params![second_installation, first, "other.exe", "other.exe", directory.to_str().unwrap()],
            ).unwrap();
            drop(connection);
            let entries = query_library(&store).unwrap();
            assert_eq!(entries.len(), 1);
            assert_eq!(entries[0].title, "Example Game");
            assert!(entries[0].installed);
        }
        fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn invalid_manual_target_is_rejected_without_saving() {
        let directory =
            std::env::temp_dir().join(format!("lezu-manual-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&directory).unwrap();
        let text_file = directory.join("not-a-game.txt");
        fs::write(&text_file, b"test fixture").unwrap();
        {
            let store = LibraryStore::open(&directory.join("library.db")).unwrap();
            let failure =
                insert_manual_game(&store, text_file.to_str().unwrap(), None).unwrap_err();
            assert_eq!(failure.code, "invalid_path");
            assert!(query_library(&store).unwrap().is_empty());
            let missing = directory.join("missing.exe");
            assert_eq!(
                validate_target(&missing, &directory).unwrap_err().code,
                "missing_file"
            );
        }
        fs::remove_dir_all(&directory).unwrap();
    }
}
