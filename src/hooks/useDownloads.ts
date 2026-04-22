import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { DownloadProgress } from "../types";

export const useDownloads = () => {
  const [downloads, setDownloads] = useState<Record<string, DownloadProgress>>({});

  useEffect(() => {
    const unlisten = listen<DownloadProgress>("download-progress", (event) => {
      setDownloads(prev => ({
        ...prev,
        [event.payload.id]: event.payload
      }));
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  const clearDownload = useCallback((id: string) => {
    setDownloads(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  return { downloads, clearDownload };
};
