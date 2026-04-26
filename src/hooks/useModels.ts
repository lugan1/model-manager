import { useState, useMemo, useCallback, useRef } from "react";
import { ModelWithStatus, ModelType, DirNode, CivitaiModelVersion, CivitaiModelResponse } from "../types";
import { ModelService } from "../services/model.service";
import { DBService } from "../services/db.service";
import { CivitaiService } from "../services/civitai.service";
import { normalizePath, calculateIsOutdated, stripHtml } from "../utils";

// --- Constants & Types ---

const TTL_DEFAULT = 24;

export const useModels = (currentScanPath: string, filterMonths: number, clearDownload: (id: string) => void) => {
  const [models, setModels] = useState<ModelWithStatus[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const scanningRef = useRef(false);

  // --- Helpers ---

  const patchModel = useCallback((path: string, patch: Partial<ModelWithStatus>) => {
    setModels(prev => prev.map(m => m.model_path === path ? { ...m, ...patch } : m));
  }, []);

  const applyUpdateCache = useCallback(async (modelList: ModelWithStatus[]): Promise<ModelWithStatus[]> => {
    try {
      const cache = await DBService.getAllCachedData();
      if (!cache) return modelList;
      return modelList.map(m => {
        const entry = cache[m.model_path];
        if (entry && entry.modified === m.modified) {
          // 캐시된 데이터를 기반으로 모델 상태 복구
          const localV = entry.localVersionData as CivitaiModelVersion | null;
          const latestV = entry.latestVersionData as CivitaiModelVersion | null;
          
          const hasNewVersion = (localV && latestV) 
            ? localV.id !== latestV.id 
            : false;
          
          const currentLocalBase = entry.localBaseModel || localV?.baseModel;
          const isNewBase = hasNewVersion && latestV && (latestV.baseModel !== currentLocalBase);

          return {
            ...m,
            ...entry,
            hasNewVersion,
            isNewBase,
            currentTask: entry.isNotFound ? "IDLE: 서버 정보 없음 (캐시됨)" : 
                        (entry.imageFetchFailed && !m.preview_path) ? "IDLE: 이미지 없음 (캐시됨)" :
                        (entry.lastFetchedAt ? `IDLE: 캐시됨 (${new Date(entry.lastFetchedAt).toLocaleDateString()} 확인)` : m.currentTask)
          };
        }
        return m;
      });
    } catch (e) { 
      console.error("Cache Apply Fail:", e);
      return modelList; 
    }
  }, []);

  // --- Main Actions ---

  const scanFolder = useCallback(async (specificPath?: string | null) => {
    const scanPath = specificPath || currentScanPath;
    if (scanningRef.current || !scanPath) return;
    scanningRef.current = true;
    setIsScanning(true);
    try {
      const result = await ModelService.scanModels(scanPath);
      let enriched = result.map(m => ({ 
        ...m, 
        isOutdated: calculateIsOutdated(m.modified, filterMonths),
        stableModified: m.modified // 초기 스캔 시 정렬 기준 고정
      }));
      enriched = await applyUpdateCache(enriched as ModelWithStatus[]);

      setModels(prev => {
        const existingMap = new Map(prev.map(m => [m.model_path, m]));
        const updated = (enriched as ModelWithStatus[]).map(m => {
          const ex = existingMap.get(m.model_path);
          if (ex) {
            if (ex.modified === m.modified && ex.size === m.size && ex.preview_path === m.preview_path) {
              return ex; 
            }
            return { ...m, ...getMetadataProps(ex), stableModified: ex.stableModified || m.modified };
          }
          return m;
        });

        if (!specificPath) return updated;
        const targetDir = normalizePath(specificPath);
        const filteredPrev = prev.filter(m => !normalizePath(m.model_path).startsWith(targetDir));
        return [...filteredPrev, ...updated];
      });
      return enriched;
    } finally {
      setIsScanning(false);
      scanningRef.current = false;
    }
  }, [currentScanPath, filterMonths, applyUpdateCache]);

  const updateModelInfo = useCallback(async (
    model: ModelWithStatus, 
    addLog?: any, 
    options: { checkNewVersion?: boolean; ignoreTTL?: boolean; ttlHours?: number } = {},
    onTaskChange?: (task: string) => void
  ) => {
    const { checkNewVersion = false, ignoreTTL = false, ttlHours = TTL_DEFAULT } = options;
    const updateTask = (task: string) => { patchModel(model.model_path, { currentTask: task }); onTaskChange?.(task); };
    const baseName = model.model_path.replace(/\.(safetensors|ckpt)$/i, "");

    try {
      if (ignoreTTL) {
        patchModel(model.model_path, { imageFetchFailed: false, isNotFound: false });
        await DBService.upsertLocalFile({ ...model, path: model.model_path, imageFetchFailed: false, isNotFound: false } as any);
      }
      
      if (!ignoreTTL && model.isNotFound) return updateTask("IDLE: SKIPPED (404 캐시)");

      let modelId = model.latestVersionData?.modelId || null;
      let versionData = model.latestVersionData || null;

      // 1. 해시 식별
      if (!modelId || ignoreTTL) {
        updateTask(`FAST_SCAN: 지문 추출 중...`);
        const hash = await ModelService.getModelHash(model.model_path, model.modified);

        try {
          updateTask("API_FETCH: 모델 식별 중...");
          const data = await CivitaiService.getModelVersionByHash(hash) as CivitaiModelVersion;
          
          // DTO를 DB에 그대로 저장
          await DBService.upsertCivitaiVersion(data, hash);
          await DBService.upsertLocalFile({
            path: model.model_path,
            hash,
            versionId: data.id,
            modified: model.modified,
            preview_path: model.preview_path,
            info_path: model.info_path,
            json_path: model.json_path,
            isNotFound: false
          });

          modelId = data.modelId;
          versionData = data;

          const meta = { 
            modelName: data.model?.name || data.name,
            latestVersion: data.name, 
            latestVersionId: data.id, 
            latestVersionData: data,
            localVersionData: data,
            civitaiUrl: `https://civitai.com/models/${modelId}`, 
            baseModel: data.baseModel,
            localBaseModel: data.baseModel,
            previewUrl: data.images?.[0]?.url, 
            lastFetchedAt: new Date().toISOString(), 
            isNotFound: false 
          };
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

      if (!modelId || !versionData) return updateTask("IDLE: 데이터 없음");

      // 2. 최신 버전 확인
      if (checkNewVersion) {
        updateTask(`API_FETCH: 최신 정보 조회 중...`);
        const civitData = await CivitaiService.getModel(modelId) as CivitaiModelResponse;
        if (!civitData) return updateTask("IDLE: 상세 요청 실패");

        // 모델 DTO 전체 저장
        await DBService.upsertCivitaiModel(civitData);
        
        const latestVersion = civitData.modelVersions?.[0]; 
        if (!latestVersion) return updateTask("IDLE: 서버 버전 정보 없음");

        const hasNewVersion = versionData.id !== latestVersion.id;
        const currentLocalBase = model.localBaseModel || model.baseModel || versionData.baseModel;
        const isNewBase = hasNewVersion && (latestVersion.baseModel !== currentLocalBase);

        const nowISO = new Date().toISOString();
        const selectedPreviewUrl = latestVersion.images?.find(img => !img.url.toLowerCase().endsWith(".gif"))?.url || latestVersion.images?.[0]?.url;

        const meta = { 
          modelName: civitData.name, 
          modelDescription: civitData.description ? stripHtml(civitData.description) : "",
          latestVersion: latestVersion.name, 
          latestVersionId: latestVersion.id,
          latestVersionData: latestVersion,
          civitaiUrl: `https://civitai.com/models/${modelId}`,
          hasNewVersion,
          isNewBase,
          baseModel: latestVersion.baseModel,
          localBaseModel: currentLocalBase,
          lastReleaseDate: latestVersion.createdAt,
          previewUrl: selectedPreviewUrl, 
          lastFetchedAt: nowISO,
          isNotFound: false 
        };

        patchModel(model.model_path, { ...meta, currentTask: "IDLE: 업데이트 확인 완료" });

        if (!model.preview_path && selectedPreviewUrl) {
          const imgUrl = selectedPreviewUrl;
          const ext = imgUrl.split('.').pop()?.split('?')[0] || 'png';
          const previewPath = `${baseName}.preview.${ext}`;
          
          ModelService.downloadFile(model.model_path, imgUrl, previewPath, true).then((res) => {
            patchModel(model.model_path, { preview_path: res.path, imageFetchFailed: false });
            DBService.upsertLocalFile({ 
              path: model.model_path, 
              modified: model.modified, 
              preview_path: res.path, 
              imageFetchFailed: false 
            } as any);
          }).catch(() => {
            patchModel(model.model_path, { imageFetchFailed: true });
            DBService.upsertLocalFile({ 
              path: model.model_path, 
              modified: model.modified, 
              imageFetchFailed: true 
            } as any);
          }).finally(() => { clearDownload(model.model_path); });
        }
      }
    } catch (e: any) {
      updateTask(`IDLE: 오류 (${e?.message || "Unknown Error"})`);
    }
  }, [patchModel, clearDownload]);

  const deleteSelected = useCallback(async (selectedPaths: Set<string>) => {
    if (selectedPaths.size === 0 || isDeleting) return;
    setIsDeleting(true);
    try {
      const targets: string[] = [];
      models.forEach(m => {
        if (selectedPaths.has(m.model_path)) {
          targets.push(m.model_path);
          if (m.preview_path) targets.push(m.preview_path);
          if (m.info_path) targets.push(m.info_path);
          if (m.json_path) targets.push(m.json_path);
        }
      });
      await ModelService.deleteFiles(targets);
      for (const path of Array.from(selectedPaths)) {
        await DBService.deleteLocalFile(path);
      }
      setModels(prev => prev.filter(m => !selectedPaths.has(m.model_path)));
    } finally { setIsDeleting(false); }
  }, [models, isDeleting]);

  return { models, setModels, isScanning, isDeleting, scanFolder, updateModelInfo, deleteSelected, patchModel };
};

const getMetadataProps = (m: ModelWithStatus) => ({
  modelName: m.modelName,
  currentVersion: m.currentVersion,
  currentVersionId: m.currentVersionId,
  latestVersion: m.latestVersion, latestVersionId: m.latestVersionId,
  baseModel: m.baseModel,
  localBaseModel: m.localBaseModel,
  isNewBase: m.isNewBase,
  stableModified: m.stableModified,
  downloadUrl: m.downloadUrl, previewUrl: m.previewUrl,
  latestVersionData: m.latestVersionData, civitaiUrl: m.civitaiUrl,
  hash: m.hash,
  hasNewVersion: m.hasNewVersion, lastReleaseDate: m.lastReleaseDate,
  lastFetchedAt: m.lastFetchedAt, isNotFound: m.isNotFound,
  imageFetchFailed: m.imageFetchFailed,
  currentTask: m.currentTask
});
