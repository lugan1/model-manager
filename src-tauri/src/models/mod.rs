use serde::{Deserialize, Serialize};

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

#[derive(Clone, Serialize)]
pub struct DownloadProgress {
    pub id: String,
    pub received: u64,
    pub total: Option<u64>,
    pub speed: f64,
}

#[derive(Serialize)]
pub struct DownloadResult {
    pub path: String,
    pub modified: u64,
}
