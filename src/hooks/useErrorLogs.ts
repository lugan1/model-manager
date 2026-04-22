import { useState, useCallback } from "react";
import { ErrorLog } from "../types";

export const useErrorLogs = () => {
  const [logs, setLogs] = useState<ErrorLog[]>([]);

  const addLog = useCallback((log: Omit<ErrorLog, "id" | "timestamp">) => {
    const newLog: ErrorLog = {
      ...log,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
    };
    setLogs(prev => [newLog, ...prev].slice(0, 100)); // 최근 100개만 유지
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return { logs, addLog, clearLogs };
};
