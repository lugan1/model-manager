import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { ModelWithStatus, ModelInfo, CivitaiModelVersion } from "../types";
import { ModelService } from "../services/model.service";
import { DBService } from "../services/db.service";
import { normalizePath, calculateIsOutdated } from "../utils";
import { useSettings } from "./SettingsContext";
import { useFilter } from "./FilterContext";

interface ModelContextType {
  models: ModelWithStatus[];
  setModels: React.Dispatch<React.SetStateAction<ModelWithStatus[]>>;
  isScanning: boolean;
  isDeleting: boolean;
  selectedModels: Set<string>;
  setSelectedModels: React.Dispatch<React.SetStateAction<Set<string>>>;
  scanFolder: (specificPath?: string | null) => Promise<ModelInfo[] | undefined>;
  deleteSelected: () => Promise<void>;
  patchModel: (path: string, patch: Partial<ModelWithStatus>) => void;
  clearSelection: () => void;
  toggleModelSelection: (path: string) => void;
  deselectModel: (path: string) => void;
}

const ModelContext = createContext<ModelContextType | undefined>(undefined);

export const ModelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { paths } = useSettings();
  const { activeTab, filterMonths } = useFilter();
  
  const [models, setModels] = useState<ModelWithStatus[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  
  const scanningRef = useRef(false);

  const patchModel = useCallback((path: string, patch: Partial<ModelWithStatus>) => {
    setModels(prev => {
      const newPath = patch.model_path;
      
      // 경로가 변경되는데, 새 경로가 이미 목록에 존재하는 경우 (중복 방지)
      if (newPath && newPath !== path && prev.some(m => m.model_path === newPath)) {
        return prev
          .filter(m => m.model_path !== path) // 기존(V1) 항목 제거
          .map(m => m.model_path === newPath ? { ...m, ...patch } : m); // 이미 있는 V2 항목에 패치 적용
      }
      
      // 일반적인 패치 업데이트
      return prev.map(m => m.model_path === path ? { ...m, ...patch } : m);
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedModels(new Set()), []);

  const deselectModel = useCallback((path: string) => {
    setSelectedModels(prev => {
      if (!prev.has(path)) return prev;
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  }, []);

  const toggleModelSelection = useCallback((path: string) => {
    setSelectedModels(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const applyUpdateCache = useCallback(async (modelList: ModelWithStatus[]): Promise<ModelWithStatus[]> => {
    try {
      const cache = await DBService.getAllCachedData();
      if (!cache) return modelList;
      return modelList.map(m => {
        const entry = cache[m.model_path];
        if (entry && entry.modified === m.modified) {
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
    } catch (e) { return modelList; }
  }, []);

  const scanFolder = useCallback(async (specificPath?: string | null) => {
    const scanPath = specificPath || paths[activeTab].scan;
    if (scanningRef.current || !scanPath) return;
    
    scanningRef.current = true;
    setIsScanning(true);
    
    try {
      const result = await ModelService.scanModels(scanPath);
      let enriched: ModelWithStatus[] = result.map(m => ({ 
        ...m, 
        isOutdated: calculateIsOutdated(m.modified, filterMonths),
        stableModified: m.modified,
        currentTask: "IDLE: 대기 중"
      }));
      
      enriched = await applyUpdateCache(enriched);

      // --- 중복 경로 클리닝 로직 추가 ---
      const seenPaths = new Set<string>();
      const uniqueEnriched: ModelWithStatus[] = [];
      const duplicatePaths: string[] = [];

      for (const m of enriched) {
        if (seenPaths.has(m.model_path)) {
          duplicatePaths.push(m.model_path);
        } else {
          seenPaths.add(m.model_path);
          uniqueEnriched.push(m);
        }
      }

      // DB에서 중복된 잘못된 레코드들 삭제 (백그라운드)
      if (duplicatePaths.length > 0) {
        Promise.all(duplicatePaths.map(path => DBService.deleteLocalFile(path))).catch(console.error);
      }
      
      enriched = uniqueEnriched;
      // --------------------------------

      setModels(prev => {
        const existingMap = new Map(prev.map(m => [m.model_path, m]));
        const updated = enriched.map(m => {
          const ex = existingMap.get(m.model_path);
          if (ex) {
            if (ex.modified === m.modified && ex.size === m.size && ex.preview_path === m.preview_path) {
              return ex; 
            }
            return { ...m, ...ex, stableModified: ex.stableModified || m.modified };
          }
          return m;
        });

        if (!specificPath) return updated;
        
        const targetDir = normalizePath(specificPath);
        const filteredPrev = prev.filter(m => !normalizePath(m.model_path).startsWith(targetDir));
        return [...filteredPrev, ...updated];
      });
      
      return result;
    } finally {
      setIsScanning(false);
      scanningRef.current = false;
    }
  }, [paths, activeTab, filterMonths, applyUpdateCache]);

  const deleteSelected = useCallback(async () => {
    if (selectedModels.size === 0 || isDeleting) return;
    setIsDeleting(true);
    try {
      const targets: string[] = [];
      models.forEach(m => {
        if (selectedModels.has(m.model_path)) {
          targets.push(m.model_path);
          if (m.preview_path) targets.push(m.preview_path);
          if (m.info_path) targets.push(m.info_path);
          if (m.json_path) targets.push(m.json_path);
        }
      });
      
      await ModelService.deleteFiles(targets);
      
      for (const path of Array.from(selectedModels)) {
        await DBService.deleteLocalFile(path);
      }
      
      setModels(prev => prev.filter(m => !selectedModels.has(m.model_path)));
      setSelectedModels(new Set());
    } finally {
      setIsDeleting(false);
    }
  }, [models, selectedModels, isDeleting]);

  const contextValue = React.useMemo(() => ({
    models, setModels, isScanning, isDeleting,
    selectedModels, setSelectedModels,
    scanFolder, deleteSelected, patchModel,
    clearSelection, toggleModelSelection, deselectModel
  }), [
    models, isScanning, isDeleting, selectedModels, 
    scanFolder, deleteSelected, patchModel,
    clearSelection, toggleModelSelection, deselectModel
  ]);

  return (
    <ModelContext.Provider value={contextValue}>
      {children}
    </ModelContext.Provider>
  );
};

export const useModelContext = () => {
  const context = useContext(ModelContext);
  if (context === undefined) {
    throw new Error("useModelContext must be used within a ModelProvider");
  }
  return context;
};
