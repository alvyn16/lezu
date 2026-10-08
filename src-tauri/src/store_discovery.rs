use crate::{
    commands::{error, CommandError},
    discovery::{scan_folder, ScanCoordinator},
    library::LibraryStore,
    library_sync,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashSet,
    env, fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{Emitter, State};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreCandidate {
    pub source: String,
    pub store_id: Option<String>,
    pub title: String,
    pub executable_path: String,
    pub working_directory: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreReport {
    pub candidates: Vec<StoreCandidate>,
    pub warnings: usize,
    pub cancelled: bool,
}

pub struct StoreRoots {
    pub steam: Vec<PathBuf>,
    pub epic_manifests: PathBuf,
    pub gog: Vec<PathBuf>,
}

impl StoreRoots {
    pub fn windows_defaults() -> Self {
        let program_files = env::var_os("ProgramFiles").map(PathBuf::from);
        let program_files_x86 = env::var_os("ProgramFiles(x86)").map(PathBuf::from);
        let program_data = env::var_os("ProgramData").map(PathBuf::from);
        let local = env::var_os("LOCALAPPDATA").map(PathBuf::from);
        let mut steam = Vec::new();
        if let Some(path) = &program_files_x86 {
            steam.push(path.join("Steam"));
        }
        if let Some(path) = &program_files {
            steam.push(path.join("Steam"));
        }
        if let Some(path) = local {
            steam.push(path.join("Steam"));
        }
        let mut gog = Vec::new();
        if let Some(path) = &program_files_x86 {
            gog.push(path.join("GOG Galaxy").join("Games"));
        }
        if let Some(path) = &program_files {
            gog.push(path.join("GOG Galaxy").join("Games"));
        }
        if let Some(drive) = env::var_os("SystemDrive") {
            gog.push(PathBuf::from(format!("{}\\", drive.to_string_lossy())).join("GOG Games"));
        }
        #[cfg(windows)]
        add_registry_paths(&mut steam, &mut gog);
        Self {
            steam,
            epic_manifests: program_data
                .unwrap_or_else(|| PathBuf::from(r"C:\ProgramData"))
                .join("Epic")
                .join("EpicGamesLauncher")
                .join("Data")
                .join("Manifests"),
            gog,
        }
    }
}

#[cfg(windows)]
fn add_registry_paths(steam: &mut Vec<PathBuf>, gog: &mut Vec<PathBuf>) {
    use winreg::{
        enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE},
        RegKey,
    };
    if let Ok(key) = RegKey::predef(HKEY_CURRENT_USER).open_subkey(r"Software\Valve\Steam") {
        if let Ok(path) = key.get_value::<String, _>("SteamPath") {
            steam.push(PathBuf::from(path));
        }
    }
    for location in [
        r"SOFTWARE\GOG.com\Games",
        r"SOFTWARE\WOW6432Node\GOG.com\Games",
    ] {
        if let Ok(games) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey(location) {
            for name in games.enum_keys().flatten() {
                if let Ok(game) = games.open_subkey(name) {
                    if let Ok(path) = game.get_value::<String, _>("path") {
                        if let Some(parent) = Path::new(&path).parent() {
                            gog.push(parent.to_path_buf());
                        }
                    }
                }
            }
        }
    }
}

fn quoted_value(text: &str, key: &str) -> Option<String> {
    text.lines().find_map(|line| {
        let mut parts = line.split('"').skip(1).step_by(2);
        let label = parts.next()?;
        let value = parts.next()?;
        label
            .eq_ignore_ascii_case(key)
            .then(|| value.replace("\\\\", "\\"))
    })
}

fn game_executable(folder: &Path, hint: Option<&str>, cancelled: &AtomicBool) -> Option<PathBuf> {
    if let Some(hint) = hint {
        let path = folder.join(hint);
        if let (Ok(folder), Ok(path)) = (fs::canonicalize(folder), fs::canonicalize(path)) {
            if path.starts_with(folder)
                && path.is_file()
                && path
                    .extension()
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("exe"))
            {
                return Some(path);
            }
        }
    }
    let report = scan_folder(folder, cancelled).ok()?;
    let folder_name = folder.file_name()?.to_string_lossy().to_lowercase();
    report
        .candidates
        .into_iter()
        .max_by_key(|candidate| {
            let title = candidate.title.to_lowercase();
            let match_score = title == folder_name
                || folder_name.contains(&title)
                || title.contains(&folder_name);
            (
                match_score,
                std::cmp::Reverse(candidate.executable_path.len()),
            )
        })
        .map(|candidate| PathBuf::from(candidate.executable_path))
}

fn push_candidate(
    report: &mut StoreReport,
    source: &str,
    store_id: Option<String>,
    title: String,
    folder: &Path,
    hint: Option<&str>,
    cancelled: &AtomicBool,
) {
    if let Some(path) = game_executable(folder, hint, cancelled) {
        report.candidates.push(StoreCandidate {
            source: source.to_owned(),
            store_id,
            title,
            executable_path: path.to_string_lossy().into_owned(),
            working_directory: folder.to_string_lossy().into_owned(),
        });
    }
}

pub fn discover(
    roots: &StoreRoots,
    cancelled: &AtomicBool,
    mut progress: impl FnMut(&str),
) -> StoreReport {
    let mut report = StoreReport {
        candidates: Vec::new(),
        warnings: 0,
        cancelled: false,
    };
    let mut steam_libraries = HashSet::new();
    progress("Steam");
    for root in &roots.steam {
        if cancelled.load(Ordering::Acquire) {
            report.cancelled = true;
            return report;
        }
        if !root.is_dir() {
            continue;
        }
        steam_libraries.insert(root.clone());
        if let Ok(text) = fs::read_to_string(root.join("steamapps").join("libraryfolders.vdf")) {
            for line in text.lines() {
                if let Some(path) = quoted_value(line, "path") {
                    steam_libraries.insert(PathBuf::from(path));
                }
            }
        }
    }
    for root in steam_libraries {
        let apps = root.join("steamapps");
        let Ok(entries) = fs::read_dir(apps) else {
            continue;
        };
        for entry in entries.flatten() {
            if cancelled.load(Ordering::Acquire) {
                report.cancelled = true;
                return report;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if !name.starts_with("appmanifest_") || !name.ends_with(".acf") {
                continue;
            }
            let Ok(text) = fs::read_to_string(entry.path()) else {
                report.warnings += 1;
                continue;
            };
            let (Some(app_id), Some(title), Some(directory)) = (
                quoted_value(&text, "appid"),
                quoted_value(&text, "name"),
                quoted_value(&text, "installdir"),
            ) else {
                report.warnings += 1;
                continue;
            };
            if directory.contains(['/', '\\']) || directory == "." || directory == ".." {
                report.warnings += 1;
                continue;
            }
            let folder = root.join("steamapps").join("common").join(directory);
            push_candidate(
                &mut report,
                "steam",
                Some(app_id),
                title,
                &folder,
                None,
                cancelled,
            );
        }
    }
    progress("Epic Games");
    if let Ok(entries) = fs::read_dir(&roots.epic_manifests) {
        for entry in entries.flatten() {
            if cancelled.load(Ordering::Acquire) {
                report.cancelled = true;
                return report;
            }
            if !entry
                .path()
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("item"))
            {
                continue;
            }
            let Ok(text) = fs::read_to_string(entry.path()) else {
                report.warnings += 1;
                continue;
            };
            let Ok(value) = serde_json::from_str::<Value>(&text) else {
                report.warnings += 1;
                continue;
            };
            let (Some(title), Some(folder)) = (
                value.get("DisplayName").and_then(Value::as_str),
                value.get("InstallLocation").and_then(Value::as_str),
            ) else {
                report.warnings += 1;
                continue;
            };
            let id = value
                .get("AppName")
                .and_then(Value::as_str)
                .map(str::to_owned);
            let hint = value.get("LaunchExecutable").and_then(Value::as_str);
            push_candidate(
                &mut report,
                "epic",
                id,
                title.to_owned(),
                Path::new(folder),
                hint,
                cancelled,
            );
        }
    }
    progress("GOG");
    for root in &roots.gog {
        let Ok(entries) = fs::read_dir(root) else {
            continue;
        };
        for entry in entries.flatten() {
            if cancelled.load(Ordering::Acquire) {
                report.cancelled = true;
                return report;
            }
            let folder = entry.path();
            if !folder.is_dir() {
                continue;
            }
            let Ok(files) = fs::read_dir(&folder) else {
                report.warnings += 1;
                continue;
            };
            let info = files.flatten().find(|file| {
                let name = file.file_name().to_string_lossy().to_lowercase();
                name.starts_with("goggame-") && name.ends_with(".info")
            });
            let (title, id, hint) = if let Some(info) = info {
                match fs::read_to_string(info.path())
                    .ok()
                    .and_then(|text| serde_json::from_str::<Value>(&text).ok())
                {
                    Some(value) => (
                        value
                            .get("name")
                            .and_then(Value::as_str)
                            .map(str::to_owned)
                            .unwrap_or_else(|| entry.file_name().to_string_lossy().into_owned()),
                        value
                            .get("gameId")
                            .and_then(Value::as_str)
                            .map(str::to_owned),
                        value
                            .get("playTasks")
                            .and_then(Value::as_array)
                            .and_then(|tasks| {
                                tasks
                                    .iter()
                                    .find_map(|task| task.get("path").and_then(Value::as_str))
                            })
                            .map(str::to_owned),
                    ),
                    None => {
                        report.warnings += 1;
                        (entry.file_name().to_string_lossy().into_owned(), None, None)
                    }
                }
            } else {
                (entry.file_name().to_string_lossy().into_owned(), None, None)
            };
            push_candidate(
                &mut report,
                "gog",
                id,
                title,
                &folder,
                hint.as_deref(),
                cancelled,
            );
        }
    }
    report
        .candidates
        .sort_by_key(|game| game.title.to_lowercase());
    let mut seen = HashSet::new();
    report
        .candidates
        .retain(|game| seen.insert(game.executable_path.to_lowercase()));
    report
}

#[tauri::command]
pub async fn discover_stores(
    coordinator: State<'_, ScanCoordinator>,
    store: State<'_, LibraryStore>,
    app: tauri::AppHandle,
) -> Result<StoreReport, CommandError> {
    let permit = coordinator
        .begin()
        .ok_or_else(|| error("scan_busy", "A folder scan is already running."))?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        let roots = StoreRoots::windows_defaults();
        discover(&roots, permit.cancelled(), |stage| {
            let _ = app.emit("store-progress", stage);
        })
    })
    .await
    .map_err(|_| error("scan_failed", "Store discovery stopped unexpectedly."))?;
    if result.cancelled {
        return Ok(result);
    }
    let candidates = library_sync::reconcile(&store, result.candidates)?;
    Ok(StoreReport {
        candidates,
        warnings: result.warnings,
        cancelled: false,
    })
}

#[tauri::command]
pub fn import_store_games(
    store: State<'_, LibraryStore>,
    candidates: Vec<StoreCandidate>,
) -> Result<usize, CommandError> {
    library_sync::import(&store, candidates)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_three_stores_and_rejects_escaping_launch_paths() {
        let root = env::temp_dir().join(format!("lezu-providers-{}", uuid::Uuid::new_v4()));
        let steam = root.join("Steam");
        let steam_game = steam.join("steamapps/common/Steam Game");
        fs::create_dir_all(&steam_game).unwrap();
        fs::write(steam_game.join("Steam Game.exe"), b"fixture").unwrap();
        fs::write(steam.join("steamapps/appmanifest_42.acf"),
            "\"AppState\"\n{\n\"appid\" \"42\"\n\"name\" \"Steam Game\"\n\"installdir\" \"Steam Game\"\n}").unwrap();
        let epic = root.join("Epic");
        let epic_game = root.join("Epic Game");
        fs::create_dir_all(&epic).unwrap();
        fs::create_dir_all(&epic_game).unwrap();
        fs::write(epic_game.join("Epic.exe"), b"fixture").unwrap();
        fs::write(
            epic.join("game.item"),
            serde_json::json!({
                "DisplayName": "Epic Game", "AppName": "epic-id",
                "InstallLocation": epic_game, "LaunchExecutable": "Epic.exe"
            })
            .to_string(),
        )
        .unwrap();
        let gog = root.join("GOG Games");
        let gog_game = gog.join("GOG Game");
        fs::create_dir_all(&gog_game).unwrap();
        fs::write(gog_game.join("GOG.exe"), b"fixture").unwrap();
        fs::write(
            gog_game.join("goggame-123.info"),
            serde_json::json!({
                "name": "GOG Game", "gameId": "123",
                "playTasks": [{"path": "../Epic Game/Epic.exe"}]
            })
            .to_string(),
        )
        .unwrap();
        let roots = StoreRoots {
            steam: vec![steam],
            epic_manifests: epic,
            gog: vec![gog],
        };
        let result = discover(&roots, &AtomicBool::new(false), |_| {});
        assert_eq!(result.candidates.len(), 3);
        assert_eq!(
            result
                .candidates
                .iter()
                .map(|game| game.source.as_str())
                .collect::<HashSet<_>>(),
            HashSet::from(["steam", "epic", "gog"])
        );
        assert!(result
            .candidates
            .iter()
            .find(|game| game.source == "gog")
            .unwrap()
            .executable_path
            .ends_with("GOG.exe"));
        fs::remove_dir_all(root).unwrap();
    }
}
