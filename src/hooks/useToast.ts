import { useState, useCallback } from "react";
import { ToastState } from "../types";

export const useToast = () => {
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
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 6000);
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, show: false }));
  }, []);

  return { toast, showNotification, hideToast };
};
