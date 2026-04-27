use std::fs;
use std::path::Path;
use std::time::SystemTime;
use jwalk::WalkDir;
use tauri::command;
use crate::models::ModelInfo;

#[command]
pub async fn scan_models(path: String) -> Result<Vec<ModelInfo>, String> {
    let mut models = Vec::new();

    // jwalk를 사용하여 병렬 탐색 수행
    for entry in WalkDir::new(&path).into_iter().filter_map(|e| e.ok()) {
        let path_buf = entry.path();
        if path_buf.is_file() {
            if let Some(ext) = path_buf.extension() {
                let ext_str = ext.to_string_lossy().to_lowercase();
                if ext_str == "safetensors" || ext_str == "ckpt" || ext_str == "lyco" {
                    let file_name = path_buf.file_stem().unwrap().to_string_lossy().to_string();
                    let parent = path_buf.parent().unwrap();
                    
                    // 프리뷰 확장자 체크
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

                    let metadata = fs::metadata(&path_buf).map_err(|e| e.to_string())?;
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
pub async fn calculate_model_hash(path: String) -> Result<String, String> {
    use tokio::io::{AsyncReadExt, AsyncSeekExt};
    use std::io::SeekFrom;
    use serde_json::Value;
    
    let mut file = tokio::fs::File::open(&path).await.map_err(|e| e.to_string())?;

    // --- Fast Path: Safetensors Metadata Header ---
    let mut header_size_buf = [0u8; 8];
    if file.read_exact(&mut header_size_buf).await.is_ok() {
        let header_size = u64::from_le_bytes(header_size_buf);
        
        if header_size > 0 && header_size < 100 * 1024 * 1024 {
            let mut header_buf = vec![0u8; header_size as usize];
            if file.read_exact(&mut header_buf).await.is_ok() {
                if let Ok(header_json) = serde_json::from_slice::<Value>(&header_buf) {
                    if let Some(metadata) = header_json.get("__metadata__") {
                        let hash_keys = [
                            "modelspec.hash_sha256",
                            "ssmd_version",
                            "ss_hash",
                            "civitai_hash"
                        ];
                        
                        for key in hash_keys {
                            if let Some(h) = metadata.get(key).and_then(|v| v.as_str()) {
                                if h.len() >= 8 {
                                    return Ok(h.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // --- Slow Path: Full File BLAKE3 Hashing ---
    file.seek(SeekFrom::Start(0)).await.map_err(|e| e.to_string())?;
    let mut hasher = blake3::Hasher::new();
    let mut buffer = [0; 1024 * 1024]; 
    
    loop {
        let count = file.read(&mut buffer).await.map_err(|e| e.to_string())?;
        if count == 0 { break; }
        hasher.update(&buffer[..count]);
    }
    
    Ok(hasher.finalize().to_hex().to_string())
}
