import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { ModelWithStatus } from "../types";
import { useModelUpdate } from "../hooks/useModelUpdate";
import { useErrorLogs } from "../hooks/useErrorLogs";
import { useDownloads } from "../hooks/useDownloads";
import { normalizeError } from "../utils";

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

interface BatchUpdateContextType {
  isUpdating: boolean;
  isPaused: boolean;
  updateStatus: UpdateStatus;
  showUpdateReport: boolean;
  setShowUpdateReport: (show: boolean) => void;
  updateLatestVersionsInParallel: (modelList: ModelWithStatus[], forceRefresh?: boolean) => Promise<void>;
  pauseBatchUpdate: () => void;
  resumeBatchUpdate: () => void;
  cancelBatchUpdate: () => void;
}

const BatchUpdateContext = createContext<BatchUpdateContextType | undefined>(undefined);

export const BatchUpdateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { addLog } = useErrorLogs();
  const { clearDownload } = useDownloads();
  const { updateModelInfo } = useModelUpdate(addLog, clearDownload);
  
  const [isUpdating, setIsUpdating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ 
    current: 0, total: 0, fetched: 0, skipped: 0, mode: "", 
    name: "", task: "", results: [] 
  });
  const [showUpdateReport, setShowUpdateReport] = useState(false);

  const isPausedRef = useRef(false);
  const cancelRef = useRef(false);

  const pauseBatchUpdate = useCallback(() => {
    isPausedRef.current = true;
    setIsPaused(true);
  }, []);

  const resumeBatchUpdate = useCallback(() => {
    isPausedRef.current = false;
    setIsPaused(false);
  }, []);

  const cancelBatchUpdate = useCallback(() => {
    cancelRef.current = true;
    isPausedRef.current = false;
    setIsPaused(false);
  }, []);

  const updateLatestVersionsInParallel = useCallback(async (modelList: ModelWithStatus[], forceRefresh = false) => {
    if (isUpdating) {
      console.warn("[BatchUpdate] Update already in progress. Ignoring request.");
      return;
    }

    const total = modelList.length;
    if (total === 0) return;
    
    setIsUpdating(true);
    setIsPaused(false);
    isPausedRef.current = false;
    cancelRef.current = false;

    const mode = forceRefresh ? "FORCE" : "STANDARD";
    
    setUpdateStatus({ 
      current: 0, total, fetched: 0, skipped: 0, mode, 
      name: "BATCH_START", task: `[${mode}] 처리 시작...`, results: [] 
    });
    
    let lastUiUpdateTime = 0;
    const UI_UPDATE_INTERVAL = 100;
    // 고사양 PC 사양을 활용하기 위해 CPU 코어 수에 비례하여 동적으로 할당 (최대 32개)
    const cpuCores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 8) : 8;
    const CONCURRENCY = Math.min(cpuCores * 2, 32); 

    // 작업 큐 (인덱스 추적)
    let nextIndex = 0;
    let completedCount = 0;

    // 전체 모델 대상인지 여부 (모델 리스트가 크면 전체로 간주하여 최적화 적용)
    // 10개 이하로 선택된 경우 사용자의 명시적 요청으로 보고 스킵 로직을 완화함
    const isSmallSelection = modelList.length <= 10;

    // 개별 워커 실행기
    const runWorker = async () => {
      while (nextIndex < total && !cancelRef.current) {
        // 일시정지 체크
        while (isPausedRef.current && !cancelRef.current) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (cancelRef.current) break;

        const currentIndex = nextIndex++;
        const m = modelList[currentIndex];

        try {
          // 기존 정보가 있고 강제 새로고침이 아니며, 대량 처리 중인 경우만 스킵
          if (!forceRefresh && !isSmallSelection && (m.info_path || m.json_path)) {
            completedCount++;
            setUpdateStatus(prev => {
              // 현재 실행 중인 작업의 결과가 아니면(total이 다르면) 업데이트 무시하여 꼬임 방지
              if (prev.total !== total) return prev;
              return {
                ...prev,
                current: completedCount,
                skipped: prev.skipped + 1
              };
            });
            continue;
          }

          await updateModelInfo(m, { checkNewVersion: true, ignoreTTL: forceRefresh }, (task) => {
            const now = Date.now();
            if (now - lastUiUpdateTime > UI_UPDATE_INTERVAL) {
              lastUiUpdateTime = now;
              setUpdateStatus(prev => {
                if (prev.total !== total) return prev;
                return { ...prev, name: m.name, task };
              });
            }
          });

          completedCount++;
          setUpdateStatus(prev => {
            if (prev.total !== total) return prev;
            return {
              ...prev,
              current: completedCount,
              fetched: prev.fetched + 1
            };
          });
        } catch (err: any) {
          addLog?.({
            method: mode,
            target: m.name,
            message: normalizeError(err),
            status: err.status
          });
          completedCount++;
          setUpdateStatus(prev => {
            if (prev.total !== total) return prev;
            return {
              ...prev,
              current: completedCount,
              skipped: prev.skipped + 1
            };
          });
        }
      }
    };

    // 워커들을 병렬로 실행
    const workers = Array(Math.min(CONCURRENCY, total)).fill(null).map(() => runWorker());
    await Promise.all(workers);

    const wasCancelled = cancelRef.current;
    setIsUpdating(false);
    setIsPaused(false);
    if (!wasCancelled) {
      setShowUpdateReport(true);
    }
  }, [updateModelInfo, addLog, isUpdating]);

  return (
    <BatchUpdateContext.Provider value={{
      isUpdating, isPaused, updateStatus, showUpdateReport, setShowUpdateReport,
      updateLatestVersionsInParallel, pauseBatchUpdate, resumeBatchUpdate, cancelBatchUpdate
    }}>
      {children}
    </BatchUpdateContext.Provider>
  );
};

export const useBatchUpdateContext = () => {
  const context = useContext(BatchUpdateContext);
  if (context === undefined) {
    throw new Error("useBatchUpdateContext must be used within a BatchUpdateProvider");
  }
  return context;
};
