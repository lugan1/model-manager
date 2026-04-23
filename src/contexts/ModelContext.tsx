import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { ModelWithStatus, ModelInfo } from "../types";
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
  const { paths, updateTTL } = useSettings();
  const { activeTab, filterMonths } = useFilter();
  
  const [models, setModels] = useState<ModelWithStatus[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  
  const scanningRef = useRef(false);

  const patchModel = useCallback((path: string, patch: Partial<ModelWithStatus>) => {
    setModels(prev => prev.map(m => m.model_path === path ? { ...m, ...patch } : m));
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
      const cache = await DBService.getAllUpdates();
      if (!cache) return modelList;
      return modelList.map(m => {
        const entry = cache[m.model_path];
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

      setModels(prev => {
        const existingMap = new Map(prev.map(m => [m.model_path, m]));
        const updated = enriched.map(m => {
          const ex = existingMap.get(m.model_path);
          if (ex) {
            // 메타데이터 유지 로직 (기존 useModels.ts의 getMetadataProps 활용)
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
        await DBService.deleteEntry(path);
        await DBService.deleteHash(path);
      }
      
      setModels(prev => prev.filter(m => !selectedModels.has(m.model_path)));
      setSelectedModels(new Set());
    } finally {
      setIsDeleting(false);
    }
  }, [models, selectedModels, isDeleting]);

  return (
    <ModelContext.Provider value={{
      models, setModels, isScanning, isDeleting,
      selectedModels, setSelectedModels,
      scanFolder, deleteSelected, patchModel,
      clearSelection, toggleModelSelection, deselectModel
    }}>
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
