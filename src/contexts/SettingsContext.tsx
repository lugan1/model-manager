import React, { createContext, useContext, useState, useEffect } from "react";
import { ModelType } from "../types";

interface Paths {
  checkpoint: { scan: string };
  lora: { scan: string };
  lycoris: { scan: string };
}

interface SettingsContextType {
  paths: Paths;
  setPaths: React.Dispatch<React.SetStateAction<Paths>>;
  apiKey: string;
  setApiKey: (key: string) => void;
  updateTTL: number;
  setUpdateTTL: (ttl: number) => void;
  savePaths: (newPaths: Paths) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [paths, setPaths] = useState<Paths>(() => ({
    checkpoint: { scan: localStorage.getItem("checkpoint_scan_path") || "" },
    lora: { scan: localStorage.getItem("lora_scan_path") || "" },
    lycoris: { scan: localStorage.getItem("lycoris_scan_path") || "" }
  }));

  const [apiKey, setApiKeyState] = useState(() => localStorage.getItem("civitai_api_key") || "");
  const [updateTTL, setUpdateTTLState] = useState(() => Number(localStorage.getItem("update_ttl_hours")) || 24);

  const setApiKey = (key: string) => {
    setApiKeyState(key);
    localStorage.setItem("civitai_api_key", key);
  };

  const setUpdateTTL = (ttl: number) => {
    setUpdateTTLState(ttl);
    localStorage.setItem("update_ttl_hours", ttl.toString());
  };

  const savePaths = (newPaths: Paths) => {
    setPaths(newPaths);
    localStorage.setItem("checkpoint_scan_path", newPaths.checkpoint.scan);
    localStorage.setItem("lora_scan_path", newPaths.lora.scan);
    localStorage.setItem("lycoris_scan_path", newPaths.lycoris.scan);
  };

  return (
    <SettingsContext.Provider value={{ paths, setPaths, apiKey, setApiKey, updateTTL, setUpdateTTL, savePaths }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
};
