import { useCallback } from "react";
import { ModelWithStatus } from "../types";
import { apiClient } from "../services/api.client";
import { DBService } from "../services/db.service";
import { ModelService } from "../services/model.service";
import { getParentPath } from "../utils";
import { useSettings } from "../contexts/SettingsContext";
import { useModelContext } from "../contexts/ModelContext";
import { useToast } from "./useToast";

export const useDownloadAction = (clearDownload: (id: string) => void) => {
  const { apiKey } = useSettings();
  const { patchModel, deselectModel } = useModelContext();
  const { showNotification } = useToast();

  const startDownload = useCallback(async (
    model: ModelWithStatus, 
    options: { model?: boolean, preview?: boolean, info?: boolean, isUpdate?: boolean } = { model: true, preview: true, info: true, isUpdate: false }
  ) => {
    const isUpdateMode = options.isUpdate === true;
    
    // 업데이트 모드가 아닐 때는 로컬 데이터를 우선 사용 (v1 정보를 받기 위함)
    // 업데이트 모드일 때는 최신 데이터를 사용 (v2 정보를 받기 위함)
    const targetMetadata = isUpdateMode ? model.latestVersionData : (model.localVersionData || model.latestVersionData);

    if (!targetMetadata) {
      const errorMsg = "모델 식별 정보가 부족합니다. (업데이트 확인을 먼저 실행해주세요)";
      showNotification("다운로드 불가", errorMsg, "warning");
      throw new Error(errorMsg);
    }
    
    const modelFile = targetMetadata.files?.find((f: any) => f.type === "Model" && f.primary) 
                      || targetMetadata.files?.find((f: any) => f.type === "Model");
    
    const fullFileName = modelFile?.name || model.model_path.split(/[\\\/]/).pop() || "model.safetensors";
    const baseName = fullFileName.replace(/\.(safetensors|ckpt)$/i, "");
    const downloadPath = getParentPath(model.model_path);

    const modelPath = `${downloadPath}\\${fullFileName}`;
    const previewPath = `${downloadPath}\\${baseName}.preview.png`;
    const infoPath = `${downloadPath}\\${baseName}.civitai.info`;
    const jsonPath = `${downloadPath}\\${baseName}.json`;
    const configPath = `${downloadPath}\\${baseName}.yaml`;
    
    const downloadId = model.model_path;
    const staticImage = targetMetadata.images?.find((img: any) => {
      const url = img.url.toLowerCase();
      return !url.endsWith(".gif") && !url.endsWith(".mp4");
    });
    const selectedPreviewUrl = staticImage?.url || (isUpdateMode ? model.previewUrl : (model.localPreviewUrl || model.previewUrl));
    const downloadUrl = modelFile?.downloadUrl || targetMetadata.downloadUrl;

    try {
      let finalModelPath = model.model_path;
      let finalModified = model.modified;
      
      if (options.model && downloadUrl) {
        try {
          const result = await apiClient.invoke<{ path: string, modified: number }>("download_file", { 
            id: downloadId, 
            url: downloadUrl, 
            path: modelPath, 
            apiKey 
          });
          finalModelPath = result.path;
          finalModified = result.modified;
        } catch (e: any) {
          if (e === "FILE_ALREADY_EXISTS") {
            if (!isUpdateMode) {
              showNotification("중복 파일 존재", "동일한 이름의 모델 파일이 이미 있습니다.", "warning");
              return;
            }
          } else {
            throw e;
          }
        }
      }
      
      let finalPreviewPath = model.preview_path;
      if (options.preview && selectedPreviewUrl) {
        const res = await apiClient.invoke<{ path: string, modified: number }>("download_file", { 
          id: `${downloadId}_preview`, 
          url: selectedPreviewUrl, 
          path: previewPath, 
          apiKey 
        }).catch(() => undefined);
        if (res) finalPreviewPath = res.path;
      }
      
      if (options.model) {
        const configFile = targetMetadata.files?.find((f: any) => f.type === "Config");
        if (configFile?.downloadUrl) {
          await apiClient.invoke("download_file", { 
            id: `${downloadId}_config`, 
            url: configFile.downloadUrl, 
            path: configPath, 
            apiKey 
          }).catch(() => {});
        }
      }
      
      if (options.info) {
        const metadataStr = JSON.stringify(targetMetadata, null, 2);
        await ModelService.writeTextFile(infoPath, metadataStr);
        await ModelService.writeTextFile(jsonPath, metadataStr);
      }

      const latestName = targetMetadata.name;
      
      // 상태 업데이트 데이터 구성
      const updatedFields: Partial<ModelWithStatus> = {
        model_path: finalModelPath,
        preview_path: finalPreviewPath,
        info_path: options.info ? infoPath : model.info_path,
        json_path: options.info ? jsonPath : model.json_path,
        modified: finalModified,
        currentTask: isUpdateMode ? "IDLE: 업데이트 완료" : "IDLE: 다운로드 완료"
      };

      // 만약 업데이트 모드였다면, 이제 새 버전이 로컬 버전이 됨
      if (isUpdateMode) {
        updatedFields.currentVersion = latestName;
        updatedFields.currentVersionId = targetMetadata.id;
        updatedFields.localVersionData = targetMetadata;
        updatedFields.localBaseModel = targetMetadata.baseModel;
        updatedFields.localPreviewUrl = targetMetadata.images?.[0]?.url;
        updatedFields.localReleaseDate = targetMetadata.createdAt;
        updatedFields.hasNewVersion = false;
        updatedFields.isNewBase = false;
      }

      const mergedData = { ...model, ...updatedFields };
      await DBService.setUpdateEntry(finalModelPath, mergedData);
      patchModel(model.model_path, updatedFields);

      if (isUpdateMode) {
        if (finalModelPath !== model.model_path) {
          const oldBase = model.model_path.replace(/\.(safetensors|ckpt)$/i, "");
          const targetsToDelete = [
            model.model_path,
            model.preview_path,
            model.info_path,
            model.json_path,
            `${oldBase}.civitai.info`,
            `${oldBase}.civitai.notfound`,
            `${oldBase}.yaml`
          ].filter((p): p is string => !!p && p !== finalModelPath && p !== finalPreviewPath);

          if (targetsToDelete.length > 0) {
            await ModelService.deleteFiles(targetsToDelete);
            await DBService.deleteEntry(model.model_path);
            await DBService.deleteHash(model.model_path);
          }
        }
        
        // 중요: 업데이트 작업이 완료되었으므로 선택 목록에서 제거
        deselectModel(model.model_path);
      }

      showNotification(isUpdateMode ? "업데이트 완료!" : "다운로드 완료!", options.model ? `${fullFileName}` : "메타데이터 업데이트 완료", "success");
      
      clearDownload(downloadId);
      clearDownload(`${downloadId}_preview`);
      clearDownload(`${downloadId}_config`);

    } catch (e: any) {
      clearDownload(downloadId);
      let subMsg = e.toString();
      if (subMsg.includes("401")) subMsg = "API 키가 올바르지 않거나 권한(얼리 억세스 구매 등)이 없습니다.";
      else if (subMsg.includes("404")) subMsg = "파일을 찾을 수 없습니다. (삭제되었을 수 있음)";
      else if (subMsg.includes("timeout")) subMsg = "네트워크 연결 시간이 초과되었습니다.";
      
      showNotification("작업 중 오류 발생", subMsg, "error");
      throw e;
    }
  }, [apiKey, showNotification, patchModel, deselectModel, clearDownload]);

  return { startDownload };
};
