fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "runtime_info",
            "list_library",
            "add_manual_game",
            "launch_installation",
            "reveal_installation",
            "scan_folder_preview",
            "cancel_scan",
            "discover_stores",
            "import_store_games",
            "refresh_artwork",
        ]),
    ))
    .expect("failed to build Lezu desktop resources");
}
