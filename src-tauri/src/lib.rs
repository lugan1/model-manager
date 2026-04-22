use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Write, Read, BufReader};
use std::path::Path;
use walkdir::WalkDir;
use std::time::SystemTime;
use tauri::{command, AppHandle, Emitter};
use futures_util::StreamExt;
use sha2::{Digest, Sha256};

#[derive(Serialize, Deserialize, Clone)]
pub struct ModelInfo {
    pub name: String,
    pub category: String,
    pub model_path: String,
    pub preview_path: Option<String>,
    pub info_path: Option<String>,
    pub json_path: Option<String>,
    pub size: u64,
    pub modified: u64,
}

#[command]
async fn scan_models(path: String) -> Result<Vec<ModelInfo>, String> {
    let mut models = Vec::new();
    let walker = WalkDir::new(&path).into_iter();

    for entry in walker.filter_map(|e| e.ok()) {
        let path_buf = entry.path();
        if path_buf.is_file() {
            if let Some(ext) = path_buf.extension() {
                if ext == "safetensors" || ext == "ckpt" {
                    let file_name = path_buf.file_stem().unwrap().to_string_lossy().to_string();
                    let parent = path_buf.parent().unwrap();
                    
                    let preview_extensions = ["preview.png", "preview.jpg", "preview.jpeg", "preview.webp", "png", "jpg", "jpeg", "webp"];
                    let mut preview_path = None;
                    for p_ext in preview_extensions {
                        let p_path = parent.join(format!("{}.{}", file_name, p_ext));
                        if p_path.exists() {
                            preview_path = Some(p_path.to_string_lossy().to_string());
                            break;
                        }
                    }

                    let info_path = parent.join(format!("{}.civitai.info", file_name));
                    let json_path = parent.join(format!("{}.json", file_name));

                    let metadata = fs::metadata(path_buf).map_err(|e| e.to_string())?;
                    let modified = metadata.modified()
                        .unwrap_or(SystemTime::now())
                        .duration_since(SystemTime::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();

                    models.push(ModelInfo {
                        name: file_name,
                        category: parent.file_name().unwrap_or_default().to_string_lossy().to_string(),
                        model_path: path_buf.to_string_lossy().to_string(),
                        preview_path,
                        info_path: if info_path.exists() { Some(info_path.to_string_lossy().to_string()) } else { None },
                        json_path: if json_path.exists() { Some(json_path.to_string_lossy().to_string()) } else { None },
                        size: metadata.len(),
                        modified,
                    });
                }
            }
        }
    }
    Ok(models)
}

#[command]
async fn delete_files(paths: Vec<String>) -> Result<(), String> {
    for path in paths {
        let p = Path::new(&path);
        if p.exists() {
            fs::remove_file(p).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[command]
async fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[command]
async fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
}

#[command]
async fn open_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("explorer")
            .arg("/select,")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let p = Path::new(&path);
        let parent = p.parent().unwrap_or(p);
        opener::open(parent).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[command]
async fn calculate_model_hash(path: String) -> Result<String, String> {
    use std::io::{Seek, SeekFrom};
    
    let mut file = fs::File::open(&path).map_err(|e| e.to_string())?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    let file_size = metadata.len();

    // Civitai Helper / AutoV1 방식: 1MB 오프셋에서 64KB만 읽음
    // 파일이 너무 작으면 처음부터 읽음
    let offset = if file_size > 1024 * 1024 + 65536 {
        1024 * 1024
    } else {
        0
    };

    file.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
    
    let mut buffer = vec![0; 65536];
    let count = file.read(&mut buffer).map_err(|e| e.to_string())?;
    
    let mut hasher = Sha256::new();
    hasher.update(&buffer[..count]);
    let full_hash = hex::encode(hasher.finalize());
    
    // AutoV1은 보통 이 해시의 앞 8글자를 사용하지만, 
    // Civitai API는 64글자 전체를 보내도 해당 청크의 해시로 인식함
    Ok(full_hash)
}

#[derive(Clone, Serialize)]
struct DownloadProgress {
    id: String,
    received: u64,
    total: Option<u64>,
    speed: f64,
}

#[command]
async fn download_file(
    app: AppHandle,
    id: String,
    url: String,
    path: String,
    api_key: Option<String>,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let mut request = client.get(url);
    if let Some(key) = api_key {
        if !key.is_empty() {
            request = request.header("Authorization", format!("Bearer {}", key));
        }
    }

    let response = request.send().await.map_err(|e| e.to_string())?;
    
    // 확장자 자동 판별 로직
    let mut final_path = path.clone();
    let content_type = response.headers().get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if path.ends_with(".preview.png") {
        let ext = if content_type.contains("webp") { "webp" }
                 else if content_type.contains("jpeg") { "jpg" }
                 else if content_type.contains("avif") { "avif" }
                 else { "png" };
        final_path = path.replace(".preview.png", &format!(".preview.{}", ext));
    }

    let target_path = Path::new(&final_path);
    if target_path.exists() {
        return Err("FILE_ALREADY_EXISTS".to_string());
    }

    let total_size = response.content_length();
    let mut stream = response.bytes_stream();

    let mut file = fs::File::create(&final_path).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut last_emit = std::time::Instant::now();
    let start_time = std::time::Instant::now();

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;

        if last_emit.elapsed().as_millis() >= 100 {
            let elapsed = start_time.elapsed().as_secs_f64();
            let speed = if elapsed > 0.0 { downloaded as f64 / elapsed } else { 0.0 };
            
            app.emit("download-progress", DownloadProgress {
                id: id.clone(),
                received: downloaded,
                total: total_size,
                speed,
            }).map_err(|e| e.to_string())?;
            last_emit = std::time::Instant::now();
        }
    }

    Ok(final_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            scan_models, delete_files, read_text_file, 
            download_file, write_text_file, open_folder, calculate_model_hash
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
