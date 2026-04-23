import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { ErrorLog } from "../types";

interface LogContextType {
  logs: ErrorLog[];
  addLog: (log: Omit<ErrorLog, "id" | "timestamp">) => void;
  clearLogs: () => void;
}

const LogContext = createContext<LogContextType | undefined>(undefined);

export const LogProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
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

  return (
    <LogContext.Provider value={{ logs, addLog, clearLogs }}>
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
