import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ModelInfo } from "../types";

export const api = {
  scanModels: (path: string): Promise<ModelInfo[]> => 
    invoke("scan_models", { path }),

  readTextFile: (path: string): Promise<string> => 
    invoke("read_text_file", { path }),

  writeTextFile: (path: string, content: string): Promise<void> => 
    invoke("write_text_file", { path, content }),

  deleteFiles: (paths: string[]): Promise<void> => 
    invoke("delete_files", { paths }),

  downloadFile: (id: string, url: string, path: string, apiKey?: string): Promise<string> => 
    invoke("download_file", { id, url, path, apiKey }),

  openBrowser: (url: string): Promise<void> => 
    openUrl(url),

  openFolder: (path: string): Promise<void> => 
    invoke("open_folder", { path }),

  calculateModelHash: (path: string): Promise<string> => 
    invoke("calculate_model_hash", { path }),
};

export const fetchCivitaiModel = async (modelId: number) => {
  const url = `https://civitai.red/api/v1/models/${modelId}`;
  const response = await fetch(url);
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "EMPTY_BODY");
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => { headers[k] = v; });
    
    throw {
      status: response.status,
      message: `HTTP_${response.status} (${response.statusText})`,
      body: errorBody,
      headers: headers,
      url: url
    };
  }
  return response.json();
};

export const fetchCivitaiModelByHash = async (hash: string) => {
  const url = `https://civitai.red/api/v1/model-versions/by-hash/${hash}`;
  const response = await fetch(url);
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "EMPTY_BODY");
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => { headers[k] = v; });

    throw {
      status: response.status,
      message: `HTTP_${response.status} (${response.statusText})`,
      body: errorBody,
      headers: headers,
      url: url
    };
  }
  return response.json();
};
