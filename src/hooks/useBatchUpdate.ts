import { useState, useCallback } from "react";
import { ModelWithStatus } from "../types";
import { useModelUpdate } from "./useModelUpdate";

interface UpdateStatus {
  current: number;
  total: number;
  fetched: number;
  skipped: number;
  mode: "STANDARD" | "FORCE" | "INIT" | "";
  name: string;
  task: string;
  results: { name: string; status: "fetched" | "skipped" | "error"; message: string }[];
}

export const useBatchUpdate = (addLog?: any) => {
  const { updateModelInfo } = useModelUpdate(addLog);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ 
    current: 0, total: 0, fetched: 0, skipped: 0, mode: "", 
    name: "", task: "", results: [] 
  });
  const [showUpdateReport, setShowUpdateReport] = useState(false);

  const updateLatestVersionsInParallel = useCallback(async (modelList: ModelWithStatus[], forceRefresh = false) => {
    const total = modelList.length;
    if (total === 0) return;
    
    setIsUpdating(true);
    const mode = forceRefresh ? "FORCE" : "STANDARD";
    const cpuCores = navigator.hardwareConcurrency || 4;
    const dynamicChunkSize = Math.min(Math.max(cpuCores * 5, 10), 100);
    
    setUpdateStatus({ current: 0, total, fetched: 0, skipped: 0, mode, name: "BATCH_START", task: `[${mode}] 처리 시작...`, results: [] });
    
    let lastUiUpdateTime = 0;
    const UI_UPDATE_INTERVAL = 100;

    for (let i = 0; i < total; i += dynamicChunkSize) {
      const chunk = modelList.slice(i, i + dynamicChunkSize);
      const activeTasks = new Map<string, string>();
      
      await Promise.all(chunk.map(async (m) => {
        try {
          await updateModelInfo(m, { checkNewVersion: true, ignoreTTL: forceRefresh }, (task) => {
            activeTasks.set(m.name, task);
            const now = Date.now();
            if (now - lastUiUpdateTime > UI_UPDATE_INTERVAL) {
              lastUiUpdateTime = now;
              setUpdateStatus(prev => ({ ...prev, name: m.name, task }));
            }
          });
          
          setUpdateStatus(prev => ({ 
            ...prev, 
            current: prev.current + 1,
            fetched: prev.fetched + 1 
          }));
        } catch (err: any) {
          addLog?.({
            method: mode,
            target: m.name,
            message: err.message || "Batch update failed",
            status: err.status
          });
          setUpdateStatus(prev => ({ 
            ...prev, 
            current: prev.current + 1,
            skipped: prev.skipped + 1 
          }));
        }
      }));
    }

    setIsUpdating(false);
    setShowUpdateReport(true);
  }, [updateModelInfo, addLog]);

  return { 
    isUpdating, 
    updateStatus, 
    showUpdateReport, 
    setShowUpdateReport, 
    updateLatestVersionsInParallel 
  };
};
