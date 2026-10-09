use crate::{
    commands::{database_error, error, CommandError},
    engine::{verified_engine, EngineSpec},
    library::LibraryStore,
};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tauri::{Manager, State};

const ENGINE: EngineSpec = EngineSpec {
    name: "gogdl-1.3.0.exe",
    url: "https://github.com/Heroic-Games-Launcher/heroic-gogdl/releases/download/v1.3.0/gogdl_windows_x86_64.exe",
    sha256: "69ea54467371803f681d6c39805992e3a4b8ddccb44ac8a1de7b1e3c80deaeec",
};

#[derive(Debug, Deserialize)]
struct Credentials {
    access_token: String,
    #[serde(default)]
    error: bool,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Product {
    id: serde_json::Value,
    title: String,
    works_on: Option<Platforms>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Platforms {
    windows: Option<bool>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LibraryPage {
    products: Vec<Product>,
    total_pages: usize,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GogStatus {
    connected: bool,
    count: usize,
}

#[derive(Default)]
pub struct GogCoordinator {
    busy: AtomicBool,
    cancelled: Arc<AtomicBool>,
}

struct BusyGuard<'a>(&'a GogCoordinator);
impl Drop for BusyGuard<'_> {
    fn drop(&mut self) {
        self.0.busy.store(false, Ordering::SeqCst);
    }
}
impl GogCoordinator {
    fn begin(&self) -> Result<BusyGuard<'_>, CommandError> {
        self.busy
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| error("gog_busy", "A GOG account operation is already running."))?;
        self.cancelled.store(false, Ordering::SeqCst);
        Ok(BusyGuard(self))
    }
}

fn auth_file(base: &Path) -> Result<PathBuf, CommandError> {
    let folder = base.join("gogdl-config");
    fs::create_dir_all(&folder)
        .map_err(|_| error("gog_storage", "Could not prepare the GOG account folder."))?;
    Ok(folder.join("auth.json"))
}

fn command(base: &Path, engine: &Path) -> Result<Command, CommandError> {
    let auth = auth_file(base)?;
    let mut command = Command::new(engine);
    command.args(["--auth-config-path", auth.to_string_lossy().as_ref()]);
    command.env("GOGDL_CONFIG_PATH", base.join("gogdl-config"));
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    Ok(command)
}

fn credentials(
    base: &Path,
    engine: &Path,
    code: Option<&str>,
) -> Result<Credentials, CommandError> {
    let mut command = command(base, engine)?;
    command.arg("auth");
    if let Some(code) = code {
        command.args(["--code", code]);
    }
    let output = command
        .output()
        .map_err(|_| error("gog_start", "Could not start the GOG engine."))?;
    if !output.status.success() {
        return Err(error(
            "gog_auth",
            "GOG did not accept the sign-in. Try a new code.",
        ));
    }
    let account: Option<Credentials> = serde_json::from_slice(&output.stdout)
        .map_err(|_| error("gog_auth", "GOG sign-in returned an unexpected response."))?;
    account
        .filter(|value| !value.error && !value.access_token.is_empty())
        .ok_or_else(|| {
            error(
                "gog_auth",
                "Connect your GOG account before refreshing its library.",
            )
        })
}

fn code_from_input(input: &str) -> Result<String, CommandError> {
    let trimmed = input.trim();
    let code = if trimmed.starts_with("https://") {
        let url = reqwest::Url::parse(trimmed)
            .map_err(|_| error("gog_code", "Paste the GOG redirect URL or its code."))?;
        if url.host_str() != Some("embed.gog.com") || url.path() != "/on_login_success" {
            return Err(error("gog_code", "Paste the GOG redirect URL or its code."));
        }
        url.query_pairs()
            .find(|(key, _)| key == "code")
            .map(|(_, value)| value.to_string())
            .unwrap_or_default()
    } else {
        trimmed.to_owned()
    };
    if code.is_empty()
        || code.len() > 512
        || !code
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || value == '-' || value == '_')
    {
        return Err(error("gog_code", "Paste a valid GOG authorization code."));
    }
    Ok(code)
}

fn library(base: &Path, engine: &Path) -> Result<Vec<(String, String)>, CommandError> {
    let token = credentials(base, engine, None)?.access_token;
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|_| error("gog_library", "Could not prepare the GOG library request."))?;
    let mut games = Vec::new();
    for page in 1..=200 {
        let response = client
            .get("https://embed.gog.com/account/getFilteredProducts")
            .bearer_auth(&token)
            .query(&[("mediaType", "1"), ("page", &page.to_string())])
            .send()
            .and_then(|response| response.error_for_status())
            .map_err(|_| {
                error(
                    "gog_library",
                    "Could not load your GOG library. Sign in again if the session expired.",
                )
            })?;
        let data: LibraryPage = response.json().map_err(|_| {
            error(
                "gog_library",
                "GOG returned an unrecognized library response.",
            )
        })?;
        for item in data.products {
            if item.works_on.as_ref().and_then(|value| value.windows) != Some(true) {
                continue;
            }
            let id = match item.id {
                serde_json::Value::Number(value) => value.to_string(),
                serde_json::Value::String(value) => value,
                _ => continue,
            };
            if !id.is_empty() && !item.title.trim().is_empty() {
                games.push((id, item.title));
            }
        }
        if page >= data.total_pages {
            return Ok(games);
        }
    }
    Err(error(
        "gog_library",
        "GOG returned too many library pages to process safely.",
    ))
}

fn save_library(store: &LibraryStore, games: &[(String, String)]) -> Result<usize, CommandError> {
    let mut connection = store.0.lock().map_err(|_| database_error())?;
    let transaction = connection.transaction().map_err(|_| database_error())?;
    for (provider_id, title) in games {
        let saved_path: Option<String> = transaction
            .query_row(
                "SELECT value FROM preferences WHERE key=?1",
                [format!("gog-install:{provider_id}")],
                |row| row.get(0),
            )
            .optional()
            .map_err(|_| database_error())?;
        let installed = saved_path
            .as_deref()
            .is_some_and(|path| Path::new(path).is_dir());
        let existing: Option<String> = transaction
            .query_row(
                "SELECT game_id FROM owned_games WHERE provider='gog' AND provider_id=?1",
                [provider_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|_| database_error())?;
        if let Some(id) = existing {
            transaction
                .execute("UPDATE games SET title=?1 WHERE id=?2", params![title, id])
                .map_err(|_| database_error())?;
            transaction
                .execute(
                    "UPDATE owned_games SET installed=?1 WHERE provider='gog' AND provider_id=?2",
                    params![i64::from(installed), provider_id],
                )
                .map_err(|_| database_error())?;
        } else {
            let id = transaction
                .query_row(
                    "SELECT game_id FROM installations WHERE source='gog' AND store_id=?1 LIMIT 1",
                    [provider_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .map_err(|_| database_error())?
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            transaction.execute("INSERT OR IGNORE INTO games(id,title,source,added_at) VALUES(?1,?2,'gog',strftime('%s','now'))", params![id, title]).map_err(|_| database_error())?;
            transaction.execute("INSERT INTO owned_games(provider,provider_id,game_id,installed) VALUES('gog',?1,?2,?3)", params![provider_id, id, i64::from(installed)]).map_err(|_| database_error())?;
        }
    }
    let current = games
        .iter()
        .map(|(id, _)| id.as_str())
        .collect::<HashSet<_>>();
    let stale = {
        let mut statement = transaction
            .prepare("SELECT provider_id,game_id FROM owned_games WHERE provider='gog'")
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
        if !current.contains(provider_id.as_str()) {
            transaction
                .execute(
                    "DELETE FROM owned_games WHERE provider='gog' AND provider_id=?1",
                    [provider_id],
                )
                .map_err(|_| database_error())?;
            transaction.execute("DELETE FROM games WHERE id=?1 AND NOT EXISTS(SELECT 1 FROM installations WHERE game_id=?1)", [game_id]).map_err(|_| database_error())?;
        }
    }
    transaction.commit().map_err(|_| database_error())?;
    Ok(games.len())
}

#[tauri::command]
pub async fn gog_connect(
    app: tauri::AppHandle,
    coordinator: State<'_, GogCoordinator>,
    code: String,
) -> Result<(), CommandError> {
    let _guard = coordinator.begin()?;
    let code = code_from_input(&code)?;
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|_| error("gog_storage", "Could not locate Lezu data."))?;
    tauri::async_runtime::spawn_blocking(move || {
        let engine = verified_engine(&base, &ENGINE)?;
        credentials(&base, &engine, Some(&code))?;
        Ok::<_, CommandError>(())
    })
    .await
    .map_err(|_| error("gog_auth", "GOG sign-in stopped unexpectedly."))?
}

#[tauri::command]
pub async fn gog_sync(
    app: tauri::AppHandle,
    store: State<'_, LibraryStore>,
    coordinator: State<'_, GogCoordinator>,
) -> Result<GogStatus, CommandError> {
    let _guard = coordinator.begin()?;
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|_| error("gog_storage", "Could not locate Lezu data."))?;
    let games = tauri::async_runtime::spawn_blocking(move || {
        let engine = verified_engine(&base, &ENGINE)?;
        library(&base, &engine)
    })
    .await
    .map_err(|_| error("gog_library", "GOG sync stopped unexpectedly."))??;
    let count = save_library(&store, &games)?;
    Ok(GogStatus {
        connected: true,
        count,
    })
}

#[tauri::command]
pub fn gog_disconnect(
    app: tauri::AppHandle,
    store: State<'_, LibraryStore>,
    coordinator: State<'_, GogCoordinator>,
) -> Result<(), CommandError> {
    let _guard = coordinator.begin()?;
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|_| error("gog_storage", "Could not locate Lezu data."))?;
    let auth = auth_file(&base)?;
    if auth.is_file() {
        fs::remove_file(auth)
            .map_err(|_| error("gog_storage", "Could not remove the GOG session."))?;
    }
    save_library(&store, &[])?;
    Ok(())
}

fn owned_id(store: &LibraryStore, game_id: &str) -> Result<String, CommandError> {
    let connection = store.0.lock().map_err(|_| database_error())?;
    connection
        .query_row(
            "SELECT provider_id FROM owned_games WHERE provider='gog' AND game_id=?1",
            [game_id],
            |row| row.get(0),
        )
        .map_err(|_| {
            error(
                "not_owned",
                "Connect GOG and refresh your owned games first.",
            )
        })
}

#[tauri::command]
pub fn gog_cancel_download(coordinator: State<'_, GogCoordinator>) {
    coordinator.cancelled.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub async fn gog_install(
    app: tauri::AppHandle,
    store: State<'_, LibraryStore>,
    coordinator: State<'_, GogCoordinator>,
    game_id: String,
    destination: String,
) -> Result<(), CommandError> {
    let _guard = coordinator.begin()?;
    let product_id = owned_id(&store, &game_id)?;
    if !product_id.chars().all(|c| c.is_ascii_digit()) {
        return Err(error("gog_id", "This GOG game has an invalid product ID."));
    }
    let parent = PathBuf::from(destination);
    if !parent.is_dir() {
        return Err(error(
            "invalid_folder",
            "Choose an existing download folder.",
        ));
    }
    let target = parent.join(format!("GOG-{product_id}"));
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|_| error("gog_storage", "Could not locate Lezu data."))?;
    let cancelled = coordinator.cancelled.clone();
    let install_id = product_id.clone();
    let target = tauri::async_runtime::spawn_blocking(move || {
        let engine = verified_engine(&base, &ENGINE)?;
        fs::create_dir_all(&target)
            .map_err(|_| error("gog_storage", "Could not prepare the GOG game folder."))?;
        let mut child = command(&base, &engine)?
            .arg("download")
            .arg(&install_id)
            .arg("--path")
            .arg(&target)
            .args(["--platform", "windows", "--skip-dlcs"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| error("gog_start", "Could not start the GOG download."))?;
        loop {
            if cancelled.load(Ordering::SeqCst) {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error(
                    "download_cancelled",
                    "The GOG download was cancelled.",
                ));
            }
            if let Some(status) = child
                .try_wait()
                .map_err(|_| error("gog_download", "Could not monitor the GOG download."))?
            {
                if !status.success() {
                    return Err(error(
                        "gog_download",
                        "The GOG download failed. Check your connection and free disk space.",
                    ));
                }
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(150));
        }
        if !target
            .read_dir()
            .map_err(|_| error("gog_download", "Could not verify the GOG files."))?
            .next()
            .is_some()
        {
            return Err(error(
                "gog_download",
                "The GOG engine did not write game files.",
            ));
        }
        Ok::<_, CommandError>(target)
    })
    .await
    .map_err(|_| error("gog_download", "The GOG download stopped unexpectedly."))??;
    let connection = store.0.lock().map_err(|_| database_error())?;
    connection.execute("INSERT INTO preferences(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![format!("gog-install:{product_id}"), target.to_string_lossy()]).map_err(|_| database_error())?;
    connection
        .execute(
            "UPDATE owned_games SET installed=1 WHERE provider='gog' AND game_id=?1",
            [game_id],
        )
        .map_err(|_| database_error())?;
    Ok(())
}

#[tauri::command]
pub async fn gog_launch(
    app: tauri::AppHandle,
    store: State<'_, LibraryStore>,
    game_id: String,
) -> Result<(), CommandError> {
    let product_id = owned_id(&store, &game_id)?;
    let path: String = store
        .0
        .lock()
        .map_err(|_| database_error())?
        .query_row(
            "SELECT value FROM preferences WHERE key=?1",
            [format!("gog-install:{product_id}")],
            |row| row.get(0),
        )
        .map_err(|_| error("not_installed", "Download this GOG game before playing."))?;
    if !Path::new(&path).is_dir() {
        return Err(error(
            "not_installed",
            "The GOG game folder is missing. Download it again.",
        ));
    }
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|_| error("gog_storage", "Could not locate Lezu data."))?;
    tauri::async_runtime::spawn_blocking(move || {
        let engine = verified_engine(&base, &ENGINE)?;
        command(&base, &engine)?
            .arg("launch")
            .arg(&path)
            .arg(&product_id)
            .args(["--platform", "windows"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| error("gog_start", "Could not launch the GOG game."))?;
        Ok::<_, CommandError>(())
    })
    .await
    .map_err(|_| error("gog_start", "Could not launch the GOG game."))?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_gog_code_or_redirect_url() {
        assert_eq!(code_from_input("ABC123").unwrap(), "ABC123");
        assert_eq!(
            code_from_input("https://embed.gog.com/on_login_success?origin=client&code=ABC123")
                .unwrap(),
            "ABC123"
        );
        assert!(code_from_input("https://example.com/?code=ABC123").is_err());
    }
    #[test]
    fn sync_retains_installed_flag_only_for_existing_folder() {
        let directory =
            std::env::temp_dir().join(format!("lezu-gog-test-{}", uuid::Uuid::new_v4()));
        let store = LibraryStore::open(&directory.join("library.db")).unwrap();
        let folder = directory.join("installed");
        std::fs::create_dir_all(&folder).unwrap();
        store
            .0
            .lock()
            .unwrap()
            .execute(
                "INSERT INTO preferences(key,value) VALUES('gog-install:11',?1)",
                [folder.to_string_lossy().to_string()],
            )
            .unwrap();
        let games = vec![("11".to_owned(), "Game One".to_owned())];
        assert_eq!(save_library(&store, &games).unwrap(), 1);
        let installed: i64 = store
            .0
            .lock()
            .unwrap()
            .query_row(
                "SELECT installed FROM owned_games WHERE provider='gog'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(installed, 1);
        std::fs::remove_dir(&folder).unwrap();
        save_library(&store, &games).unwrap();
        let installed: i64 = store
            .0
            .lock()
            .unwrap()
            .query_row(
                "SELECT installed FROM owned_games WHERE provider='gog'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(installed, 0);
        drop(store);
        std::fs::remove_dir_all(directory).unwrap();
    }
}
