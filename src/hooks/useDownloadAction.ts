import { useCallback } from "react";
import { ModelWithStatus, CivitaiModelVersion } from "../types";
import { apiClient } from "../services/api.client";
import { DBService } from "../services/db.service";
import { ModelService } from "../services/model.service";
import { getParentPath, stripHtml } from "../utils";
import { useSettings } from "../contexts/SettingsContext";
import { useModelContext } from "../contexts/ModelContext";
import { useToast } from "./useToast";

export const useDownloadAction = (clearDownload: (id: string) => void) => {
  const { apiKey } = useSettings();
  const { models, patchModel, deselectModel } = useModelContext();
  const { showNotification } = useToast();

  const startDownload = useCallback(async (
    model: ModelWithStatus, 
    options: { model?: boolean, preview?: boolean, info?: boolean, isUpdate?: boolean } = { model: true, preview: true, info: true, isUpdate: false }
  ) => {
    const isUpdateMode = options.isUpdate === true;
    const targetMetadata = (isUpdateMode ? model.latestVersionData : (model.localVersionData || model.latestVersionData)) as CivitaiModelVersion | null;

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

    // 업데이트 모드일 때 타겟 파일이 이미 존재하는지 체크
    if (isUpdateMode && models.some(m => m.model_path === modelPath && m.model_path !== model.model_path)) {
      const confirmOverwrite = window.confirm(
        `동일한 이름의 모델 파일(${fullFileName})이 이미 로컬에 존재합니다.\n\n파일을 새로 다운로드하여 덮어쓰시겠습니까?`
      );
      if (!confirmOverwrite) {
        showNotification("업데이트 취소", "이미 존재하는 파일이 있어 업데이트를 중단했습니다.", "info");
        return;
      }
    }

    const previewPath = `${downloadPath}\\${baseName}.preview.png`;
    const infoPath = `${downloadPath}\\${baseName}.civitai.info`;
    const jsonPath = `${downloadPath}\\${baseName}.json`;
    const configPath = `${downloadPath}\\${baseName}.yaml`;
    
    const downloadId = model.model_path;
    const staticImage = targetMetadata.images?.find((img: any) => {
      const url = img.url.toLowerCase();
      return !url.endsWith(".gif") && !url.endsWith(".mp4") && !url.endsWith(".webm");
    });
    const selectedPreviewUrl = staticImage?.url || targetMetadata.images?.[0]?.url || (isUpdateMode ? model.previewUrl : (model.localPreviewUrl || model.previewUrl));
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
            apiKey,
            overwrite: isUpdateMode
          });
          finalModelPath = result.path;
          finalModified = result.modified;
        } catch (e: any) {
          if (e === "FILE_ALREADY_EXISTS") {
            showNotification("중복 파일 존재", "동일한 이름의 모델 파일이 이미 있습니다.", "warning");
            return;
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
          apiKey,
          overwrite: true
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
            apiKey,
            overwrite: true
          }).catch(() => {});
        }
      }
      
      if (options.info) {
        const modelDesc = targetMetadata.model?.description || targetMetadata.description || "";
        const cleanModelDesc = stripHtml(modelDesc);
        const versionNotes = targetMetadata.description ? stripHtml(targetMetadata.description) : "";

        const enrichedMetadata = {
          ...targetMetadata,
          "description": cleanModelDesc,
          "modelDescription": cleanModelDesc,
          "model": {
            ...(targetMetadata.model || {}),
            "description": cleanModelDesc
          },
          "negative prompt": targetMetadata.images?.find((img: any) => img.meta?.negativePrompt)?.meta?.negativePrompt || "",
          "activation text": (targetMetadata.trainedWords || []).join("\n"),
          "preferred weight": 1.0,
          "notes": `URL: https://civitai.com/models/${targetMetadata.modelId}\n\n[MODEL DESCRIPTION]\n${cleanModelDesc}\n\n[VERSION NOTES]\n${versionNotes}`.trim(),
          "modelId": targetMetadata.modelId,
          "civitai_model_id": targetMetadata.modelId
        };
        const metadataStr = JSON.stringify(enrichedMetadata, null, 2);
        await ModelService.writeTextFile(infoPath, metadataStr);
        await ModelService.writeTextFile(jsonPath, metadataStr);
      }

      // 상태 업데이트 데이터 구성
      const updatedFields: Partial<ModelWithStatus> = {
        model_path: finalModelPath,
        preview_path: finalPreviewPath,
        info_path: options.info ? infoPath : model.info_path,
        json_path: options.info ? jsonPath : model.json_path,
        modified: finalModified,
        currentTask: isUpdateMode ? "IDLE: 업데이트 완료" : "IDLE: 다운로드 완료"
      };

      if (isUpdateMode) {
        updatedFields.currentVersion = targetMetadata.name;
        updatedFields.currentVersionId = targetMetadata.id;
        updatedFields.localVersionData = targetMetadata;
        updatedFields.localBaseModel = targetMetadata.baseModel;
        updatedFields.localPreviewUrl = targetMetadata.images?.[0]?.url;
        updatedFields.localReleaseDate = targetMetadata.createdAt;
        updatedFields.hasNewVersion = false;
        updatedFields.isNewBase = false;
      }

      // DB 저장 (관계형 구조에 맞춰 upsert)
      await DBService.upsertCivitaiVersion(targetMetadata);
      await DBService.upsertLocalFile({
        path: finalModelPath,
        versionId: targetMetadata.id,
        modified: finalModified,
        preview_path: finalPreviewPath,
        info_path: options.info ? infoPath : model.info_path,
        json_path: options.info ? jsonPath : model.json_path,
        isNotFound: false
      });

      patchModel(model.model_path, updatedFields);

      if (isUpdateMode) {
        const oldBase = model.model_path.replace(/\.(safetensors|ckpt)$/i, "");
        const targetsToDelete: string[] = [];

        if (finalModelPath !== model.model_path) {
          targetsToDelete.push(model.model_path);
          if (model.info_path) targetsToDelete.push(model.info_path);
          if (model.json_path) targetsToDelete.push(model.json_path);
          targetsToDelete.push(`${oldBase}.civitai.info`);
          targetsToDelete.push(`${oldBase}.civitai.notfound`);
          targetsToDelete.push(`${oldBase}.yaml`);
          
          await DBService.deleteLocalFile(model.model_path);
        }

        if (model.preview_path && finalPreviewPath !== model.preview_path) {
          targetsToDelete.push(model.preview_path);
        }

        const uniqueTargets = [...new Set(targetsToDelete)].filter(
          (p): p is string => !!p && p !== finalModelPath && p !== finalPreviewPath
        );

        if (uniqueTargets.length > 0) {
          await ModelService.deleteFiles(uniqueTargets);
        }
        deselectModel(model.model_path);
      }

      showNotification(isUpdateMode ? "업데이트 완료!" : "다운로드 완료!", options.model ? `${fullFileName}` : "메타데이터 업데이트 완료", "success");
      
      clearDownload(downloadId);
      clearDownload(`${downloadId}_preview`);
      clearDownload(`${downloadId}_config`);

    } catch (e: any) {
      clearDownload(downloadId);
      let subMsg = e.toString();
      showNotification("작업 중 오류 발생", subMsg, "error");
      throw e;
    }
  }, [apiKey, showNotification, patchModel, deselectModel, clearDownload]);

  return { startDownload };
};
