use std::fs;
use std::io::Write;
use std::path::Path;
use std::time::SystemTime;
use tauri::{command, AppHandle, Emitter};
use futures_util::StreamExt;
use crate::models::{DownloadProgress, DownloadResult};

#[command]
pub async fn download_file(
    app: AppHandle,
    id: String,
    url: String,
    path: String,
    api_key: Option<String>,
    overwrite: Option<bool>,
) -> Result<DownloadResult, String> {
    let client = reqwest::Client::new();
    let mut request = client.get(url);
    if let Some(key) = api_key {
        if !key.is_empty() {
            request = request.header("Authorization", format!("Bearer {}", key));
        }
    }

    let response = request.send().await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("HTTP Error: {}", response.status()));
    }
    
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
    if target_path.exists() && !overwrite.unwrap_or(false) {
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

    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);

    let metadata = fs::metadata(&final_path).map_err(|e| e.to_string())?;
    let modified = metadata.modified()
        .map_err(|e| e.to_string())?
        .duration_since(SystemTime::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();

    Ok(DownloadResult {
        path: final_path,
        modified,
    })
}
