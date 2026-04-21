use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use walkdir::WalkDir;
use std::time::SystemTime;
use tauri::command;
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize, Deserialize, Clone)]
pub struct ModelInfo {
    name: String,
    category: String, // 카테고리(폴더명) 추가
    model_path: String,
    preview_path: Option<String>,
    info_path: Option<String>,
    json_path: Option<String>,
    size: u64,
    modified: u64,
}

#[command]
async fn scan_models(path: String) -> Result<Vec<ModelInfo>, String> {
    let mut models = Vec::new();
    let root = Path::new(&path);
    if !root.exists() || !root.is_dir() { return Ok(models); }

    // 스캔 깊이를 조정하여 하위 폴더들을 탐색
    for entry in WalkDir::new(root).max_depth(3).into_iter().filter_map(|e| e.ok()) {
        let file_path = entry.path();
        if let Some(ext) = file_path.extension() {
            let ext_str = ext.to_string_lossy().to_lowercase();
            if ext_str == "safetensors" || ext_str == "ckpt" {
                let stem = file_path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown");
                let metadata = file_path.metadata().map_err(|e| e.to_string())?;
                let modified = metadata.modified().unwrap_or(SystemTime::now()).duration_since(SystemTime::UNIX_EPOCH).unwrap_or_default().as_secs();
                let parent = file_path.parent().unwrap();
                
                // 루트 폴더와 현재 폴더의 관계를 이용해 카테고리 결정
                let category = if parent == root {
                    "기타".to_string()
                } else {
                    parent.file_name().unwrap_or_default().to_string_lossy().to_string()
                };

                let base_name = stem.to_string();

                models.push(ModelInfo {
                    name: base_name.clone(),
                    category,
                    model_path: file_path.to_str().unwrap_or("").to_string(),
                    preview_path: find_preview_file(parent, &base_name),
                    info_path: find_file(parent, &base_name, &["civitai.info"]),
                    json_path: find_file(parent, &base_name, &["json"]),
                    size: metadata.len(),
                    modified,
                });
            }
        }
    }
    Ok(models)
}

fn find_preview_file(parent: &Path, base_name: &str) -> Option<String> {
    let extensions = ["png", "jpg", "jpeg", "webp", "PNG", "JPG", "JPEG", "WEBP"];
    for ext in &extensions {
        let p = parent.join(format!("{}.preview.{}", base_name, ext));
        if p.exists() { return Some(p.to_str().unwrap_or("").to_string()); }
    }
    for ext in &extensions {
        let p = parent.join(format!("{}.{}", base_name, ext));
        if p.exists() { return Some(p.to_str().unwrap_or("").to_string()); }
    }
    None
}

fn find_file(parent: &Path, base_name: &str, extensions: &[&str]) -> Option<String> {
    for ext in extensions {
        let p = parent.join(format!("{}.{}", base_name, ext));
        if p.exists() { return Some(p.to_str().unwrap_or("").to_string()); }
    }
    None
}

#[command]
async fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[command]
async fn delete_files(paths: Vec<String>) -> Result<(), String> {
    for path in paths {
        let p = Path::new(&path);
        if p.exists() { fs::remove_file(p).map_err(|e| format!("{}: {}", path, e))?; }
    }
    Ok(())
}

#[command]
async fn open_browser(app: tauri::AppHandle, url: String) -> Result<(), String> {
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![scan_models, delete_files, read_text_file, open_browser])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
