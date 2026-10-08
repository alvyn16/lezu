use crate::{
    commands::{database_error, error, CommandError},
    library::LibraryStore,
};
use rusqlite::OptionalExtension;
use std::path::{Path, PathBuf};
use tauri::State;

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

fn validate_folder(working_dir: &Path) -> Result<(), CommandError> {
    if working_dir.is_dir() {
        Ok(())
    } else {
        Err(error(
            "missing_folder",
            "This game's folder is missing. Rescan or edit this game.",
        ))
    }
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
    let (_, working_dir) = installation_path(store, &installation_id)?;
    validate_folder(&working_dir)?;
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
    fn folder_can_be_opened_when_executable_is_missing() {
        let directory =
            std::env::temp_dir().join(format!("lezu-launch-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&directory).unwrap();
        let missing = directory.join("missing.exe");
        assert_eq!(
            validate_target(&missing, &directory).unwrap_err().code,
            "missing_file"
        );
        assert!(validate_folder(&directory).is_ok());
        assert_eq!(
            validate_folder(&missing).unwrap_err().code,
            "missing_folder"
        );
        fs::remove_dir(&directory).unwrap();
    }
}
