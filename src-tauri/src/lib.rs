mod artwork;
mod commands;
mod discovery;
mod epic;
mod launch;
mod library;
mod library_sync;
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
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
            commands::add_manual_game,
            launch::launch_installation,
            launch::reveal_installation,
            commands::scan_folder_preview,
            commands::cancel_scan,
            store_discovery::discover_stores,
            store_discovery::import_store_games,
            artwork::refresh_artwork,
            epic::epic_connect,
            epic::epic_sync,
            epic::epic_disconnect,
            epic::epic_install,
            epic::epic_cancel_download,
            epic::epic_launch,
        ])
        .run(tauri::generate_context!())
        .expect("Lezu could not start");
}
