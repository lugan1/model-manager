import { useState, useMemo, useCallback, useRef } from "react";
import { ModelWithStatus, ModelType, DirNode } from "../types";
import { api, fetchCivitaiModel, fetchCivitaiModelByHash } from "../api";
import { normalizePath, calculateIsOutdated } from "../utils";
import { db } from "../utils/db";

// --- Constants & Types ---
interface HashCacheEntry { hash: string; modified: number; }
interface UpdatePersistenceEntry {
  baseModel?: string;
  localBaseModel?: string;
  isNewBase?: boolean;
  modelName?: string;
  currentVersion?: string;
  currentVersionId?: number;
  latestVersion?: string;
  latestVersionId?: number;
  hasNewVersion?: boolean;
  lastReleaseDate?: string;
  lastFetchedAt?: string;
  civitaiUrl?: string;
  previewUrl?: string;
  downloadUrl?: string;
  latestVersionData?: any;
  isNotFound?: boolean;
  imageFetchFailed?: boolean;
  modified: number;
}

const TTL_DEFAULT = 24;

export const useModels = (currentScanPath: string, filterMonths: number, clearDownload: (id: string) => void) => {
// ... (중간 생략: getMetadataProps 등에서 currentVersionId 포함하도록 나중에 수정)
  const [models, setModels] = useState<ModelWithStatus[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const scanningRef = useRef(false);

  // --- Helpers ---

  const patchModel = useCallback((path: string, patch: Partial<ModelWithStatus>) => {
    setModels(prev => prev.map(m => m.model_path === path ? { ...m, ...patch } : m));
  }, []);

  const saveToDB = useCallback(async (model: ModelWithStatus, data: Partial<UpdatePersistenceEntry>) => {
    try {
      const existing = await db.getUpdateEntry(model.model_path) || {};
      await db.setUpdateEntry(model.model_path, { ...existing, ...data, modified: model.modified });
    } catch (e) { console.error("DB Save Fail:", e); }
  }, []);

  const applyUpdateCache = useCallback(async (modelList: ModelWithStatus[]): Promise<ModelWithStatus[]> => {
    try {
      const cache = await db.getAllUpdates();
      if (!cache) return modelList;
      return modelList.map(m => {
        const entry = cache[m.model_path] as UpdatePersistenceEntry;
        if (entry && entry.modified === m.modified) {
          return {
            ...m, ...entry,
            currentTask: entry.isNotFound ? "IDLE: 서버 정보 없음 (캐시됨)" : 
                        (entry.imageFetchFailed && !m.preview_path) ? "IDLE: 이미지 없음 (캐시됨)" :
                        (entry.lastFetchedAt ? `IDLE: 캐시됨 (${new Date(entry.lastFetchedAt).toLocaleDateString()} 확인)` : m.currentTask)
          };
        }
        return m;
      });
    } catch (e) { return modelList; }
  }, []);

  // --- Main Actions ---

  const scanFolder = useCallback(async (specificPath?: string | null) => {
    const scanPath = specificPath || currentScanPath;
    if (scanningRef.current || !scanPath) return;
    scanningRef.current = true;
    setIsScanning(true);
    try {
      const result = await api.scanModels(scanPath);
      let enriched = result.map(m => ({ 
        ...m, 
        isOutdated: calculateIsOutdated(m.modified, filterMonths),
        stableModified: m.modified // 초기 스캔 시 정렬 기준 고정
      }));
      enriched = await applyUpdateCache(enriched);

      setModels(prev => {
        const existingMap = new Map(prev.map(m => [m.model_path, m]));
        const updated = enriched.map(m => {
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
        await saveToDB(model, { imageFetchFailed: false, isNotFound: false });
      }
      // ignoreTTL이 아닐 때만 404 캐시를 존중 (강제 업데이트 시에는 404도 재검사)
      if (!ignoreTTL && model.isNotFound) return updateTask("IDLE: SKIPPED (404 캐시)");

      let modelId = model.latestVersionData?.modelId || null;
      let versionData = model.latestVersionData || null;
      let civitaiUrl = model.civitaiUrl || null;

      // 1. 로컬 정보 및 서버 캐시 복구
      let localVersionId = model.latestVersionData?.id || null;
      let localVersionName = model.currentVersion || model.latestVersion || null;
      let localReleaseDate = model.lastReleaseDate || null;
      let serverCacheData: any = null;

      // [A] 로컬 실제 파일 정보 (.json, .info) - 현재 파일의 버전 확정용
      const localMetaPath = model.info_path || model.json_path;
      let localMetadata: any = null;
      if (localMetaPath) {
        try {
          const content = await api.readTextFile(localMetaPath);
          localMetadata = JSON.parse(content);
          if (localMetadata.id) localVersionId = localMetadata.id;
          if (localMetadata.name) localVersionName = localMetadata.name;
          if (localMetadata.modelId) {
            modelId = localMetadata.modelId;
            civitaiUrl = `https://civitai.red/models/${modelId}`;
          }
          localReleaseDate = localMetadata.createdAt || localMetadata.publishedAt || localMetadata.updatedAt || localReleaseDate;
        } catch (e) {}
      }

      // [B] 서버 정보 캐시 (.civitai.info) - 이전에 조회한 최신 정보 복구용
      const cachePath = `${baseName}.civitai.info`;
      if (await api.exists(cachePath)) {
        try {
          const content = await api.readTextFile(cachePath);
          serverCacheData = JSON.parse(content);
          if (serverCacheData) {
            modelId = serverCacheData.modelId || serverCacheData.model?.id || modelId;
            civitaiUrl = `https://civitai.red/models/${modelId}`;
            versionData = serverCacheData;
            localReleaseDate = serverCacheData.createdAt || serverCacheData.publishedAt || localReleaseDate;
          }
        } catch (e) {}
      }

      // 1.5 무결성 검증 (Integrity Check)
      // 로컬 메타데이터가 있다면, 실제 파일의 해시와 대조하여 정보 오염 여부 확인
      if (modelId && localMetadata) {
        updateTask("VERIFYING: 정보 무결성 검사 중...");
        const realHash = await api.calculateModelHash(model.model_path);
        
        // Civitai 메타데이터의 hashes 필드에서 BLAKE3 찾기 (대소문자 무시)
        const metadataHash = localMetadata.hashes?.BLAKE3 || 
                           localMetadata.files?.find((f: any) => f.hashes?.BLAKE3)?.hashes?.BLAKE3;
        
        if (metadataHash && realHash.toLowerCase() !== metadataHash.toLowerCase()) {
          console.warn(`Hash mismatch for ${model.name}. Metadata: ${metadataHash}, Real: ${realHash}`);
          addLog?.({ 
            method: "INTEGRITY_CHECK", 
            message: `지문 불일치 감지 (오염된 정보): ${model.name}. 재식별을 시작합니다.`, 
            status: "warning" 
          });
          // 정보가 오염됨 -> 초기화하여 재식별 강제
          modelId = null;
          versionData = null;
          civitaiUrl = null;
          localVersionId = null;
          localVersionName = null;
        }
      }

      // 복구된 정보로 1차 패치 (중요: localVersionId 및 localVersionName 보존)
      if (versionData || modelId) {
        const meta = {
          modelName: versionData?.model?.name || versionData?.modelName || model.modelName,
          currentVersion: localVersionName,
          currentVersionId: localVersionId ? Number(localVersionId) : model.currentVersionId,
          latestVersion: versionData?.name || model.latestVersion,
          latestVersionId: versionData?.id || model.latestVersionId,
          latestVersionData: versionData || model.latestVersionData,
          lastReleaseDate: localReleaseDate,
          civitaiUrl: civitaiUrl,
          baseModel: versionData?.baseModel || model.baseModel,
          localBaseModel: versionData?.baseModel || model.baseModel,
          lastFetchedAt: versionData?.lastFetchedAt || model.lastFetchedAt
        };
        await saveToDB(model, meta);
        patchModel(model.model_path, meta);
      }

      // 2. 404 마커 체크
      if (!modelId && !ignoreTTL) {
        const notFoundPath = `${baseName}.civitai.notfound`;
        if (await api.exists(notFoundPath)) {
          patchModel(model.model_path, { isNotFound: true });
          await saveToDB(model, { isNotFound: true });
          return updateTask("IDLE: 서버 정보 없음 (마커)");
        }
      }

      // 3. 해시 식별
      if (!modelId || ignoreTTL) {
        let hash = "";
        const cached = await db.getHashEntry(model.model_path) as HashCacheEntry;
        if (!ignoreTTL && cached && cached.modified === model.modified) {
          hash = cached.hash;
        } else {
          updateTask(`FAST_SCAN: 지문 추출 중...`);
          hash = await api.calculateModelHash(model.model_path);
          await db.setHashEntry(model.model_path, { hash, modified: model.modified });
        }

        try {
          updateTask("API_FETCH: 모델 식별 중...");
          const data = await fetchCivitaiModelByHash(hash);
          modelId = data.modelId; localVersionId = data.id; versionData = data;
          localVersionName = data.name;
          civitaiUrl = `https://civitai.red/models/${modelId}`;
          await api.writeTextFile(cachePath, JSON.stringify(data, null, 2)).catch(() => {});
          
          const meta = { 
            modelName: data.model?.name,
            latestVersion: data.name, 
            latestVersionId: data.id, 
            latestVersionData: data,
            civitaiUrl: civitaiUrl, 
            baseModel: data.baseModel,
            localBaseModel: data.baseModel,
            previewUrl: data.images?.[0]?.url, 
            lastFetchedAt: new Date().toISOString(), 
            isNotFound: false 
          };
          await saveToDB(model, meta);
          patchModel(model.model_path, meta);
        } catch (err: any) {
          if (err.status === 404) {
            await api.writeTextFile(`${baseName}.civitai.notfound`, JSON.stringify({ notFound: true, hash, timestamp: new Date().toISOString() })).catch(() => {});
            patchModel(model.model_path, { isNotFound: true });
            await saveToDB(model, { isNotFound: true });
            return updateTask("IDLE: 서버 정보 없음 (404)");
          }
          return updateTask(`IDLE: 식별 실패 (${err.status || "ERR"})`);
        }
      }

      if (!modelId || !versionData) return updateTask("IDLE: 데이터 없음");

      // 4. 최신 버전 확인 및 판정 로직 (TTL 기반 캐싱)
      if (checkNewVersion) {
        const now = Date.now();
        const lastFetched = model.lastFetchedAt ? new Date(model.lastFetchedAt).getTime() : 0;
        const diffHours = (now - lastFetched) / 3600000;

        // TTL 내에 있고 강제 업데이트가 아니면 캐시 사용
        if (!ignoreTTL && diffHours < ttlHours && model.latestVersionData) {
          const latestVersion = model.latestVersionData;
          // [판정 1] 새 버전: 이름이 존재하고, 공백 제거 후 비교했을 때 다를 때만
          const hasNewVersion = (localVersionName && latestVersion.name) 
            ? localVersionName.trim() !== latestVersion.name.trim()
            : false;
          
          const currentLocalBase = model.localBaseModel || model.baseModel || versionData?.baseModel;
          const isNewBase = hasNewVersion && (latestVersion.baseModel !== currentLocalBase);

          const skipMsg = `IDLE: 캐시됨 (${Math.floor(diffHours)}h 전 확인)`;
          patchModel(model.model_path, { hasNewVersion, isNewBase, currentTask: skipMsg });
          onTaskChange?.(skipMsg);
          return;
        }

        updateTask(`API_FETCH: 최신 정보 조회 중...`);
        const civitData = await fetchCivitaiModel(modelId).catch(err => null);
        if (!civitData) return updateTask("IDLE: 상세 요청 실패");

        const allVersions = civitData.modelVersions || [];
        const latestVersion = allVersions[0]; 

        if (!latestVersion) return updateTask("IDLE: 서버 버전 정보 없음");

        // [판정 1] 새 버전: 이름이 존재하고, 공백 제거 후 비교했을 때 다를 때만
        const hasNewVersion = (localVersionName && latestVersion.name) 
          ? localVersionName.trim() !== latestVersion.name.trim()
          : false;
        
        // [판정 2] 새 베이스: 서버 최신 버전의 베이스가 로컬 베이스와 다를 때 (새 버전인 경우에만)
        const currentLocalBase = model.localBaseModel || model.baseModel || versionData?.baseModel;
        const isNewBase = hasNewVersion && (latestVersion.baseModel !== currentLocalBase);

        const nowISO = new Date().toISOString();
        const staticImage = latestVersion.images?.find((img: any) => {
          const url = img.url.toLowerCase();
          return !url.endsWith(".gif") && !url.endsWith(".mp4");
        });
        const selectedPreviewUrl = staticImage?.url || latestVersion.images?.[0]?.url;

        const meta = { 
          modelName: civitData.name, 
          latestVersion: latestVersion.name, 
          latestVersionId: latestVersion.id,
          latestVersionData: { ...latestVersion, lastFetchedAt: nowISO },
          hasNewVersion,
          isNewBase,
          baseModel: latestVersion.baseModel,
          localBaseModel: currentLocalBase,
          currentVersionId: localVersionId ? Number(localVersionId) : undefined,
          lastReleaseDate: latestVersion.createdAt,
          previewUrl: selectedPreviewUrl, 
          lastFetchedAt: nowISO,
          isNotFound: false 
        };

        await saveToDB(model, meta);
        patchModel(model.model_path, { ...meta, currentTask: "IDLE: 업데이트 확인 완료" });

        if (!model.preview_path && selectedPreviewUrl) {
          const imgUrl = selectedPreviewUrl;
          const ext = imgUrl.split('.').pop()?.split('?')[0] || 'png';
          api.downloadFile(model.model_path, imgUrl, `${baseName}.preview.${ext}`).then((res) => {
            patchModel(model.model_path, { preview_path: res.path, imageFetchFailed: false });
            saveToDB(model, { preview_path: res.path, imageFetchFailed: false } as any);
          }).catch(() => {
            patchModel(model.model_path, { imageFetchFailed: true });
            saveToDB(model, { imageFetchFailed: true });
          }).finally(() => { clearDownload(model.model_path); });
        }
      } else {
        patchModel(model.model_path, { 
          latestVersionId: versionData.id, 
          modelName: versionData.model?.name || versionData.modelName,
          latestVersion: versionData.name,
          latestVersionData: versionData,
          baseModel: versionData.baseModel,
          localBaseModel: versionData.baseModel,
          isNewBase: false,
          isNotFound: false,
          currentTask: "IDLE: 로드 완료"
        });
      }
    } catch (e: any) {
      updateTask(`IDLE: 오류 (${e?.message || "Unknown Error"})`);
    }
  }, [patchModel, saveToDB, clearDownload]);

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
      await api.deleteFiles(targets);
      for (const path of Array.from(selectedPaths)) {
        await db.deleteEntry(path);
        await db.deleteHash(path);
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
  hasNewVersion: m.hasNewVersion, lastReleaseDate: m.lastReleaseDate,
  lastFetchedAt: m.lastFetchedAt, isNotFound: m.isNotFound,
  imageFetchFailed: m.imageFetchFailed,
  currentTask: m.currentTask
});
