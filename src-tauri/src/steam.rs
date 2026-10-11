use crate::{
    commands::{database_error, error, mark_game_uninstalled, CommandError},
    engine::{verified_engine, EngineSpec},
    library::LibraryStore,
};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    collections::HashSet,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};
use tauri::{Emitter, Manager, State};

const ENGINE: EngineSpec = EngineSpec {
    name: "aurelia-0.1.38.exe",
    url:
        "https://github.com/Drackrath/Aurelia/releases/download/v0.1.38/aurelia_windows_x86_64.exe",
    sha256: "31dc203e0c97b8a1b13845d8193103b5fa04a2b5e44756e7ee6bd3d6eb0fd4fd",
};

#[derive(Default)]
pub struct SteamCoordinator {
    busy: AtomicBool,
    cancelled: Arc<AtomicBool>,
}
struct BusyGuard<'a>(&'a SteamCoordinator);
impl Drop for BusyGuard<'_> {
    fn drop(&mut self) {
        self.0.busy.store(false, Ordering::SeqCst);
    }
}
impl SteamCoordinator {
    fn begin(&self) -> Result<BusyGuard<'_>, CommandError> {
        self.busy
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| {
                error(
                    "steam_busy",
                    "A Steam account operation is already running.",
                )
            })?;
        self.cancelled.store(false, Ordering::SeqCst);
        Ok(BusyGuard(self))
    }
}

#[derive(Deserialize)]
struct Health {
    logged_in: bool,
}
#[derive(Deserialize)]
struct SteamGame {
    app_id: u64,
    name: String,
    is_owned: bool,
    is_installed: bool,
    install_path: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamStatus {
    connected: bool,
    count: usize,
}
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LoginEvent {
    status: &'static str,
    url: Option<String>,
}

fn command(base: &Path, engine: &Path) -> Command {
    let mut cmd = Command::new(engine);
    cmd.env("AURELIA_CONFIG_DIR", base.join("aurelia-config"))
        .env("AURELIA_NO_DAEMON", "1");
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    cmd
}
fn base_path(app: &tauri::AppHandle) -> Result<PathBuf, CommandError> {
    app.path()
        .app_local_data_dir()
        .map_err(|_| error("steam_storage", "Could not locate Lezu data."))
}
fn health(base: &Path, engine: &Path) -> Result<bool, CommandError> {
    let output = command(base, engine)
        .args(["--json", "login", "--health"])
        .output()
        .map_err(|_| error("steam_start", "Could not start the Steam engine."))?;
    if !output.status.success() {
        return Err(error("steam_auth", "Could not check the Steam session."));
    }
    serde_json::from_slice::<Health>(&output.stdout)
        .map(|value| value.logged_in)
        .map_err(|_| {
            error(
                "steam_auth",
                "Steam returned an unexpected session response.",
            )
        })
}
fn require_login(base: &Path, engine: &Path) -> Result<(), CommandError> {
    if health(base, engine)? {
        Ok(())
    } else {
        Err(error(
            "steam_auth",
            "Connect your Steam account with the mobile QR code first.",
        ))
    }
}
fn valid_qr_url(url: &str) -> bool {
    reqwest::Url::parse(url).ok().is_some_and(|value| {
        value.scheme() == "https"
            && value.host_str() == Some("s.team")
            && value.path().starts_with("/q/")
    })
}

#[tauri::command]
pub async fn steam_connect(
    app: tauri::AppHandle,
    coordinator: State<'_, SteamCoordinator>,
) -> Result<(), CommandError> {
    let _guard = coordinator.begin()?;
    let base = base_path(&app)?;
    let cancelled = coordinator.cancelled.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let engine = verified_engine(&base, &ENGINE)?;
        if health(&base, &engine)? {
            return Ok(());
        }
        let mut child = command(&base, &engine)
            .args(["--json", "login", "--qr"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|_| error("steam_start", "Could not start Steam QR sign-in."))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| error("steam_auth", "Could not read the Steam QR code."))?;
        let events = app.clone();
        let reader = std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) {
                    match value.get("event").and_then(|item| item.as_str()) {
                        Some("qr_challenge") => {
                            if let Some(url) = value
                                .get("url")
                                .and_then(|item| item.as_str())
                                .filter(|url| valid_qr_url(url))
                            {
                                let _ = events.emit(
                                    "steam-login-event",
                                    LoginEvent {
                                        status: "qr",
                                        url: Some(url.to_owned()),
                                    },
                                );
                            }
                        }
                        Some("qr_scanned") => {
                            let _ = events.emit(
                                "steam-login-event",
                                LoginEvent {
                                    status: "scanned",
                                    url: None,
                                },
                            );
                        }
                        _ => {}
                    }
                }
            }
        });
        let result = loop {
            if cancelled.load(Ordering::SeqCst) {
                let _ = child.kill();
                let _ = child.wait();
                break Err(error("steam_cancelled", "Steam sign-in was cancelled."));
            }
            match child.try_wait() {
                Ok(Some(status)) if status.success() => break require_login(&base, &engine),
                Ok(Some(_)) => {
                    break Err(error(
                        "steam_auth",
                        "Steam sign-in failed or timed out. Try again.",
                    ))
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(150)),
                Err(_) => break Err(error("steam_auth", "Could not monitor Steam sign-in.")),
            }
        };
        let _ = reader.join();
        result
    })
    .await
    .map_err(|_| error("steam_auth", "Steam sign-in stopped unexpectedly."))?
}

#[tauri::command]
pub fn steam_cancel(coordinator: State<'_, SteamCoordinator>) {
    coordinator.cancelled.store(true, Ordering::SeqCst);
}

fn load_games(base: &Path, engine: &Path) -> Result<Vec<SteamGame>, CommandError> {
    require_login(base, engine)?;
    let output = command(base, engine)
        .args(["--json", "list"])
        .output()
        .map_err(|_| error("steam_library", "Could not load the Steam library."))?;
    if !output.status.success() {
        return Err(error(
            "steam_library",
            "Steam did not return your owned games.",
        ));
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|_| error("steam_library", "Steam returned an unrecognized game list."))
}

fn save_library(store: &LibraryStore, games: &[SteamGame]) -> Result<usize, CommandError> {
    let mut connection = store.0.lock().map_err(|_| database_error())?;
    let tx = connection.transaction().map_err(|_| database_error())?;
    let mut current = HashSet::new();
    for game in games
        .iter()
        .filter(|game| game.is_owned && !game.name.trim().is_empty())
    {
        let provider_id = game.app_id.to_string();
        current.insert(provider_id.clone());
        let existing: Option<String> = tx
            .query_row(
                "SELECT game_id FROM owned_games WHERE provider='steam' AND provider_id=?1",
                [&provider_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|_| database_error())?;
        let id = if let Some(id) = existing {
            id
        } else {
            tx.query_row(
                "SELECT game_id FROM installations WHERE source='steam' AND store_id=?1 LIMIT 1",
                [&provider_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|_| database_error())?
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string())
        };
        tx.execute("INSERT OR IGNORE INTO games(id,title,source,added_at) VALUES(?1,?2,'steam',strftime('%s','now'))", params![id, game.name]).map_err(|_| database_error())?;
        tx.execute(
            "UPDATE games SET title=?1 WHERE id=?2",
            params![game.name, id],
        )
        .map_err(|_| database_error())?;
        tx.execute("INSERT INTO owned_games(provider,provider_id,game_id,installed) VALUES('steam',?1,?2,?3) ON CONFLICT(provider,provider_id) DO UPDATE SET installed=excluded.installed", params![provider_id, id, i64::from(game.is_installed && game.install_path.as_deref().is_some_and(|path| Path::new(path).is_dir()))]).map_err(|_| database_error())?;
    }
    let stale = {
        let mut statement = tx
            .prepare("SELECT provider_id,game_id FROM owned_games WHERE provider='steam'")
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
    for (provider_id, id) in stale {
        if !current.contains(&provider_id) {
            tx.execute(
                "DELETE FROM owned_games WHERE provider='steam' AND provider_id=?1",
                [&provider_id],
            )
            .map_err(|_| database_error())?;
            tx.execute("DELETE FROM games WHERE id=?1 AND NOT EXISTS(SELECT 1 FROM installations WHERE game_id=?1)", [&id]).map_err(|_| database_error())?;
        }
    }
    tx.commit().map_err(|_| database_error())?;
    Ok(current.len())
}

#[tauri::command]
pub async fn steam_sync(
    app: tauri::AppHandle,
    store: State<'_, LibraryStore>,
    coordinator: State<'_, SteamCoordinator>,
) -> Result<SteamStatus, CommandError> {
    let _guard = coordinator.begin()?;
    let base = base_path(&app)?;
    let games = tauri::async_runtime::spawn_blocking(move || {
        let engine = verified_engine(&base, &ENGINE)?;
        load_games(&base, &engine)
    })
    .await
    .map_err(|_| error("steam_library", "Steam sync stopped unexpectedly."))??;
    let count = save_library(&store, &games)?;
    Ok(SteamStatus {
        connected: true,
        count,
    })
}

#[tauri::command]
pub async fn steam_disconnect(
    app: tauri::AppHandle,
    store: State<'_, LibraryStore>,
    coordinator: State<'_, SteamCoordinator>,
) -> Result<(), CommandError> {
    let _guard = coordinator.begin()?;
    let base = base_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let engine = verified_engine(&base, &ENGINE)?;
        let result = command(&base, &engine)
            .args(["--json", "logout"])
            .output()
            .map_err(|_| error("steam_auth", "Could not sign out of Steam."))?;
        if !result.status.success() {
            return Err(error("steam_auth", "Steam did not sign out."));
        }
        Ok::<_, CommandError>(())
    })
    .await
    .map_err(|_| error("steam_auth", "Steam sign-out stopped unexpectedly."))??;
    save_library(&store, &[])?;
    Ok(())
}

fn owned_app_id(store: &LibraryStore, game_id: &str) -> Result<String, CommandError> {
    store
        .0
        .lock()
        .map_err(|_| database_error())?
        .query_row(
            "SELECT provider_id FROM owned_games WHERE provider='steam' AND game_id=?1",
            [game_id],
            |row| row.get(0),
        )
        .map_err(|_| {
            error(
                "not_owned",
                "Connect Steam and refresh your owned games first.",
            )
        })
}

#[tauri::command]
pub async fn steam_install(
    app: tauri::AppHandle,
    store: State<'_, LibraryStore>,
    coordinator: State<'_, SteamCoordinator>,
    game_id: String,
    destination: String,
) -> Result<(), CommandError> {
    let _guard = coordinator.begin()?;
    let app_id = owned_app_id(&store, &game_id)?;
    if !app_id.chars().all(|c| c.is_ascii_digit()) {
        return Err(error("steam_id", "This Steam game has an invalid app ID."));
    }
    let library = PathBuf::from(destination);
    if !library.is_dir() || !library.join("steamapps").is_dir() {
        return Err(error(
            "steam_folder",
            "Choose a Steam library folder containing a steamapps folder.",
        ));
    }
    let base = base_path(&app)?;
    let cancelled = coordinator.cancelled.clone();
    let verify_id = app_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let engine = verified_engine(&base, &ENGINE)?;
        require_login(&base, &engine)?;
        let mut child = command(&base, &engine)
            .args(["--json", "install", &app_id, "--platform", "windows", "--library"])
            .arg(&library).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
            .spawn().map_err(|_| error("steam_start", "Could not start the Steam download."))?;
        loop {
            if cancelled.load(Ordering::SeqCst) {
                let _ = child.kill(); let _ = child.wait();
                return Err(error("download_cancelled", "The Steam download was cancelled."));
            }
            match child.try_wait() {
                Ok(Some(status)) if status.success() => break,
                Ok(Some(_)) => return Err(error("steam_download", "The Steam download failed. Check the Steam session, disk space, and connection.")),
                Ok(None) => std::thread::sleep(Duration::from_millis(150)),
                Err(_) => return Err(error("steam_download", "Could not monitor the Steam download.")),
            }
        }
        Ok::<_, CommandError>(())
    }).await.map_err(|_| error("steam_download", "The Steam download stopped unexpectedly."))??;
    // The engine owns the install manifest. Refresh from it before showing a Play action.
    let base = base_path(&app)?;
    let games = tauri::async_runtime::spawn_blocking(move || {
        let engine = verified_engine(&base, &ENGINE)?;
        load_games(&base, &engine)
    })
    .await
    .map_err(|_| error("steam_library", "Could not verify the Steam installation."))??;
    let installed = games.iter().any(|game| {
        game.app_id.to_string() == verify_id
            && game.is_installed
            && game
                .install_path
                .as_deref()
                .is_some_and(|path| Path::new(path).is_dir())
    });
    if !installed {
        return Err(error("steam_download", "Steam finished without a verified installation. Refresh your Steam library and try again."));
    }
    save_library(&store, &games)?;
    Ok(())
}

#[tauri::command]
pub async fn steam_uninstall(
    app: tauri::AppHandle,
    store: State<'_, LibraryStore>,
    coordinator: State<'_, SteamCoordinator>,
    game_id: String,
) -> Result<(), CommandError> {
    let _guard = coordinator.begin()?;
    let app_id = owned_app_id(&store, &game_id)?;
    if !app_id.chars().all(|c| c.is_ascii_digit()) {
        return Err(error("steam_id", "This Steam game has an invalid app ID."));
    }
    let base = base_path(&app)?;
    let verify_id = app_id.clone();
    let games = tauri::async_runtime::spawn_blocking(move || {
        let engine = verified_engine(&base, &ENGINE)?;
        require_login(&base, &engine)?;
        let status = command(&base, &engine)
            .args(["--json", "uninstall", &app_id])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|_| error("steam_uninstall", "Could not start Steam uninstall."))?;
        if !status.success() {
            return Err(error(
                "steam_uninstall",
                "Steam could not uninstall this game.",
            ));
        }
        load_games(&base, &engine)
    })
    .await
    .map_err(|_| error("steam_uninstall", "Steam uninstall stopped unexpectedly."))??;
    if games
        .iter()
        .any(|game| game.app_id.to_string() == verify_id && game.is_installed)
    {
        return Err(error(
            "steam_uninstall",
            "Steam still reports this game as installed. Refresh Steam and try again.",
        ));
    }
    save_library(&store, &games)?;
    mark_game_uninstalled(&store, "steam", &game_id)
}

#[tauri::command]
pub async fn steam_launch(
    app: tauri::AppHandle,
    store: State<'_, LibraryStore>,
    game_id: String,
) -> Result<(), CommandError> {
    let app_id = owned_app_id(&store, &game_id)?;
    let base = base_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let engine = verified_engine(&base, &ENGINE)?;
        require_login(&base, &engine)?;
        command(&base, &engine)
            .args(["--json", "play", &app_id])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| error("steam_start", "Could not launch the Steam game."))?;
        Ok::<_, CommandError>(())
    })
    .await
    .map_err(|_| error("steam_start", "Could not launch the Steam game."))?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn qr_links_must_be_steam_mobile_links() {
        assert!(valid_qr_url("https://s.team/q/12345"));
        assert!(!valid_qr_url("https://s.team.evil.test/q/12345"));
        assert!(!valid_qr_url("http://s.team/q/12345"));
    }
    #[test]
    fn sync_keeps_only_owned_games_and_reconciles_installations() {
        let directory =
            std::env::temp_dir().join(format!("lezu-steam-test-{}", uuid::Uuid::new_v4()));
        let store = LibraryStore::open(&directory.join("library.db")).unwrap();
        let folder = directory.join("installed");
        std::fs::create_dir_all(&folder).unwrap();
        let mut games = vec![
            SteamGame {
                app_id: 11,
                name: "Owned".into(),
                is_owned: true,
                is_installed: false,
                install_path: None,
            },
            SteamGame {
                app_id: 22,
                name: "Local only".into(),
                is_owned: false,
                is_installed: true,
                install_path: Some(folder.to_string_lossy().into_owned()),
            },
        ];
        assert_eq!(save_library(&store, &games).unwrap(), 1);
        games[0].is_installed = true;
        games[0].install_path = Some(folder.to_string_lossy().into_owned());
        save_library(&store, &games).unwrap();
        let installed: i64 = store
            .0
            .lock()
            .unwrap()
            .query_row(
                "SELECT installed FROM owned_games WHERE provider='steam'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(installed, 1);
        save_library(&store, &[]).unwrap();
        let count: i64 = store
            .0
            .lock()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM owned_games WHERE provider='steam'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
        drop(store);
        std::fs::remove_dir_all(directory).unwrap();
    }
}
