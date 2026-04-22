import { useState, useMemo, useCallback, useRef } from "react";
import { ModelWithStatus, ModelType, DirNode } from "../types";
import { api, fetchCivitaiModel, fetchCivitaiModelByHash } from "../api";
import { normalizePath, calculateIsOutdated } from "../utils";
import { db } from "../utils/db";

// --- Constants & Types ---
interface HashCacheEntry { hash: string; modified: number; }
interface UpdatePersistenceEntry {
  latestVersion?: string; latestVersionId?: number; hasNewVersion?: boolean;
  lastReleaseDate?: string; lastFetchedAt?: string; civitaiUrl?: string;
  previewUrl?: string; downloadUrl?: string; latestVersionData?: any;
  isNotFound?: boolean; imageFetchFailed?: boolean;
  modified: number;
}

const TTL_DEFAULT = 24;

export const useModels = (currentScanPath: string, filterMonths: number) => {
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
      let enriched = result.map(m => ({ ...m, isOutdated: calculateIsOutdated(m.modified, filterMonths) }));
      enriched = await applyUpdateCache(enriched);

      setModels(prev => {
        const existingMap = new Map(prev.map(m => [m.model_path, m]));
        const updated = enriched.map(m => {
          const ex = existingMap.get(m.model_path);
          return ex ? { ...m, ...getMetadataProps(ex) } : m;
        });
        if (!specificPath) return updated;
        const targetDir = normalizePath(specificPath);
        return [...prev.filter(m => !normalizePath(m.model_path).startsWith(targetDir)), ...updated];
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
        patchModel(model.model_path, { imageFetchFailed: false });
        await saveToDB(model, { imageFetchFailed: false });
      }
      if (!ignoreTTL && model.isNotFound) return updateTask("IDLE: SKIPPED (404 캐시)");

      let modelId = model.latestVersionData?.modelId || null;
      let currentVersionId = model.latestVersionData?.id || null;
      let versionData = model.latestVersionData || null;

      // 1. 로컬 파일에서 ID 복구
      if (!modelId && (model.info_path || model.json_path)) {
        updateTask("READ_LOCAL: 정보 파일 파싱 중...");
        try {
          const content = await api.readTextFile(model.info_path || model.json_path!);
          const parsed = JSON.parse(content);
          modelId = parsed.modelId; currentVersionId = parsed.id; versionData = parsed;
          if (modelId) {
            const url = `https://civitai.red/models/${modelId}`;
            await saveToDB(model, { 
              latestVersion: parsed.name, 
              latestVersionId: parsed.id, 
              civitaiUrl: url, 
              previewUrl: parsed.images?.[0]?.url, 
              lastReleaseDate: parsed.createdAt, // 배포 날짜 추가
              downloadUrl: parsed.downloadUrl,
              latestVersionData: parsed,
              lastFetchedAt: parsed.lastFetchedAt || new Date().toISOString() 
            });
            patchModel(model.model_path, { 
              civitaiUrl: url, 
              lastReleaseDate: parsed.createdAt,
              latestVersion: parsed.name,
              latestVersionId: parsed.id,
              latestVersionData: parsed
            });
            updateTask("CACHE_HIT: 로컬 파일에서 ID 획득");
          }
        } catch (e) {}
      }

      // 2. 404 마커 체크
      if (!modelId && !ignoreTTL) {
        const notFoundPath = `${baseName}.civitai.notfound`;
        if (await api.readTextFile(notFoundPath).then(() => true).catch(() => false)) {
          patchModel(model.model_path, { isNotFound: true });
          await saveToDB(model, { isNotFound: true });
          return updateTask("IDLE: 서버 정보 없음 (마커)");
        }
      }

      // 3. 해시 식별 (필요 시)
      if (!modelId || ignoreTTL) {
        let hash = "";
        const cached = await db.getHashEntry(model.model_path) as HashCacheEntry;

        if (!ignoreTTL && cached && cached.modified === model.modified) {
          updateTask("CACHE_HIT: 해시 캐시 사용");
          hash = cached.hash;
        } else {
          updateTask(`FAST_SCAN: 지문 추출 중${ignoreTTL ? " (FORCE)" : ""}...`);
          await new Promise(r => setTimeout(r, 10));
          hash = (await api.calculateModelHash(model.model_path)).substring(0, 8);
          await db.setHashEntry(model.model_path, { hash, modified: model.modified });
        }

        try {
          updateTask("API_FETCH: 모델 식별 중...");
          const data = await fetchCivitaiModelByHash(hash);
          modelId = data.modelId; currentVersionId = data.id; versionData = data;
          const url = `https://civitai.red/models/${modelId}`;
          await api.writeTextFile(`${baseName}.civitai.info`, JSON.stringify(data, null, 2)).catch(() => {});
          await saveToDB(model, { latestVersion: data.name, latestVersionId: data.id, civitaiUrl: url, previewUrl: data.images?.[0]?.url, lastFetchedAt: new Date().toISOString(), isNotFound: false, imageFetchFailed: false });
          patchModel(model.model_path, { isNotFound: false, imageFetchFailed: false, civitaiUrl: url });
        } catch (err: any) {
          if (err.status === 404) {
            await api.writeTextFile(`${baseName}.civitai.notfound`, JSON.stringify({ notFound: true, hash, timestamp: new Date().toISOString() })).catch(() => {});
            patchModel(model.model_path, { isNotFound: true });
            await saveToDB(model, { isNotFound: true });
            return updateTask("IDLE: 서버 정보 없음 (404)");
          }
          if (addLog) addLog({ method: "IDENT_FAIL", status: err.status, message: err.message, target: model.name });
          return updateTask(`IDLE: 식별 실패 (${err.status || "ERR"})`);
        }
      }

      if (!modelId || !versionData) return updateTask("IDLE: 데이터 없음");

      // 4. 최신 버전 확인 및 이미지 다운로드
      if (checkNewVersion) {
        const lastFetched = model.lastFetchedAt || versionData?.lastFetchedAt;
        const isFresh = !ignoreTTL && lastFetched && (Date.now() - new Date(lastFetched).getTime() < ttlHours * 3600000);
        const hasImage = !!model.preview_path || model.imageFetchFailed;

        if (isFresh && hasImage) return updateTask("IDLE: SKIPPED (최신 캐시)");

        updateTask(`API_FETCH: 최신 정보 ${ignoreTTL ? "강제 " : ""}조회 중...`);
        const civitData = await fetchCivitaiModel(modelId).catch(err => {
          if (addLog) addLog({ method: "API_ERR", status: err.status, message: err.message, target: model.name });
          return null;
        });

        if (!civitData) return updateTask("IDLE: 상세 요청 실패");

        const latest = civitData.modelVersions[0];
        const enriched = { ...latest, lastFetchedAt: new Date().toISOString() };
        const hasNewVersion = latest.id !== currentVersionId;
        
        // GIF 및 MP4가 아닌 첫 번째 이미지 찾기
        const staticImage = latest.images?.find((img: any) => {
          const url = img.url.toLowerCase();
          return !url.endsWith(".gif") && !url.endsWith(".mp4");
        });
        const selectedPreviewUrl = staticImage?.url || latest.images?.[0]?.url;

        await api.writeTextFile(`${baseName}.civitai.info`, JSON.stringify(enriched, null, 2)).catch(() => {});
        
        // DB에 hasNewVersion을 포함하여 저장
        await saveToDB(model, { 
          ...enriched, 
          latestVersion: latest.name,
          latestVersionId: latest.id,
          hasNewVersion,
          previewUrl: selectedPreviewUrl, // 선택된 이미지 저장
          isNotFound: false, 
          imageFetchFailed: latest.images?.length === 0 
        });

        patchModel(model.model_path, {
          latestVersion: latest.name, latestVersionId: latest.id, downloadUrl: latest.downloadUrl,
          previewUrl: selectedPreviewUrl, latestVersionData: enriched,
          hasNewVersion, lastReleaseDate: latest.createdAt,
          lastFetchedAt: enriched.lastFetchedAt, isNotFound: false, imageFetchFailed: latest.images?.length === 0
        });
        updateTask("IDLE: 업데이트 확인 완료");

        // 프리뷰 자동 다운로드 시에도 선택된 URL 사용
        if (!model.preview_path && selectedPreviewUrl) {
          const imgUrl = selectedPreviewUrl;
          const ext = imgUrl.split('.').pop()?.split('?')[0] || 'png';
          const savePath = `${baseName}.preview.${ext}`;
          api.downloadFile(model.model_path, imgUrl, savePath).then((finalPath) => {
            patchModel(model.model_path, { preview_path: finalPath, imageFetchFailed: false });
            saveToDB(model, { preview_path: finalPath, imageFetchFailed: false } as any);
          }).catch(() => {
            patchModel(model.model_path, { imageFetchFailed: true });
            saveToDB(model, { imageFetchFailed: true });
          });
        }
      } else {
        patchModel(model.model_path, { latestVersionId: currentVersionId, previewUrl: versionData.images?.[0]?.url, civitaiUrl: `https://civitai.red/models/${modelId}`, latestVersionData: versionData, isNotFound: false });
        updateTask("IDLE: 로드 완료");
      }
    } catch (e: any) {
      const errorMsg = e?.message || (typeof e === 'string' ? e : "Unknown Error");
      if (addLog) addLog({ method: "CRITICAL", message: errorMsg, target: model.name });
      updateTask(`IDLE: 오류 (${errorMsg})`);
    }
  }, [patchModel, saveToDB]);

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
      // DB에서도 삭제
      for (const path of Array.from(selectedPaths)) {
        await db.deleteEntry(path);
        await db.deleteHash(path);
      }
      setModels(prev => prev.filter(m => !selectedPaths.has(m.model_path)));
    } finally { setIsDeleting(false); }
  }, [models, isDeleting]);

  return { models, setModels, isScanning, isDeleting, scanFolder, updateModelInfo, deleteSelected };
};

const getMetadataProps = (m: ModelWithStatus) => ({
  latestVersion: m.latestVersion, latestVersionId: m.latestVersionId,
  downloadUrl: m.downloadUrl, previewUrl: m.previewUrl,
  latestVersionData: m.latestVersionData, civitaiUrl: m.civitaiUrl,
  hasNewVersion: m.hasNewVersion, lastReleaseDate: m.lastReleaseDate,
  lastFetchedAt: m.lastFetchedAt, isNotFound: m.isNotFound,
  imageFetchFailed: m.imageFetchFailed
});
