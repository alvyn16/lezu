use crate::{
    commands::{database_error, error, CommandError},
    library::LibraryStore,
    store_discovery::StoreCandidate,
};
use rusqlite::{params, OptionalExtension};
use std::{fs, path::PathBuf};

fn normalized_path(path: &str) -> Option<String> {
    let canonical = fs::canonicalize(path).ok()?;
    canonical
        .is_file()
        .then(|| canonical.to_string_lossy().to_lowercase())
}

pub fn reconcile(
    store: &LibraryStore,
    candidates: Vec<StoreCandidate>,
) -> Result<Vec<StoreCandidate>, CommandError> {
    let mut connection = store.0.lock().map_err(|_| database_error())?;
    let transaction = connection.transaction().map_err(|_| database_error())?;
    let mut missing = Vec::new();
    {
        let mut statement = transaction
            .prepare("SELECT id, executable_path, working_dir FROM installations")
            .map_err(|_| database_error())?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|_| database_error())?;
        for row in rows {
            let (id, exe, folder) = row.map_err(|_| database_error())?;
            if !PathBuf::from(&exe).is_file() || !PathBuf::from(&folder).is_dir() {
                missing.push(id);
            }
        }
    }
    for id in missing {
        transaction
            .execute(
                "UPDATE installations SET install_state = 'missing' WHERE id = ?1",
                [&id],
            )
            .map_err(|_| database_error())?;
    }
    let mut new_games = Vec::new();
    for candidate in candidates {
        let Some(normalized) = normalized_path(&candidate.executable_path) else {
            continue;
        };
        let existing: Option<String> = transaction
            .query_row(
                "SELECT id FROM installations WHERE normalized_path = ?1",
                [&normalized],
                |row| row.get(0),
            )
            .optional()
            .map_err(|_| database_error())?;
        if let Some(id) = existing {
            transaction.execute(
                "UPDATE installations SET install_state = 'installed', last_observed_at = strftime('%s','now'),
                    store_id = COALESCE(store_id, ?2) WHERE id = ?1",
                params![id, candidate.store_id],
            ).map_err(|_| database_error())?;
        } else {
            let moved_id: Option<String> = match candidate.store_id.as_deref() {
                Some(store_id) => transaction
                    .query_row(
                        "SELECT id FROM installations WHERE source = ?1 AND store_id = ?2
                     ORDER BY CASE install_state WHEN 'missing' THEN 0 ELSE 1 END, rowid LIMIT 1",
                        params![candidate.source, store_id],
                        |row| row.get(0),
                    )
                    .optional()
                    .map_err(|_| database_error())?,
                None => None,
            };
            if let Some(id) = moved_id {
                transaction.execute(
                    "UPDATE installations SET executable_path = ?2, normalized_path = ?3,
                        working_dir = ?4, install_state = 'installed', last_observed_at = strftime('%s','now')
                     WHERE id = ?1",
                    params![id, candidate.executable_path, normalized, candidate.working_directory],
                ).map_err(|_| database_error())?;
            } else {
                new_games.push(candidate);
            }
        }
    }
    transaction.commit().map_err(|_| database_error())?;
    Ok(new_games)
}

pub fn import(
    store: &LibraryStore,
    candidates: Vec<StoreCandidate>,
) -> Result<usize, CommandError> {
    if candidates.len() > 250 {
        return Err(error("too_many_games", "Import at most 250 games at once."));
    }
    let mut connection = store.0.lock().map_err(|_| database_error())?;
    let transaction = connection.transaction().map_err(|_| database_error())?;
    let mut imported = 0;
    for candidate in candidates {
        if !matches!(candidate.source.as_str(), "steam" | "epic" | "gog")
            || candidate.title.trim().is_empty()
            || candidate.title.chars().count() > 160
            || candidate.title.chars().any(char::is_control)
        {
            return Err(error(
                "invalid_game",
                "One discovered game has invalid details.",
            ));
        }
        let path = fs::canonicalize(&candidate.executable_path).map_err(|_| {
            error(
                "missing_file",
                "A discovered game executable is missing. Rescan and try again.",
            )
        })?;
        if !path.is_file()
            || !path
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("exe"))
        {
            return Err(error(
                "invalid_game",
                "A discovered game has no Windows executable.",
            ));
        }
        let folder = fs::canonicalize(&candidate.working_directory).map_err(|_| {
            error(
                "missing_folder",
                "A discovered game folder is missing. Rescan and try again.",
            )
        })?;
        if !folder.is_dir() || !path.starts_with(&folder) {
            return Err(error(
                "invalid_folder",
                "A discovered executable is outside its game folder.",
            ));
        }
        let normalized = path.to_string_lossy().to_lowercase();
        let existing: Option<String> = transaction
            .query_row(
                "SELECT id FROM installations WHERE normalized_path = ?1",
                [&normalized],
                |row| row.get(0),
            )
            .optional()
            .map_err(|_| database_error())?;
        if existing.is_some() {
            continue;
        }
        let game_id = uuid::Uuid::new_v4().to_string();
        let install_id = uuid::Uuid::new_v4().to_string();
        transaction
            .execute(
                "INSERT INTO games(id,title,source,added_at) VALUES(?1,?2,?3,strftime('%s','now'))",
                params![game_id, candidate.title.trim(), candidate.source],
            )
            .map_err(|_| database_error())?;
        transaction.execute(
            "INSERT INTO installations(id,game_id,source,executable_path,normalized_path,working_dir,
                install_state,last_observed_at,store_id)
             VALUES(?1,?2,?3,?4,?5,?6,'installed',strftime('%s','now'),?7)",
            params![install_id, game_id, candidate.source, path.to_string_lossy(), normalized,
                folder.to_string_lossy(), candidate.store_id],
        ).map_err(|_| database_error())?;
        imported += 1;
    }
    transaction.commit().map_err(|_| database_error())?;
    Ok(imported)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn import_is_idempotent_and_rescan_marks_missing_then_restored() {
        let folder = std::env::temp_dir().join(format!("lezu-sync-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&folder).unwrap();
        let path = folder.join("Game.exe");
        fs::write(&path, b"fixture").unwrap();
        let store = LibraryStore::open(&folder.join("library.db")).unwrap();
        let candidate = StoreCandidate {
            source: "steam".to_owned(),
            store_id: Some("42".to_owned()),
            title: "Game".to_owned(),
            executable_path: path.to_string_lossy().into_owned(),
            working_directory: folder.to_string_lossy().into_owned(),
        };
        assert_eq!(import(&store, vec![candidate.clone()]).unwrap(), 1);
        assert_eq!(import(&store, vec![candidate.clone()]).unwrap(), 0);
        assert!(reconcile(&store, vec![candidate.clone()])
            .unwrap()
            .is_empty());
        fs::remove_file(&path).unwrap();
        assert!(reconcile(&store, vec![]).unwrap().is_empty());
        let state = || -> String {
            store
                .0
                .lock()
                .unwrap()
                .query_row("SELECT install_state FROM installations", [], |row| {
                    row.get(0)
                })
                .unwrap()
        };
        assert_eq!(state(), "missing");
        fs::write(&path, b"fixture").unwrap();
        assert!(reconcile(&store, vec![candidate]).unwrap().is_empty());
        assert_eq!(state(), "installed");
        let moved = folder.join("Moved.exe");
        fs::rename(&path, &moved).unwrap();
        let moved_candidate = StoreCandidate {
            source: "steam".to_owned(),
            store_id: Some("42".to_owned()),
            title: "Game".to_owned(),
            executable_path: moved.to_string_lossy().into_owned(),
            working_directory: folder.to_string_lossy().into_owned(),
        };
        assert!(reconcile(&store, vec![moved_candidate]).unwrap().is_empty());
        assert_eq!(state(), "installed");
        assert_eq!(
            store
                .0
                .lock()
                .unwrap()
                .query_row("SELECT COUNT(*) FROM games", [], |row| row.get::<_, i64>(0))
                .unwrap(),
            1
        );
        drop(store);
        fs::remove_dir_all(folder).unwrap();
    }
}
