import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./main.css";

import { SettingsProvider } from "./contexts/SettingsContext";
import { FilterProvider } from "./contexts/FilterContext";
import { ModelProvider } from "./contexts/ModelContext";
import { ToastProvider } from "./contexts/ToastContext";
import { LogProvider } from "./contexts/LogContext";
import { BatchUpdateProvider } from "./contexts/BatchUpdateContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LogProvider>
      <ToastProvider>
        <SettingsProvider>
          <FilterProvider>
            <ModelProvider>
              <BatchUpdateProvider>
                <App />
              </BatchUpdateProvider>
            </ModelProvider>
          </FilterProvider>
        </SettingsProvider>
      </ToastProvider>
    </LogProvider>
  </React.StrictMode>
);
