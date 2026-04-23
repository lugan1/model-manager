pub mod models;
pub mod commands;

use commands::{fs, scanner, download};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            // 메인 윈도우를 가져와서 준비가 되면 표시
            if let Some(window) = app.get_webview_window("main") {
                window.show().unwrap();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scanner::scan_models,
            scanner::calculate_model_hash,
            fs::delete_files,
            fs::read_text_file,
            fs::write_text_file,
            fs::exists,
            fs::open_folder,
            download::download_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
