use std::fs;
use std::path::Path;
use tauri::command;

#[command]
pub async fn exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

#[command]
pub async fn delete_files(paths: Vec<String>) -> Result<(), String> {
    for path in paths {
        let p = Path::new(&path);
        if p.exists() {
            fs::remove_file(p).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[command]
pub async fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
}

#[command]
pub async fn open_folder(path: String) -> Result<(), String> {
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
