use crate::{
    commands::{database_error, error, mark_game_uninstalled, CommandError},
    library::LibraryStore,
};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    collections::HashSet,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tauri::{Emitter, Manager, State};

const ENGINE_URL: &str =
    "https://github.com/legendary-gl/legendary/releases/download/0.21.1/legendary_windows_x64.exe";
const ENGINE_SHA256: &str = "6be77857dc0a6dd33ea7442ce8b5291944ec6da53757f81ca95b57ce794baf5b";

#[derive(Default)]
pub struct EpicCoordinator {
    busy: AtomicBool,
    cancelled: Arc<AtomicBool>,
}

struct BusyGuard<'a>(&'a EpicCoordinator);
impl Drop for BusyGuard<'_> {
    fn drop(&mut self) {
        self.0.busy.store(false, Ordering::SeqCst);
    }
}
impl EpicCoordinator {
    fn begin(&self) -> Result<BusyGuard<'_>, CommandError> {
        self.busy
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| error("epic_busy", "An Epic account operation is already running."))?;
        self.cancelled.store(false, Ordering::SeqCst);
        Ok(BusyGuard(self))
    }
}

#[derive(Debug, Deserialize)]
struct OwnedGame {
    app_name: String,
    app_title: String,
}

#[derive(Debug, Deserialize)]
struct InstalledGame {
    app_name: String,
    install_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EpicStatus {
    connected: bool,
    count: usize,
}

fn engine_path(base: &Path) -> Result<PathBuf, CommandError> {
    let folder = base.join("engines");
    fs::create_dir_all(&folder)
        .map_err(|_| error("engine_storage", "Could not prepare the engine folder."))?;
    let target = folder.join("legendary-0.21.1.exe");
    if target.is_file() {
        if verify_hash(&target)? {
            return Ok(target);
        }
        return Err(error(
            "engine_hash",
            "The Epic engine failed its integrity check. Remove it and try again.",
        ));
    }
    let staged = folder.join(format!("legendary-{}.download", uuid::Uuid::new_v4()));
    let result = (|| {
        let response = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .map_err(|_| {
                error(
                    "engine_download",
                    "Could not start the Epic engine download.",
                )
            })?
            .get(ENGINE_URL)
            .send()
            .and_then(|r| r.error_for_status())
            .map_err(|_| {
                error(
                    "engine_download",
                    "Could not download the Epic engine from its release page.",
                )
            })?;
        let mut file = fs::File::create(&staged)
            .map_err(|_| error("engine_storage", "Could not save the Epic engine."))?;
        std::io::copy(&mut response.take(40_000_000), &mut file).map_err(|_| {
            error(
                "engine_download",
                "The Epic engine download was interrupted.",
            )
        })?;
        file.flush()
            .map_err(|_| error("engine_storage", "Could not save the Epic engine."))?;
        if !verify_hash(&staged)? {
            return Err(error(
                "engine_hash",
                "The Epic engine download failed its integrity check.",
            ));
        }
        fs::rename(&staged, &target)
            .map_err(|_| error("engine_storage", "Could not activate the Epic engine."))?;
        Ok(target)
    })();
    if result.is_err() {
        let _ = fs::remove_file(staged);
    }
    result
}

fn verify_hash(path: &Path) -> Result<bool, CommandError> {
    let mut file = fs::File::open(path)
        .map_err(|_| error("engine_storage", "Could not read the Epic engine."))?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher)
        .map_err(|_| error("engine_storage", "Could not verify the Epic engine."))?;
    Ok(format!("{:x}", hasher.finalize()) == ENGINE_SHA256)
}

fn configured_command(engine: &Path) -> Result<Command, CommandError> {
    let base = engine.parent().and_then(Path::parent).ok_or_else(|| {
        error(
            "engine_storage",
            "Could not locate the Epic engine configuration.",
        )
    })?;
    let config = base.join("legendary-config");
    fs::create_dir_all(&config).map_err(|_| {
        error(
            "engine_storage",
            "Could not prepare the Epic account folder.",
        )
    })?;
    let mut command = Command::new(engine);
    command.env("LEGENDARY_CONFIG_PATH", config);
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW; the Epic login webview can still open.
    Ok(command)
}

fn run(engine: &Path, args: &[&str]) -> Result<String, CommandError> {
    let output = configured_command(engine)?
        .args(args)
        .output()
        .map_err(|_| error("engine_start", "Could not start the Epic engine."))?;
    if !output.status.success() {
        return Err(error(
            "epic_command",
            "The Epic account operation failed. Check your sign-in and try again.",
        ));
    }
    String::from_utf8(output.stdout)
        .map_err(|_| error("epic_response", "The Epic engine returned unreadable data."))
}

fn parse_games(text: &str) -> Result<Vec<OwnedGame>, CommandError> {
    let games: Vec<OwnedGame> = serde_json::from_str(text).map_err(|_| {
        error(
            "epic_response",
            "The Epic engine returned an unrecognized game list.",
        )
    })?;
    if games
        .iter()
        .any(|g| g.app_name.trim().is_empty() || g.app_title.trim().is_empty())
    {
        return Err(error(
            "epic_response",
            "The Epic engine returned an incomplete game list.",
        ));
    }
    Ok(games)
}

fn authorization_code(input: &str) -> Result<String, CommandError> {
    let trimmed = input.trim();
    let value = if trimmed.starts_with('{') {
        let response: serde_json::Value = serde_json::from_str(trimmed).map_err(|_| {
            error(
                "epic_code",
                "Paste the authorizationCode from the Epic sign-in page.",
            )
        })?;
        response
            .get("authorizationCode")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .to_owned()
    } else {
        trimmed.trim_matches('"').to_owned()
    };
    if value.is_empty()
        || value.len() > 512
        || !value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(error(
            "epic_code",
            "Paste a valid authorizationCode from the Epic sign-in page.",
        ));
    }
    Ok(value)
}

fn sync_games(
    store: &LibraryStore,
    games: &[OwnedGame],
    installed: &HashSet<String>,
) -> Result<usize, CommandError> {
    let mut connection = store.0.lock().map_err(|_| database_error())?;
    let transaction = connection.transaction().map_err(|_| database_error())?;
    for game in games {
        let existing: Option<String> = transaction
            .query_row(
                "SELECT game_id FROM owned_games WHERE provider='epic' AND provider_id=?1",
                [&game.app_name],
                |row| row.get(0),
            )
            .optional()
            .map_err(|_| database_error())?;
        if let Some(id) = existing {
            transaction
                .execute(
                    "UPDATE games SET title=?1 WHERE id=?2",
                    params![game.app_title, id],
                )
                .map_err(|_| database_error())?;
        } else {
            let id = uuid::Uuid::new_v4().to_string();
            transaction.execute("INSERT INTO games(id,title,source,added_at) VALUES(?1,?2,'epic',strftime('%s','now'))",
                params![id, game.app_title]).map_err(|_| database_error())?;
            transaction
                .execute(
                    "INSERT INTO owned_games(provider,provider_id,game_id) VALUES('epic',?1,?2)",
                    params![game.app_name, id],
                )
                .map_err(|_| database_error())?;
        }
        transaction
            .execute(
                "UPDATE owned_games SET installed=?1 WHERE provider='epic' AND provider_id=?2",
                params![i64::from(installed.contains(&game.app_name)), game.app_name],
            )
            .map_err(|_| database_error())?;
    }
    let current = games
        .iter()
        .map(|game| game.app_name.as_str())
        .collect::<HashSet<_>>();
    let stale = {
        let mut statement = transaction
            .prepare("SELECT provider_id, game_id FROM owned_games WHERE provider='epic'")
            .map_err(|_| database_error())?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|_| database_error())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| database_error())?;
        rows
    };
    for (provider_id, game_id) in stale {
        if current.contains(provider_id.as_str()) {
            continue;
        }
        transaction
            .execute(
                "DELETE FROM owned_games WHERE provider='epic' AND provider_id=?1",
                [&provider_id],
            )
            .map_err(|_| database_error())?;
        transaction.execute("DELETE FROM games WHERE id=?1 AND NOT EXISTS(SELECT 1 FROM installations WHERE game_id=?1)", [&game_id])
            .map_err(|_| database_error())?;
    }
    transaction.commit().map_err(|_| database_error())?;
    Ok(games.len())
}

#[tauri::command]
pub async fn epic_connect(
    app: tauri::AppHandle,
    coordinator: State<'_, EpicCoordinator>,
    code: String,
) -> Result<(), CommandError> {
    let _guard = coordinator.begin()?;
    let code = authorization_code(&code)?;
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|_| error("engine_storage", "Could not locate Lezu data."))?;
    tauri::async_runtime::spawn_blocking(move || {
        let engine = engine_path(&base)?;
        run(&engine, &["auth", "--code", &code])?;
        let status = run(&engine, &["status", "--offline", "--json"])?;
        let status: serde_json::Value = serde_json::from_str(&status)
            .map_err(|_| error("epic_response", "Could not verify the Epic sign-in."))?;
        if status
            .get("account")
            .and_then(serde_json::Value::as_str)
            .filter(|name| !name.is_empty() && *name != "<not logged in>")
            .is_none()
        {
            return Err(error(
                "epic_auth",
                "Epic did not accept the code. Open the sign-in page again for a new code.",
            ));
        }
        Ok(())
    })
    .await
    .map_err(|_| error("engine_start", "Epic sign-in stopped unexpectedly."))?
}

#[tauri::command]
pub async fn epic_sync(
    app: tauri::AppHandle,
    store: State<'_, LibraryStore>,
    coordinator: State<'_, EpicCoordinator>,
) -> Result<EpicStatus, CommandError> {
    let _guard = coordinator.begin()?;
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|_| error("engine_storage", "Could not locate Lezu data."))?;
    let (output, installed) = tauri::async_runtime::spawn_blocking(move || {
        let engine = engine_path(&base)?;
        let owned = run(&engine, &["list", "--json"])?;
        let installed = run(&engine, &["list-installed", "--json"])?;
        Ok::<_, CommandError>((owned, installed))
    })
    .await
    .map_err(|_| error("epic_command", "Epic sync stopped unexpectedly."))??;
    let games = parse_games(&output)?;
    let installed: Vec<InstalledGame> = serde_json::from_str(&installed).map_err(|_| {
        error(
            "epic_response",
            "The Epic engine returned an unrecognized installation list.",
        )
    })?;
    let installed = installed
        .into_iter()
        .filter(|g| Path::new(&g.install_path).is_dir())
        .map(|g| g.app_name)
        .collect::<HashSet<_>>();
    let count = sync_games(&store, &games, &installed)?;
    Ok(EpicStatus {
        connected: true,
        count,
    })
}

#[tauri::command]
pub async fn epic_disconnect(
    app: tauri::AppHandle,
    store: State<'_, LibraryStore>,
    coordinator: State<'_, EpicCoordinator>,
) -> Result<(), CommandError> {
    let _guard = coordinator.begin()?;
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|_| error("engine_storage", "Could not locate Lezu data."))?;
    tauri::async_runtime::spawn_blocking(move || {
        let engine = engine_path(&base)?;
        run(&engine, &["auth", "--delete"])?;
        Ok::<_, CommandError>(())
    })
    .await
    .map_err(|_| error("epic_command", "Epic sign-out stopped unexpectedly."))??;
    sync_games(&store, &[], &HashSet::new())?;
    Ok(())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    game_id: String,
    percent: Option<u8>,
    state: &'static str,
}

fn parse_percent(text: &str) -> Option<u8> {
    let at = text.rfind('%')?;
    let before = &text[..at];
    let number: u8 = before
        .split(|c: char| !c.is_ascii_digit() && c != '.')
        .next_back()?
        .split('.')
        .next()?
        .parse()
        .ok()?;
    (number <= 100).then_some(number)
}

fn watch_output<R: Read + Send + 'static>(
    stream: R,
    sender: std::sync::mpsc::Sender<u8>,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let mut stream = std::io::BufReader::new(stream);
        let mut buffer = [0u8; 4096];
        let mut tail = String::new();
        while let Ok(size) = stream.read(&mut buffer) {
            if size == 0 {
                break;
            }
            tail.push_str(&String::from_utf8_lossy(&buffer[..size]));
            if let Some(percent) = parse_percent(&tail) {
                let _ = sender.send(percent);
            }
            if tail.len() > 256 {
                let keep = tail
                    .char_indices()
                    .rev()
                    .take(128)
                    .last()
                    .map(|(index, _)| index)
                    .unwrap_or(0);
                tail.drain(..keep);
            }
        }
    })
}

fn install(
    engine: &Path,
    app_name: &str,
    destination: &Path,
    game_id: &str,
    app: &tauri::AppHandle,
    cancelled: &AtomicBool,
) -> Result<(), CommandError> {
    let mut child = configured_command(engine)?
        .args(["-y", "install", app_name, "--base-path"])
        .arg(destination)
        .args(["--skip-sdl", "--skip-dlcs"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .spawn()
        .map_err(|_| error("engine_start", "Could not start the Epic download."))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| error("engine_start", "Could not read the Epic download."))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| error("engine_start", "Could not read the Epic download."))?;
    let (sender, receiver) = std::sync::mpsc::channel::<u8>();
    let readers = vec![
        watch_output(stdout, sender.clone()),
        watch_output(stderr, sender.clone()),
    ];
    drop(sender);
    let mut last = None;
    let status = loop {
        while let Ok(percent) = receiver.try_recv() {
            if last != Some(percent) {
                last = Some(percent);
                let _ = app.emit(
                    "epic-download-progress",
                    DownloadProgress {
                        game_id: game_id.to_owned(),
                        percent: Some(percent),
                        state: "downloading",
                    },
                );
            }
        }
        if cancelled.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            for reader in readers {
                let _ = reader.join();
            }
            return Err(error(
                "download_cancelled",
                "The Epic download was cancelled.",
            ));
        }
        if let Some(status) = child
            .try_wait()
            .map_err(|_| error("epic_download", "Could not monitor the Epic download."))?
        {
            break status;
        }
        std::thread::sleep(std::time::Duration::from_millis(150));
    };
    for reader in readers {
        let _ = reader.join();
    }
    if !status.success() {
        return Err(error(
            "epic_download",
            "The Epic download failed. Check your connection and free disk space.",
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn epic_cancel_download(coordinator: State<'_, EpicCoordinator>) {
    coordinator.cancelled.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub async fn epic_install(
    app: tauri::AppHandle,
    store: State<'_, LibraryStore>,
    coordinator: State<'_, EpicCoordinator>,
    game_id: String,
    destination: String,
) -> Result<(), CommandError> {
    let _guard = coordinator.begin()?;
    let app_name: String = {
        let connection = store.0.lock().map_err(|_| database_error())?;
        connection
            .query_row(
                "SELECT provider_id FROM owned_games WHERE provider='epic' AND game_id=?1",
                [&game_id],
                |row| row.get(0),
            )
            .map_err(|_| {
                error(
                    "not_owned",
                    "Connect Epic and refresh your owned games first.",
                )
            })?
    };
    let destination = PathBuf::from(destination);
    if !destination.is_dir() {
        return Err(error(
            "invalid_folder",
            "Choose an existing download folder.",
        ));
    }
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|_| error("engine_storage", "Could not locate Lezu data."))?;
    let id = game_id.clone();
    let cancelled = coordinator.cancelled.clone();
    let installed = tauri::async_runtime::spawn_blocking(move || {
        let engine = engine_path(&base)?;
        install(&engine, &app_name, &destination, &id, &app, &cancelled)?;
        let list = run(&engine, &["list-installed", "--json"])?;
        let entries: Vec<InstalledGame> = serde_json::from_str(&list)
            .map_err(|_| error("epic_response", "Could not verify the Epic installation."))?;
        Ok::<_, CommandError>(
            entries
                .into_iter()
                .any(|game| game.app_name == app_name && Path::new(&game.install_path).is_dir()),
        )
    })
    .await
    .map_err(|_| error("epic_download", "The Epic download stopped unexpectedly."))??;
    if !installed {
        return Err(error(
            "epic_download",
            "The Epic engine did not report an installed game.",
        ));
    }
    let connection = store.0.lock().map_err(|_| database_error())?;
    connection
        .execute(
            "UPDATE owned_games SET installed=1 WHERE provider='epic' AND game_id=?1",
            [&game_id],
        )
        .map_err(|_| database_error())?;
    Ok(())
}

#[tauri::command]
pub async fn epic_uninstall(
    app: tauri::AppHandle,
    store: State<'_, LibraryStore>,
    coordinator: State<'_, EpicCoordinator>,
    game_id: String,
) -> Result<(), CommandError> {
    let _guard = coordinator.begin()?;
    let app_name: String = store
        .0
        .lock()
        .map_err(|_| database_error())?
        .query_row(
            "SELECT provider_id FROM owned_games WHERE provider='epic' AND game_id=?1",
            [&game_id],
            |row| row.get(0),
        )
        .map_err(|_| {
            error(
                "not_owned",
                "Connect Epic and refresh your owned games first.",
            )
        })?;
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|_| error("engine_storage", "Could not locate Lezu data."))?;
    tauri::async_runtime::spawn_blocking(move || {
        let engine = engine_path(&base)?;
        run(&engine, &["-y", "uninstall", &app_name])?;
        let list = run(&engine, &["list-installed", "--json"])?;
        let entries: Vec<InstalledGame> = serde_json::from_str(&list)
            .map_err(|_| error("epic_response", "Could not verify the Epic uninstall."))?;
        if entries.iter().any(|game| game.app_name == app_name) {
            return Err(error(
                "epic_uninstall",
                "Epic still reports this game as installed.",
            ));
        }
        Ok::<_, CommandError>(())
    })
    .await
    .map_err(|_| error("epic_uninstall", "Epic uninstall stopped unexpectedly."))??;
    mark_game_uninstalled(&store, "epic", &game_id)
}

#[tauri::command]
pub async fn epic_launch(
    app: tauri::AppHandle,
    store: State<'_, LibraryStore>,
    game_id: String,
) -> Result<(), CommandError> {
    let app_name: String = {
        let connection = store.0.lock().map_err(|_| database_error())?;
        connection.query_row("SELECT provider_id FROM owned_games WHERE provider='epic' AND installed=1 AND game_id=?1",
            [&game_id], |row| row.get(0))
            .map_err(|_| error("not_installed", "Download this Epic game before playing."))?
    };
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|_| error("engine_storage", "Could not locate Lezu data."))?;
    tauri::async_runtime::spawn_blocking(move || {
        let engine = engine_path(&base)?;
        configured_command(&engine)?
            .args(["launch", &app_name])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| error("engine_start", "Could not launch the Epic game."))?;
        Ok(())
    })
    .await
    .map_err(|_| error("engine_start", "Could not launch the Epic game."))?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_legendary_game_list() {
        let list = parse_games(r#"[{"app_name":"Fortnite","app_title":"Fortnite","metadata":{}}]"#)
            .unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].app_name, "Fortnite");
        assert!(parse_games("not json").is_err());
    }
    #[test]
    fn parses_progress_without_exposing_engine_output() {
        assert_eq!(parse_percent("Downloaded 12.8%"), Some(12));
        assert_eq!(parse_percent("Downloaded 101%"), None);
        assert_eq!(parse_percent("waiting"), None);
    }
    #[test]
    fn accepts_only_epic_authorization_codes() {
        assert_eq!(authorization_code("abc123").unwrap(), "abc123");
        assert_eq!(
            authorization_code(r#"{"authorizationCode":"abc123"}"#).unwrap(),
            "abc123"
        );
        assert!(authorization_code("https://example.com").is_err());
        assert!(authorization_code("{invalid").is_err());
    }
    #[test]
    fn owned_sync_updates_install_status_and_removes_stale_games() {
        let directory =
            std::env::temp_dir().join(format!("lezu-epic-test-{}", uuid::Uuid::new_v4()));
        let store = LibraryStore::open(&directory.join("library.db")).unwrap();
        let original = vec![OwnedGame {
            app_name: "one".into(),
            app_title: "Game One".into(),
        }];
        assert_eq!(sync_games(&store, &original, &HashSet::new()).unwrap(), 1);
        let installed = HashSet::from(["one".to_string()]);
        sync_games(&store, &original, &installed).unwrap();
        let installed_flag: i64 = store
            .0
            .lock()
            .unwrap()
            .query_row(
                "SELECT installed FROM owned_games WHERE provider_id='one'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(installed_flag, 1);
        sync_games(&store, &[], &HashSet::new()).unwrap();
        let game_count: i64 = store
            .0
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM games", [], |row| row.get(0))
            .unwrap();
        assert_eq!(game_count, 0);
        drop(store);
        std::fs::remove_dir_all(directory).unwrap();
    }
}
