import { useCallback } from "react";
import { ModelWithStatus } from "../types";
import { ModelService } from "../services/model.service";
import { DBService } from "../services/db.service";
import { CivitaiService } from "../services/civitai.service";
import { apiClient } from "../services/api.client";
import { useModelContext } from "../contexts/ModelContext";
import { useSettings } from "../contexts/SettingsContext";

export const useModelUpdate = (addLog?: any, clearDownload?: (id: string) => void) => {
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
        await DBService.setUpdateEntry(model.model_path, { ...model, imageFetchFailed: false, isNotFound: false });
      }
      
      if (!ignoreTTL && model.isNotFound) return updateTask("IDLE: SKIPPED (404 캐시)");

      let modelId = model.latestVersionData?.modelId || null;
      let versionData = model.localVersionData || model.latestVersionData || null;
      let civitaiUrl = model.civitaiUrl || null;

      let localVersionId = model.currentVersionId || model.latestVersionId || null;
      let localVersionName = model.currentVersion || model.latestVersion || null;
      let localReleaseDate = model.localReleaseDate || model.lastReleaseDate || null;

      // 1. 로컬 메타데이터 확인 (.info, .json)
      // ignoreTTL(강제 새로고침)일 때는 로컬 파일 정보를 무시하고 해시 조회를 강제합니다.
      const localMetaPath = model.info_path || model.json_path;
      if (!ignoreTTL && localMetaPath && await apiClient.invoke<boolean>("exists", { path: localMetaPath })) {
        try {
          const content = await ModelService.readTextFile(localMetaPath);
          const localMetadata = JSON.parse(content);
          if (localMetadata.id) localVersionId = localMetadata.id;
          if (localMetadata.name) localVersionName = localMetadata.name;
          if (localMetadata.modelId) {
            modelId = localMetadata.modelId;
            civitaiUrl = `https://civitai.red/models/${modelId}`;
          }
          localReleaseDate = localMetadata.createdAt || localMetadata.publishedAt || localMetadata.updatedAt || localReleaseDate;
          versionData = localMetadata;
        } catch (e) {}
      }

      // 2. 서버 정보 캐시 확인
      const cachePath = `${baseName}.civitai.info`;
      if (!ignoreTTL && await apiClient.invoke<boolean>("exists", { path: cachePath })) {
        try {
          const content = await ModelService.readTextFile(cachePath);
          const serverCacheData = JSON.parse(content);
          if (serverCacheData) {
            modelId = serverCacheData.modelId || serverCacheData.model?.id || modelId;
            civitaiUrl = `https://civitai.red/models/${modelId}`;
            if (!versionData) versionData = serverCacheData;
            if (!localReleaseDate) localReleaseDate = serverCacheData.createdAt || serverCacheData.publishedAt;
          }
        } catch (e) {}
      }

      // 3. 해시 식별 (필요시 또는 강제 새로고침 시)
      if (!modelId || ignoreTTL) {
        updateTask(ignoreTTL ? "FORCE_SCAN: 지문 재추출 중..." : "API_FETCH: 모델 식별 중...");
        const hash = await ModelService.getModelHash(model.model_path, model.modified);
        
        try {
          const data = await CivitaiService.getModelVersionByHash(hash);
          
          // 오염된 정보가 있을 수 있으므로 실제 파일 정보에 맞게 로컬 파일들을 물리적으로 교정
          const cleanMetadataStr = JSON.stringify(data, null, 2);
          await ModelService.writeTextFile(cachePath, cleanMetadataStr).catch(() => {});
          
          // 기존 .info 나 .json 파일이 있다면 실제 버전에 맞게 덮어쓰기 (치료)
          if (model.info_path) await ModelService.writeTextFile(model.info_path, cleanMetadataStr).catch(() => {});
          if (model.json_path) await ModelService.writeTextFile(model.json_path, cleanMetadataStr).catch(() => {});
          
          // 만약 info 파일이 아예 없었다면 새로 생성 (옵션: 깔끔하게 만들기 위해)
          if (!model.info_path && !model.json_path) {
            const newInfoPath = `${baseName}.civitai.info`;
            await ModelService.writeTextFile(newInfoPath, cleanMetadataStr).catch(() => {});
          }

          modelId = data.modelId; 
          localVersionId = data.id; 
          versionData = data;
          localVersionName = data.name;
          civitaiUrl = `https://civitai.red/models/${modelId}`;
          
          const meta = { 
            modelName: data.model?.name,
            currentVersion: data.name,
            currentVersionId: data.id,
            localVersionData: data,
            localBaseModel: data.baseModel,
            localPreviewUrl: data.images?.[0]?.url,
            localReleaseDate: data.createdAt,
            civitaiUrl: civitaiUrl, 
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
          await DBService.setUpdateEntry(model.model_path, meta);
          patchModel(model.model_path, meta);
        } catch (err: any) {
          if (err.status === 404) {
            await ModelService.writeTextFile(`${baseName}.civitai.notfound`, JSON.stringify({ notFound: true, hash, timestamp: new Date().toISOString() })).catch(() => {});
            patchModel(model.model_path, { isNotFound: true });
            await DBService.setUpdateEntry(model.model_path, { isNotFound: true, modified: model.modified });
            return updateTask("IDLE: 서버 정보 없음 (404)");
          }
          return updateTask(`IDLE: 식별 실패 (${err.status || "ERR"})`);
        }
      }

      // 4. 최신 버전 업데이트 확인
      if (checkNewVersion && modelId) {
        updateTask(`API_FETCH: 최신 정보 조회 중...`);
        const civitData = await CivitaiService.getModel(modelId).catch(() => null);
        if (!civitData) return updateTask("IDLE: 상세 요청 실패");

        const allVersions = civitData.modelVersions || [];
        const latestVersion = allVersions[0]; 

        if (!latestVersion) return updateTask("IDLE: 서버 버전 정보 없음");

        const hasNewVersion = (localVersionName && latestVersion.name) 
          ? localVersionName.trim() !== latestVersion.name.trim()
          : false;
        
        const currentLocalBase = model.localBaseModel || model.baseModel || versionData?.baseModel;
        const isNewBase = hasNewVersion && (latestVersion.baseModel !== currentLocalBase);

        const nowISO = new Date().toISOString();
        const staticImage = latestVersion.images?.find((img: any) => {
          const url = img.url.toLowerCase();
          return !url.endsWith(".gif") && !url.endsWith(".mp4");
        });
        const selectedPreviewUrl = staticImage?.url || latestVersion.images?.[0]?.url;

        // DB에서 최신 정보를 가져와서 병합 (Step 3에서 저장한 localVersionData 유지)
        const currentDBEntry = await DBService.getUpdateEntry(model.model_path);
        
        const updateMeta = { 
          modelName: civitData.name, 
          latestVersion: latestVersion.name, 
          latestVersionId: latestVersion.id,
          latestVersionData: { ...latestVersion, lastFetchedAt: nowISO },
          civitaiUrl: civitaiUrl || `https://civitai.com/models/${modelId}`,
          hasNewVersion,
          isNewBase,
          baseModel: latestVersion.baseModel,
          lastReleaseDate: latestVersion.createdAt,
          previewUrl: selectedPreviewUrl, 
          lastFetchedAt: nowISO,
          isNotFound: false,
          modified: model.modified
        };

        const mergedMeta = { ...currentDBEntry, ...updateMeta };

        await DBService.setUpdateEntry(model.model_path, mergedMeta);
        patchModel(model.model_path, { ...mergedMeta, currentTask: "IDLE: 업데이트 확인 완료" });
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
