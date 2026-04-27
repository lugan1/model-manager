import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";
import { ErrorLog } from "../types";
import { DBService } from "../services/db.service";

interface LogContextType {
  logs: ErrorLog[];
  addLog: (log: Omit<ErrorLog, "id" | "timestamp">) => void;
  deleteLog: (id: string) => void;
  deleteLogByPath: (path: string) => void;
  clearLogs: () => void;
}

const LogContext = createContext<LogContextType | undefined>(undefined);

export const LogProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [logs, setLogs] = useState<ErrorLog[]>([]);

  // DB에서 로그 초기화
  useEffect(() => {
    DBService.getErrorLogs().then(loadedLogs => {
      setLogs(loadedLogs);
    }).catch(err => {
      console.error("[LogContext] Failed to load logs from DB:", err);
    });
  }, []);

  const addLog = useCallback((log: Omit<ErrorLog, "id" | "timestamp">) => {
    const newLog: ErrorLog = {
      ...log,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleString(), // 더 정확한 시각 저장을 위해 localeString 사용
    };
    
    setLogs(prev => {
      const updated = [newLog, ...prev].slice(0, 100);
      return updated;
    });

    // DB 비동기 저장
    DBService.saveErrorLog(newLog).catch(err => {
      console.error("[LogContext] Failed to save log to DB:", err);
    });
  }, []);

  const deleteLog = useCallback((id: string) => {
    setLogs(prev => prev.filter(l => l.id !== id));
    DBService.deleteErrorLog(id).catch(err => {
      console.error("[LogContext] Failed to delete log from DB:", err);
    });
  }, []);

  const deleteLogByPath = useCallback((path: string) => {
    setLogs(prev => prev.filter(l => l.path !== path));
    // DB에서도 해당 경로의 모든 로그 삭제 (비동기)
    DBService.getErrorLogs().then(allLogs => {
      const targets = allLogs.filter(l => l.path === path);
      return Promise.all(targets.map(t => DBService.deleteErrorLog(t.id)));
    }).catch(console.error);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
    DBService.clearErrorLogs().catch(err => {
      console.error("[LogContext] Failed to clear logs from DB:", err);
    });
  }, []);

  return (
    <LogContext.Provider value={{ logs, addLog, deleteLog, deleteLogByPath, clearLogs }}>
      {children}
    </LogContext.Provider>
  );
};

export const useLogContext = () => {
  const context = useContext(LogContext);
  if (context === undefined) {
    throw new Error("useLogContext must be used within a LogProvider");
  }
  return context;
};
