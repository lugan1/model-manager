import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { ToastState } from "../types";

interface ToastContextType {
  toast: ToastState;
  showNotification: (message: string, subMessage?: string, type?: "success" | "error" | "warning") => void;
  hideToast: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastState>({
    message: "",
    show: false,
    type: "success",
  });

  const showNotification = useCallback((
    message: string, 
    subMessage?: string, 
    type: "success" | "error" | "warning" = "success"
  ) => {
    setToast({ message, subMessage, show: true, type });
    // 토스트 자동 숨김 (6초)
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 6000);
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, show: false }));
  }, []);

  return (
    <ToastContext.Provider value={{ toast, showNotification, hideToast }}>
      {children}
    </ToastContext.Provider>
  );
};

export const useToastContext = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error("useToastContext must be used within a ToastProvider");
  }
  return context;
};
