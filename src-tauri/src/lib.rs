mod artwork;
mod commands;
mod discovery;
mod downloads;
mod engine;
mod epic;
mod gog;
mod launch;
mod library;
mod library_sync;
mod steam;
mod steamgriddb;
mod store_discovery;
mod window;

use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    app_version: &'static str,
    platform: &'static str,
    library_mode: &'static str,
}

#[tauri::command]
fn runtime_info(window: tauri::WebviewWindow) -> Result<RuntimeInfo, &'static str> {
    if window.label() != "main" {
        return Err("This window cannot access desktop information.");
    }
    Ok(RuntimeInfo {
        app_version: env!("CARGO_PKG_VERSION"),
        platform: "windows",
        library_mode: "desktop",
    })
}

pub fn run() {
    tauri::Builder::default()
        .manage(discovery::ScanCoordinator::default())
        .manage(epic::EpicCoordinator::default())
        .manage(gog::GogCoordinator::default())
        .manage(steam::SteamCoordinator::default())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let path = app.path().app_data_dir()?.join("library.db");
            app.manage(library::LibraryStore::open(&path)?);
            let main = app
                .get_webview_window("main")
                .ok_or("Missing main window")?;
            window::configure(&main)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            runtime_info,
            commands::list_library,
            commands::get_library_artwork,
            downloads::list_downloads,
            downloads::begin_download,
            downloads::set_download_progress,
            downloads::finish_download,
            downloads::clear_download_history,
            downloads::get_install_location,
            downloads::set_install_location,
            commands::add_manual_game,
            launch::launch_installation,
            launch::reveal_installation,
            commands::scan_folder_preview,
            commands::cancel_scan,
            store_discovery::discover_stores,
            store_discovery::import_store_games,
            artwork::refresh_artwork,
            artwork::steamgriddb_key_status,
            artwork::set_steamgriddb_key,
            epic::epic_connect,
            epic::epic_sync,
            epic::epic_disconnect,
            epic::epic_install,
            epic::epic_cancel_download,
            epic::epic_launch,
            gog::gog_connect,
            gog::gog_sync,
            gog::gog_disconnect,
            gog::gog_install,
            gog::gog_cancel_download,
            gog::gog_launch,
            steam::steam_connect,
            steam::steam_cancel,
            steam::steam_sync,
            steam::steam_disconnect,
            steam::steam_install,
            steam::steam_launch,
        ])
        .run(tauri::generate_context!())
        .expect("Lezu could not start");
}
