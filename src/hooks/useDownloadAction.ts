import { useCallback } from "react";
import { ModelWithStatus } from "../types";
import { api } from "../api";
import { getParentPath } from "../utils";
import { db } from "../utils/db";

export const useDownloadAction = (apiKey: string, showNotification: any, scanFolder: (path?: string) => void, clearDownload: (id: string) => void) => {
  const startDownload = useCallback(async (
    model: ModelWithStatus, 
    options: { model?: boolean, preview?: boolean, info?: boolean } = { model: true, preview: true, info: true }
  ) => {
    // Guard: Check if model has version info
    if (!model.latestVersionId || !model.latestVersionData) {
      const errorMsg = "모델 식별 정보가 부족합니다. (업데이트 확인을 먼저 실행해주세요)";
      showNotification("다운로드 불가", errorMsg, "warning");
      throw new Error(errorMsg);
    }
    
    // API에서 실제 파일명 가져오기 (기본값은 로컬 파일명)
    const modelFile = model.latestVersionData.files?.find((f: any) => f.type === "Model" && f.primary) 
                      || model.latestVersionData.files?.find((f: any) => f.type === "Model");
    
    const fullFileName = modelFile?.name || model.model_path.split(/[\\\/]/).pop() || "model.safetensors";
    const baseName = fullFileName.replace(/\.(safetensors|ckpt)$/i, "");
    const downloadPath = getParentPath(model.model_path);

    const modelPath = `${downloadPath}\\${fullFileName}`;
    const previewPath = `${downloadPath}\\${baseName}.preview.png`;
    const infoPath = `${downloadPath}\\${baseName}.civitai.info`;
    const jsonPath = `${downloadPath}\\${baseName}.json`;
    const configPath = `${downloadPath}\\${baseName}.yaml`;
    
    const downloadId = model.model_path;

    // GIF 및 MP4가 아닌 첫 번째 이미지 찾기
    const staticImage = model.latestVersionData?.images?.find((img: any) => {
      const url = img.url.toLowerCase();
      return !url.endsWith(".gif") && !url.endsWith(".mp4");
    });
    const selectedPreviewUrl = staticImage?.url || model.previewUrl;

    try {
      // 1. Download Model File
      if (options.model && model.downloadUrl) {
        try {
          await api.downloadFile(downloadId, model.downloadUrl, modelPath, apiKey);
        } catch (e: any) {
          if (e === "FILE_ALREADY_EXISTS") {
            showNotification("중복 파일 존재", "동일한 이름의 모델 파일이 이미 있습니다.", "warning");
            return;
          }
          throw e;
        }
      }
      
      // 2. Download Preview Image (Optional)
      if (options.preview && selectedPreviewUrl) {
        await api.downloadFile(`${downloadId}_preview`, selectedPreviewUrl, previewPath, apiKey).catch(() => {});
      }
      
      // 3. Download Config YAML (Optional)
      if (options.model) {
        const configFile = model.latestVersionData?.files?.find((f: any) => f.type === "Config");
        if (configFile?.downloadUrl) {
          await api.downloadFile(`${downloadId}_config`, configFile.downloadUrl, configPath, apiKey).catch(() => {});
        }
      }
      
      // 4. Write Info/JSON Files
      const metadataToSave = model.latestVersionData;
      if (options.info && metadataToSave) {
        const metadataStr = JSON.stringify(metadataToSave, null, 2);
        await api.writeTextFile(infoPath, metadataStr);
        await api.writeTextFile(jsonPath, metadataStr);
      }

      // DB에 정보 저장 (다운로드 성공 시점에 영구 보관)
      if (metadataToSave) {
        await db.setUpdateEntry(modelPath, {
          ...metadataToSave,
          latestVersion: metadataToSave.name,
          latestVersionId: metadataToSave.id,
          hasNewVersion: false, // 다운로드 했으므로 최신임
          lastReleaseDate: metadataToSave.createdAt,
          lastFetchedAt: new Date().toISOString(),
          downloadUrl: metadataToSave.downloadUrl,
          previewUrl: metadataToSave.images?.[0]?.url,
          latestVersionData: metadataToSave,
          modified: Date.now() / 1000 // 현재 시간으로 근사 (스캔 시 갱신됨)
        });
      }

      showNotification("다운로드 완료!", options.model ? `${fullFileName}` : "메타데이터 업데이트 완료", "success");
      
      // 다운로드 상태창 제거
      clearDownload(downloadId);
      clearDownload(`${downloadId}_preview`);
      clearDownload(`${downloadId}_config`);

      // 해당 모델이 있는 폴더만 부분적으로 로컬 스캔 수행
      setTimeout(() => scanFolder(downloadPath), 500);
    } catch (e: any) {
      clearDownload(downloadId); // 에러 시에도 상태창 제거
      let subMsg = e.toString();
      if (subMsg.includes("401")) subMsg = "API 키가 올바르지 않거나 권한이 없습니다.";
      else if (subMsg.includes("404")) subMsg = "파일을 찾을 수 없습니다. (삭제되었을 수 있음)";
      else if (subMsg.includes("timeout")) subMsg = "네트워크 연결 시간이 초과되었습니다.";
      
      showNotification("다운로드 중 오류 발생", subMsg, "error");
      throw e;
    }
  }, [apiKey, showNotification, scanFolder, clearDownload]);

  return { startDownload };
};
