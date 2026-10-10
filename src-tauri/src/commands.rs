use crate::{
    discovery::{ScanCoordinator, ScanReport},
    library::LibraryStore,
};
use base64::Engine;
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use std::path::PathBuf;
use tauri::Emitter;
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub(crate) code: &'static str,
    message: &'static str,
    retryable: bool,
}

pub(crate) fn error(code: &'static str, message: &'static str) -> CommandError {
    CommandError {
        code,
        message,
        retryable: false,
    }
}

pub(crate) fn database_error() -> CommandError {
    error("database", "The game library could not be read or saved.")
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameView {
    id: String,
    title: String,
    source: String,
    installed: bool,
    owned: bool,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryArtwork {
    game_id: String,
    kind: String,
    image: String,
}

#[tauri::command]
pub fn get_library_artwork(
    store: State<'_, LibraryStore>,
    game_ids: Vec<String>,
    kind: String,
) -> Result<Vec<LibraryArtwork>, CommandError> {
    query_artwork(&store, &game_ids, &kind)
}

fn query_artwork(
    store: &LibraryStore,
    game_ids: &[String],
    kind: &str,
) -> Result<Vec<LibraryArtwork>, CommandError> {
    if game_ids.len() > 24 || (kind != "cover" && kind != "hero") {
        return Err(error(
            "invalid_artwork_request",
            "Choose up to 24 games and a valid artwork type.",
        ));
    }
    let connection = store.0.lock().map_err(|_| database_error())?;
    let mut statement = connection
        .prepare("SELECT mime, image FROM artwork WHERE game_id = ?1 AND kind = ?2")
        .map_err(|_| database_error())?;
    let mut artwork = Vec::new();
    for game_id in game_ids {
        let image = statement
            .query_row(params![game_id, kind], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, Vec<u8>>(1)?))
            })
            .optional()
            .map_err(|_| database_error())?;
        if let Some((mime, bytes)) = image {
            artwork.push(LibraryArtwork {
                game_id: game_id.clone(),
                kind: kind.to_owned(),
                image: format!(
                    "data:{mime};base64,{}",
                    base64::engine::general_purpose::STANDARD.encode(bytes)
                ),
            });
        }
    }
    Ok(artwork)
}

fn query_library(store: &LibraryStore) -> Result<Vec<GameView>, CommandError> {
    let connection = store.0.lock().map_err(|_| database_error())?;
    let mut statement = connection
        .prepare(
            "SELECT g.id, g.title, g.source, i.id, i.install_state,
                    owned.provider_id, owned.installed
             FROM games g LEFT JOIN installations i ON i.id = (
                 SELECT candidate.id FROM installations candidate
                 WHERE candidate.game_id = g.id
                 ORDER BY CASE WHEN candidate.install_state = 'installed' THEN 0 ELSE 1 END,
                          candidate.rowid
                 LIMIT 1
             )
             LEFT JOIN owned_games owned ON owned.game_id = g.id
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
                installed: state.as_deref() == Some("installed")
                    || row.get::<_, Option<i64>>(6)? == Some(1),
                owned: row.get::<_, Option<String>>(5)?.is_some(),
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
    working_directory: Option<String>,
) -> Result<String, CommandError> {
    insert_manual_game(
        &store,
        &executable_path,
        title.as_deref(),
        working_directory.as_deref(),
    )
}

fn insert_manual_game(
    store: &LibraryStore,
    executable_path: &str,
    title: Option<&str>,
    working_directory: Option<&str>,
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
    let default_dir = path
        .parent()
        .ok_or_else(|| error("invalid_path", "Choose a game executable."))?;
    let working_dir = match working_directory
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(selected) => std::fs::canonicalize(selected)
            .map_err(|_| error("invalid_folder", "Choose an existing game working folder."))?,
        None => default_dir.to_path_buf(),
    };
    if !working_dir.is_dir() {
        return Err(error(
            "invalid_folder",
            "Choose an existing game working folder.",
        ));
    }
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

#[tauri::command]
pub async fn scan_folder_preview(
    coordinator: State<'_, ScanCoordinator>,
    app: tauri::AppHandle,
    root: String,
) -> Result<ScanReport, CommandError> {
    let permit = coordinator
        .begin()
        .ok_or_else(|| error("scan_busy", "A folder scan is already running."))?;
    let path = PathBuf::from(root);
    let result = tauri::async_runtime::spawn_blocking(move || {
        crate::discovery::scan_folder_with_progress(&path, permit.cancelled(), |entries_checked| {
            let _ = app.emit("scan-progress", entries_checked);
        })
    })
    .await
    .map_err(|_| error("scan_failed", "The folder scan stopped unexpectedly."))?;
    result.map_err(|_| error("invalid_folder", "Choose an accessible folder to scan."))
}

#[tauri::command]
pub fn cancel_scan(coordinator: State<'_, ScanCoordinator>) {
    coordinator.cancel();
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
        let working_dir = directory.join("Game Data");
        fs::create_dir(&working_dir).unwrap();
        {
            let store = LibraryStore::open(&directory.join("library.db")).unwrap();
            let first = insert_manual_game(
                &store,
                executable.to_str().unwrap(),
                Some(" Éxample 游戏 "),
                working_dir.to_str(),
            )
            .unwrap();
            let entries = query_library(&store).unwrap();
            assert_eq!(entries.len(), 1);
            assert_eq!(entries[0].id, first);
            assert_eq!(entries[0].title, "Éxample 游戏");
            assert!(entries[0].installed);
            assert!(entries[0].installation_id.is_some());
            let connection = store.0.lock().unwrap();
            let saved_dir: String = connection
                .query_row(
                    "SELECT working_dir FROM installations WHERE game_id = ?1",
                    [&first],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(
                PathBuf::from(saved_dir),
                fs::canonicalize(&working_dir).unwrap()
            );
            drop(connection);
            let duplicate =
                insert_manual_game(&store, executable.to_str().unwrap(), None, None).unwrap_err();
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
            assert_eq!(entries[0].title, "Éxample 游戏");
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
                insert_manual_game(&store, text_file.to_str().unwrap(), None, None).unwrap_err();
            assert_eq!(failure.code, "invalid_path");
            assert!(query_library(&store).unwrap().is_empty());
        }
        fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn library_metadata_does_not_wait_for_cached_artwork() {
        let directory =
            std::env::temp_dir().join(format!("lezu-library-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&directory).unwrap();
        {
            let store = LibraryStore::open(&directory.join("library.db")).unwrap();
            let connection = store.0.lock().unwrap();
            connection.execute("INSERT INTO games(id,title,source,added_at) VALUES('game-1','Example','gog',0)", []).unwrap();
            connection.execute("INSERT INTO artwork(game_id,kind,mime,image) VALUES('game-1','cover','image/png',?1)", [b"\x89PNG\r\n\x1a\nimage".as_slice()]).unwrap();
            drop(connection);
            let games = query_library(&store).unwrap();
            assert_eq!(games.len(), 1);
            assert!(games[0].cover.is_none());
            assert!(games[0].hero.is_none());
            let art = query_artwork(&store, &["game-1".to_string()], "cover").unwrap();
            assert_eq!(art.len(), 1);
            assert!(art[0].image.starts_with("data:image/png;base64,"));
        }
        fs::remove_dir_all(directory).unwrap();
    }
}
