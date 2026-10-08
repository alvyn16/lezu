mod commands;
mod discovery;
mod library;
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
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
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
            commands::launch_installation,
            commands::reveal_installation,
            commands::scan_folder_preview,
        ])
        .run(tauri::generate_context!())
        .expect("Lezu could not start");
}
