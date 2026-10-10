use crate::{
    commands::{database_error, error, CommandError},
    library::LibraryStore,
    store_discovery::StoreRoots,
};
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use std::{
    env, fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadRecord {
    id: String,
    game_id: String,
    title: String,
    provider: String,
    destination: String,
    status: String,
    progress: Option<i64>,
    started_at: i64,
    finished_at: Option<i64>,
    error: Option<String>,
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs() as i64)
}

fn checked_provider(provider: &str) -> Result<(), CommandError> {
    if matches!(provider, "steam" | "epic" | "gog") {
        Ok(())
    } else {
        Err(error(
            "download_provider",
            "Choose Steam, Epic Games, or GOG.",
        ))
    }
}

fn valid_install_folder(provider: &str, path: &Path) -> Result<(), CommandError> {
    if !path.is_absolute() || !path.is_dir() {
        return Err(error(
            "install_folder",
            "The install location is unavailable. Choose another folder in Settings.",
        ));
    }
    if provider == "steam" && !path.join("steamapps").is_dir() {
        return Err(error(
            "steam_folder",
            "Choose a Steam library containing a steamapps folder in Settings.",
        ));
    }
    Ok(())
}

fn detected_steam_library() -> Option<PathBuf> {
    let roots = StoreRoots::windows_defaults();
    for root in &roots.steam {
        if root.join("steamapps").is_dir() {
            return Some(root.clone());
        }
        let Ok(text) = fs::read_to_string(root.join("steamapps").join("libraryfolders.vdf")) else {
            continue;
        };
        for line in text.lines() {
            let parts: Vec<&str> = line.split('"').collect();
            if parts
                .get(1)
                .is_some_and(|label| label.eq_ignore_ascii_case("path"))
            {
                if let Some(value) = parts.get(3) {
                    let path = PathBuf::from(value.replace("\\\\", "\\"));
                    if path.join("steamapps").is_dir() {
                        return Some(path);
                    }
                }
            }
        }
    }
    None
}

fn default_install_folder(provider: &str) -> Result<PathBuf, CommandError> {
    if provider == "steam" {
        return detected_steam_library().ok_or_else(|| error(
            "steam_folder", "No Steam library was found. Choose a Steam library in Settings before downloading."
        ));
    }
    let home = env::var_os("USERPROFILE")
        .or_else(|| env::var_os("LOCALAPPDATA"))
        .ok_or_else(|| {
            error(
                "install_folder",
                "Could not locate your Windows user folder.",
            )
        })?;
    let path = PathBuf::from(home)
        .join("Games")
        .join("Lezu")
        .join(if provider == "epic" {
            "Epic Games"
        } else {
            "GOG"
        });
    fs::create_dir_all(&path).map_err(|_| {
        error(
            "install_folder",
            "Could not create the default game folder. Choose another in Settings.",
        )
    })?;
    Ok(path)
}

#[tauri::command]
pub fn get_install_location(
    store: State<'_, LibraryStore>,
    provider: String,
) -> Result<String, CommandError> {
    checked_provider(&provider)?;
    let saved: Option<String> = store
        .0
        .lock()
        .map_err(|_| database_error())?
        .query_row(
            "SELECT value FROM preferences WHERE key=?1",
            [format!("install-location:{provider}")],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| database_error())?;
    let path = saved
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(|| default_install_folder(&provider))?;
    valid_install_folder(&provider, &path)?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn set_install_location(
    store: State<'_, LibraryStore>,
    provider: String,
    path: String,
) -> Result<String, CommandError> {
    checked_provider(&provider)?;
    let path = PathBuf::from(path);
    valid_install_folder(&provider, &path)?;
    store.0.lock().map_err(|_| database_error())?.execute(
        "INSERT INTO preferences(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![format!("install-location:{provider}"), path.to_string_lossy()],
    ).map_err(|_| database_error())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn list_downloads(store: State<'_, LibraryStore>) -> Result<Vec<DownloadRecord>, CommandError> {
    let connection = store.0.lock().map_err(|_| database_error())?;
    let mut statement = connection.prepare(
        "SELECT id, game_id, title, provider, destination, status, progress, started_at, finished_at, error
         FROM download_history ORDER BY (status='downloading') DESC, started_at DESC, rowid DESC LIMIT 100",
    ).map_err(|_| database_error())?;
    let records = statement
        .query_map([], |row| {
            Ok(DownloadRecord {
                id: row.get(0)?,
                game_id: row.get(1)?,
                title: row.get(2)?,
                provider: row.get(3)?,
                destination: row.get(4)?,
                status: row.get(5)?,
                progress: row.get(6)?,
                started_at: row.get(7)?,
                finished_at: row.get(8)?,
                error: row.get(9)?,
            })
        })
        .map_err(|_| database_error())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| database_error())?;
    Ok(records)
}

#[tauri::command]
pub fn begin_download(
    store: State<'_, LibraryStore>,
    game_id: String,
    destination: String,
) -> Result<String, CommandError> {
    if destination.trim().is_empty() {
        return Err(error("download_destination", "Choose a download folder."));
    }
    let connection = store.0.lock().map_err(|_| database_error())?;
    let game: Option<(String, String)> = connection.query_row(
        "SELECT g.title, g.source FROM games g JOIN owned_games o ON o.game_id=g.id WHERE g.id=?1 LIMIT 1",
        [&game_id], |row| Ok((row.get(0)?, row.get(1)?)),
    ).optional().map_err(|_| database_error())?;
    let (title, provider) = game.ok_or_else(|| {
        error(
            "not_owned",
            "Connect the store account before downloading this game.",
        )
    })?;
    if !matches!(provider.as_str(), "steam" | "epic" | "gog") {
        return Err(error(
            "download_provider",
            "This store cannot download games in Lezu.",
        ));
    }
    let id = uuid::Uuid::new_v4().to_string();
    connection
        .execute(
            "INSERT INTO download_history(id,game_id,title,provider,destination,status,started_at)
         VALUES(?1,?2,?3,?4,?5,'downloading',?6)",
            params![id, game_id, title, provider, destination, now()],
        )
        .map_err(|_| database_error())?;
    connection
        .execute(
            "DELETE FROM download_history WHERE id IN (
         SELECT id FROM download_history WHERE status!='downloading'
         ORDER BY started_at DESC, rowid DESC LIMIT -1 OFFSET 200)",
            [],
        )
        .map_err(|_| database_error())?;
    Ok(id)
}

#[tauri::command]
pub fn set_download_progress(
    store: State<'_, LibraryStore>,
    id: String,
    progress: i64,
) -> Result<(), CommandError> {
    if !(0..=100).contains(&progress) {
        return Err(error(
            "download_progress",
            "Download progress must be between 0 and 100.",
        ));
    }
    store.0.lock().map_err(|_| database_error())?.execute(
        "UPDATE download_history SET progress=?2 WHERE id=?1 AND status='downloading' AND (progress IS NULL OR progress<?2)",
        params![id, progress],
    ).map_err(|_| database_error())?;
    Ok(())
}

#[tauri::command]
pub fn finish_download(
    store: State<'_, LibraryStore>,
    id: String,
    status: String,
    message: Option<String>,
) -> Result<(), CommandError> {
    if !matches!(status.as_str(), "completed" | "failed" | "cancelled") {
        return Err(error("download_status", "Choose a valid download result."));
    }
    let message = message.map(|text| text.chars().take(300).collect::<String>());
    let changed = store.0.lock().map_err(|_| database_error())?.execute(
        "UPDATE download_history SET status=?2, progress=CASE WHEN ?2='completed' THEN 100 ELSE progress END,
         finished_at=?3, error=?4 WHERE id=?1 AND status='downloading'",
        params![id, status, now(), message],
    ).map_err(|_| database_error())?;
    if changed == 0 {
        return Err(error(
            "download_missing",
            "This download is no longer active.",
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn clear_download_history(store: State<'_, LibraryStore>) -> Result<usize, CommandError> {
    store
        .0
        .lock()
        .map_err(|_| database_error())?
        .execute(
            "DELETE FROM download_history WHERE status!='downloading'",
            [],
        )
        .map_err(|_| database_error())
}

#[cfg(test)]
mod tests {
    use super::valid_install_folder;

    #[test]
    fn steam_location_requires_a_library_root() {
        let root = std::env::temp_dir().join(format!("lezu-install-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        assert!(valid_install_folder("steam", &root).is_err());
        assert!(valid_install_folder("epic", &root).is_ok());
        std::fs::create_dir(root.join("steamapps")).unwrap();
        assert!(valid_install_folder("steam", &root).is_ok());
        std::fs::remove_dir_all(root).unwrap();
    }
}
