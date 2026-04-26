import { useCallback } from "react";
import { ModelWithStatus, CivitaiModelResponse, CivitaiModelVersion } from "../types";
import { ModelService } from "../services/model.service";
import { DBService } from "../services/db.service";
import { CivitaiService } from "../services/civitai.service";
import { useModelContext } from "../contexts/ModelContext";
import { useSettings } from "../contexts/SettingsContext";
import { stripHtml } from "../utils";

export const useModelUpdate = (addLog?: any, _clearDownload?: (id: string) => void) => {
  const { patchModel } = useModelContext();
  const { updateTTL } = useSettings();

  const updateModelInfo = useCallback(async (
    model: ModelWithStatus, 
    options: { checkNewVersion?: boolean; ignoreTTL?: boolean; ttlHours?: number } = {},
    onTaskChange?: (task: string) => void
  ) => {
    const { checkNewVersion = false, ignoreTTL = false, ttlHours = updateTTL } = options;
    const updateTask = (task: string) => { 
      patchModel(model.model_path, { currentTask: task }); 
      onTaskChange?.(task); 
    };
    
    const baseName = model.model_path.replace(/\.(safetensors|ckpt)$/i, "");

    try {
      if (ignoreTTL) {
        patchModel(model.model_path, { imageFetchFailed: false, isNotFound: false });
        await DBService.upsertLocalFile({ 
          path: model.model_path, 
          modified: model.modified,
          isNotFound: false 
        });
      }
      
      if (!ignoreTTL && model.isNotFound) return updateTask("IDLE: SKIPPED (404 캐시)");

      let modelId = model.latestVersionData?.modelId || null;
      let versionData = model.localVersionData || model.latestVersionData || null;

      let localVersionId = model.currentVersionId || model.latestVersionId || null;
      let localVersionName = model.currentVersion || model.latestVersion || null;
      let localReleaseDate = model.localReleaseDate || model.lastReleaseDate || null;

      // 1. 로컬 메타데이터 확인 (.info, .json)
      const localMetaPath = model.info_path || model.json_path;
      if (!ignoreTTL && localMetaPath) {
        try {
          const content = await ModelService.readTextFile(localMetaPath);
          const localMetadata = JSON.parse(content);
          if (localMetadata.id) localVersionId = localMetadata.id;
          if (localMetadata.name) localVersionName = localMetadata.name;
          if (localMetadata.modelId) modelId = localMetadata.modelId;
          localReleaseDate = localMetadata.createdAt || localMetadata.publishedAt || localMetadata.updatedAt || localReleaseDate;
          versionData = localMetadata;
        } catch (e) {}
      }

      // 2. 서버 정보 캐시 확인 (DB)
      if (!ignoreTTL) {
        const cached = await DBService.getLocalFile(model.model_path);
        if (cached && cached.version_id) {
          const vData = await DBService.getCivitaiVersion(cached.version_id);
          if (vData) {
            modelId = vData.modelId;
            versionData = vData;
            localVersionId = vData.id;
            localVersionName = vData.name;
            localReleaseDate = vData.createdAt;
          }
        }
      }

      // 3. 해시 식별 (필요시 또는 강제 새로고침 시)
      if (!modelId || ignoreTTL) {
        updateTask(ignoreTTL ? "FORCE_SCAN: 지문 재추출 중..." : "API_FETCH: 모델 식별 중...");
        const hash = await ModelService.getModelHash(model.model_path, model.modified);
        
        try {
          const data = await CivitaiService.getModelVersionByHash(hash) as CivitaiModelVersion;
          modelId = data.modelId;
          localVersionId = data.id;
          versionData = data;

          // 모델 식별 후, 더 풍부한 정보를 위해 모델 상세 정보를 즉시 한 번 더 조회 (설명 누락 방지)
          updateTask("API_FETCH: 상세 정보 확보 중...");
          const fullModel = await CivitaiService.getModel(modelId).catch(() => null) as CivitaiModelResponse | null;
          
          if (fullModel) {
            await DBService.upsertCivitaiModel(fullModel);
            // DTO에 모델 정보를 병합하여 유실 방지
            data.model = {
              name: fullModel.name,
              description: fullModel.description,
              type: fullModel.type,
              nsfw: fullModel.nsfw,
              userId: fullModel.userId
            };
          }

          await DBService.upsertCivitaiVersion(data, hash);

          const modelDesc = fullModel?.description || data.model?.description || "";
          const cleanModelDesc = stripHtml(modelDesc);
          const versionNotes = data.description ? stripHtml(data.description) : "";

          // Reforge의 Notes 필드 구성 (내용이 있는 것만 포함)
          let notesContent = `URL: https://civitai.com/models/${data.modelId}`;
          if (cleanModelDesc) {
            notesContent += `\n\n[MODEL DESCRIPTION]\n${cleanModelDesc}`;
          }
          if (versionNotes) {
            notesContent += `\n\n[VERSION NOTES]\n${versionNotes}`;
          }

          const enrichedData = {
            ...data,
            "description": cleanModelDesc || versionNotes, // 둘 다 없으면 버전노트라도 넣어둠
            "modelDescription": cleanModelDesc,
            "model": {
              ...(data.model || {}),
              "description": cleanModelDesc
            },
            "negative prompt": data.images?.find((img: any) => img.meta?.negativePrompt)?.meta?.negativePrompt || "",
            "activation text": (data.trainedWords || []).join("\n"),
            "preferred weight": 1.0,
            "notes": notesContent.trim(),
            "modelId": data.modelId,
            "civitai_model_id": data.modelId
          };
          const cleanMetadataStr = JSON.stringify(enrichedData, null, 2);
          
          // 메타데이터 파일 쓰기 (확실한 정보 확보 후 실행)
          if (model.info_path) await ModelService.writeTextFile(model.info_path, cleanMetadataStr).catch(() => {});
          if (model.json_path) await ModelService.writeTextFile(model.json_path, cleanMetadataStr).catch(() => {});
          
          if (!model.info_path) {
            await ModelService.writeTextFile(`${baseName}.civitai.info`, cleanMetadataStr).catch(() => {});
          }
          if (!model.json_path) {
            await ModelService.writeTextFile(`${baseName}.json`, cleanMetadataStr).catch(() => {});
          }

          localVersionName = data.name;
          
          const meta = { 
            modelName: data.model?.name,
            modelDescription: cleanModelDesc,
            currentVersion: data.name,
            currentVersionId: data.id,
            localVersionData: data,
            localBaseModel: data.baseModel,
            localPreviewUrl: data.images?.[0]?.url,
            localReleaseDate: data.createdAt,
            civitaiUrl: `https://civitai.com/models/${modelId}`, 
            baseModel: data.baseModel, 
            latestVersion: data.name, 
            latestVersionId: data.id, 
            latestVersionData: data,
            previewUrl: data.images?.[0]?.url, 
            lastReleaseDate: data.createdAt,
            lastFetchedAt: new Date().toISOString(), 
            isNotFound: false,
            modified: model.modified
          };

          await DBService.upsertLocalFile({
            path: model.model_path,
            hash,
            versionId: data.id,
            modified: model.modified,
            preview_path: model.preview_path,
            info_path: model.info_path || `${baseName}.civitai.info`,
            json_path: model.json_path || `${baseName}.json`,
            isNotFound: false
          });

          patchModel(model.model_path, meta);
        } catch (err: any) {
          if (err.status === 404) {
            await DBService.upsertLocalFile({ path: model.model_path, modified: model.modified, isNotFound: true });
            patchModel(model.model_path, { isNotFound: true });
            return updateTask("IDLE: 서버 정보 없음 (404)");
          }
          return updateTask(`IDLE: 식별 실패 (${err.status || "ERR"})`);
        }
      }

      // 4. 최신 버전 업데이트 확인
      if (checkNewVersion && modelId) {
        updateTask(`API_FETCH: 최신 정보 조회 중...`);
        const civitData = await CivitaiService.getModel(modelId) as CivitaiModelResponse;
        if (!civitData) return updateTask("IDLE: 상세 요청 실패");

        await DBService.upsertCivitaiModel(civitData);

        const allVersions = civitData.modelVersions || [];
        const latestVersion = allVersions[0]; 

        if (!latestVersion) return updateTask("IDLE: 서버 버전 정보 없음");

        const hasNewVersion = (localVersionId !== latestVersion.id);
        const currentLocalBase = model.localBaseModel || model.baseModel || versionData?.baseModel;
        const isNewBase = hasNewVersion && (latestVersion.baseModel !== currentLocalBase);

        const nowISO = new Date().toISOString();
        const staticImage = latestVersion.images?.find((img: any) => {
          const url = img.url.toLowerCase();
          return !url.endsWith(".gif") && !url.endsWith(".mp4");
        });
        const selectedPreviewUrl = staticImage?.url || latestVersion.images?.[0]?.url;

        const updateMeta = { 
          modelName: civitData.name, 
          modelDescription: civitData.description ? stripHtml(civitData.description) : "",
          latestVersion: latestVersion.name, 
          latestVersionId: latestVersion.id,
          latestVersionData: latestVersion,
          civitaiUrl: `https://civitai.com/models/${modelId}`,
          hasNewVersion,
          isNewBase,
          baseModel: latestVersion.baseModel,
          lastReleaseDate: latestVersion.createdAt,
          previewUrl: selectedPreviewUrl, 
          lastFetchedAt: nowISO,
          isNotFound: false,
          modified: model.modified
        };

        patchModel(model.model_path, { ...updateMeta, currentTask: "IDLE: 업데이트 확인 완료" });
      }

    } catch (e: any) {
      const errorMsg = e?.message || "Unknown Error";
      addLog?.({
        method: "UPDATE",
        target: model.name,
        message: errorMsg,
        status: e.status
      });
      updateTask(`IDLE: 오류 (${errorMsg})`);
    }
  }, [patchModel, updateTTL, addLog]);

  return { updateModelInfo };
};
