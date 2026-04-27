import React, { useMemo, useState, useEffect } from "react";
import { FolderOpen, HardDrive, RefreshCw } from "lucide-react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import ModelCard from "../ModelCard";
import { useModelContext } from "../../contexts/ModelContext";
import { useFilter } from "../../contexts/FilterContext";
import { SettingsModal } from "../ui/SettingsModal";
import { LogViewerModal } from "../ui/LogViewerModal";
import { normalizePath } from "../../utils";
import { Toast } from "../ui/Toast";
import { useToast } from "../../hooks/useToast";
import { useErrorLogs } from "../../hooks/useErrorLogs";
import { ModelWithStatus } from "../../types";

const ModelCardSkeleton = React.memo(() => (
  <div className="relative group rounded-[2rem] overflow-hidden bg-[#1f2937] border border-[#374151] shadow-2xl h-[450px] animate-pulse">
    <div className="absolute inset-0 bg-gradient-to-br from-[#374151]/50 to-[#1f2937]/50" />
    <div className="absolute top-4 left-4 z-10">
      <div className="h-6 w-16 bg-[#374151] rounded-lg"></div>
    </div>
    <div className="w-full h-full flex flex-col items-center justify-center gap-6 opacity-20">
      <HardDrive className="size-24 text-[#9ca3af]" />
    </div>
    <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-[#0b0f19] via-[#0b0f19]/90 to-transparent">
      <div className="h-6 w-3/4 bg-[#374151] rounded mb-3"></div>
      <div className="h-3 w-1/2 bg-[#374151] rounded mb-4"></div>
      <div className="flex flex-col gap-3 mt-1">
        <div className="flex flex-col gap-2 w-full">
          <div className="w-full h-10 bg-[#374151]/50 rounded-xl border border-white/5"></div>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <div className="flex-[0.7] h-14 bg-[#374151] rounded-xl"></div>
        <div className="flex-[0.7] h-14 bg-[#374151] rounded-xl"></div>
        <div className="flex-[1.5] h-14 bg-[#374151] rounded-xl"></div>
      </div>
    </div>
  </div>
));

export const MainLayout: React.FC = () => {
  const { models, isScanning } = useModelContext();
  const { 
    deferredSearchTerm, sortBy, sortOrder, 
    showOnlyOutdated, showOnlyDuplicates, selectedDirPath 
  } = useFilter();
  const { toast, hideToast } = useToast();
  const { logs, clearLogs } = useErrorLogs();
  
  const [showSettings, setShowSettings] = useState(false);
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [visibleCount, setVisibleCount] = useState(30);

  // 필터링 및 정렬 로직
  const filteredModels = useMemo(() => {
    if (isScanning && models.length === 0) return [];
    
    let result = [...models];

    if (deferredSearchTerm) {
      const term = deferredSearchTerm.toLowerCase();
      result = result.filter(m => 
        m.name.toLowerCase().includes(term) || 
        m.modelName?.toLowerCase().includes(term) ||
        m.category.toLowerCase().includes(term)
      );
    }

    if (selectedDirPath) {
      const normalizedSelected = normalizePath(selectedDirPath);
      result = result.filter(m => normalizePath(m.model_path).startsWith(normalizedSelected));
    }

    if (showOnlyOutdated) result = result.filter(m => m.isOutdated);
    if (showOnlyDuplicates) {
      const nameGroups = new Map<string, number>();
      result.forEach(m => nameGroups.set(m.name, (nameGroups.get(m.name) || 0) + 1));
      result = result.filter(m => (nameGroups.get(m.name) || 0) > 1);
    }

    result.sort((a, b) => {
      let valA: any, valB: any;
      if (sortBy === "name") {
        // 1순위: 모델 정체성 그룹화 (Civitai 모델명이 있으면 우선 사용)
        // 2순위: 파일명 (버전 차이 등 반영)
        const primaryA = (a.modelName || a.name).toLowerCase();
        const primaryB = (b.modelName || b.name).toLowerCase();
        
        // 자연어 정렬 (Numeric: true) 적용하여 A1, A2, A10 순서 보장
        const cmp = primaryA.localeCompare(primaryB, undefined, { numeric: true, sensitivity: 'base' });
        
        if (cmp !== 0) return sortOrder === "asc" ? cmp : -cmp;
        
        // 모델명이 같으면 파일명으로 최종 정렬
        const subCmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase(), undefined, { numeric: true });
        return sortOrder === "asc" ? subCmp : -subCmp;
      }
      
      if (sortBy === "size") { valA = a.size; valB = b.size; }
      else { valA = a.stableModified || a.modified; valB = b.stableModified || b.modified; }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [models, isScanning, deferredSearchTerm, sortBy, sortOrder, showOnlyOutdated, showOnlyDuplicates, selectedDirPath]);

  // 점진적 렌더링 로직: 목록이 바뀌면 초기화 후 점진적으로 증가
  useEffect(() => {
    setVisibleCount(30);
    
    if (filteredModels.length > 30) {
      const interval = setInterval(() => {
        setVisibleCount(prev => {
          if (prev >= filteredModels.length) {
            clearInterval(interval);
            return prev;
          }
          return prev + 30;
        });
      }, 100);
      return () => clearInterval(interval);
    }
  }, [filteredModels.length, deferredSearchTerm, selectedDirPath, sortBy, sortOrder]);

  // 그룹화 로직 (Layout Shift 방지를 위해 전체 항목 기준으로 그룹화)
  const groupedModels = useMemo(() => {
    if (!selectedDirPath) return { "": filteredModels };

    const normalizedBase = normalizePath(selectedDirPath);
    const groups: Record<string, ModelWithStatus[]> = {};

    filteredModels.forEach(m => {
      const normalizedPath = normalizePath(m.model_path);
      const relative = normalizedPath.substring(normalizedBase.length).replace(/^[\\\/]/, "");
      const parts = relative.split(/[\\\/]/);
      const groupName = parts.length > 1 ? parts[0] : ".";
      
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(m);
    });

    const sortedGroupNames = Object.keys(groups).sort((a, b) => {
      if (a === ".") return -1;
      if (b === ".") return 1;
      return a.localeCompare(b);
    });

    const sortedGroups: Record<string, ModelWithStatus[]> = {};
    sortedGroupNames.forEach(name => {
      sortedGroups[name] = groups[name];
    });

    return sortedGroups;
  }, [filteredModels, selectedDirPath]);

  // 통계 계산
  const stats = useMemo(() => {
    return filteredModels.reduce((acc, m) => {
      if (m.isNewBase) acc.newBase++;
      else if (m.hasNewVersion) acc.newVersion++;
      return acc;
    }, { newVersion: 0, newBase: 0 });
  }, [filteredModels]);

  return (
    <div className="flex flex-col h-screen bg-[#0b0f19] text-white font-sans selection:bg-[#ff9a00]/30 overflow-hidden">
      <Header 
        onShowSettings={() => setShowSettings(true)} 
        onShowLogs={() => setShowLogViewer(true)} 
      />

      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        <Sidebar />

        <main className="flex-1 flex flex-col min-w-0 bg-[#0b0f19] relative">
          {/* Slim Info Bar */}
          <div className="px-8 py-3 bg-black/40 border-b border-[#374151] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <FolderOpen className="size-4 text-[#ff9a00] shrink-0" />
              <span className="text-[11px] font-bold text-[#9ca3af] truncate font-mono bg-black/40 px-2 py-0.5 rounded border border-white/5">
                {selectedDirPath || "Scanning..."}
              </span>
            </div>

            <div className="flex items-center gap-4 shrink-0 ml-4">
              <div className="flex items-center gap-4 px-4 py-1 bg-black/20 rounded-xl border border-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-[#4b5563] uppercase tracking-tighter">Total</span>
                  <span className="text-sm font-black text-white">{filteredModels.length}</span>
                </div>
                <div className="w-[1px] h-3 bg-[#374151]"></div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-[#ff9a00] uppercase tracking-tighter">New Ver</span>
                  <span className={`text-sm font-black ${stats.newVersion > 0 ? "text-[#ff9a00] animate-pulse" : "text-[#4b5563]"}`}>
                    {stats.newVersion}
                  </span>
                </div>
                <div className="w-[1px] h-3 bg-[#374151]"></div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-purple-400 uppercase tracking-tighter">New Base</span>
                  <span className={`text-sm font-black ${stats.newBase > 0 ? "text-purple-400 animate-pulse" : "text-[#4b5563]"}`}>
                    {stats.newBase}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-10">
            {filteredModels.length === 0 && isScanning ? (
              <div className="h-full flex flex-col items-center justify-center opacity-20">
                <RefreshCw className="size-12 animate-spin mb-4 text-[#ff9a00]" />
                <p className="text-xl font-black uppercase tracking-widest text-[#ff9a00]">Scanning Filesystem...</p>
              </div>
            ) : (
              <>
                {(() => {
                  let renderedCount = 0;
                  return Object.entries(groupedModels).map(([groupName, groupModels]) => {
                    if (renderedCount >= visibleCount) return null;
                    
                    const toRender = groupModels.slice(0, visibleCount - renderedCount);
                    renderedCount += toRender.length;
                    
                    return (
                      <div key={groupName} className="mb-16 last:mb-0">
                        {groupName !== "" && (
                          <div className="flex items-center gap-4 mb-8">
                            <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent via-[#374151] to-transparent"></div>
                            <div className="flex items-center gap-3 px-6 py-2 bg-[#1f2937] border-2 border-[#374151] rounded-2xl shadow-xl">
                              <FolderOpen className="size-5 text-[#ff9a00]" />
                              <span className="text-xl font-black uppercase tracking-widest text-[#ff9a00]">
                                {groupName === "." ? (selectedDirPath?.split(/[\\\/]/).pop() || "Root") : groupName}
                              </span>
                              <span className="bg-black/40 px-3 py-1 rounded-lg text-xs font-bold text-[#9ca3af]">
                                {groupModels.length}
                              </span>
                            </div>
                            <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent via-[#374151] to-transparent"></div>
                          </div>
                        )}
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-10">
                          {toRender.map(model => (
                            <ModelCard key={model.model_path} model={model} />
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}

                {!isScanning && filteredModels.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center opacity-20 pointer-events-none">
                    <p className="text-4xl font-black uppercase tracking-widest">No Models Found</p>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      <SettingsModal show={showSettings} onClose={() => setShowSettings(false)} />
      <LogViewerModal 
        show={showLogViewer} 
        onClose={() => setShowLogViewer(false)} 
        logs={logs}
        onClear={clearLogs}
      />
      <Toast toast={toast} onClose={hideToast} />
    </div>
  );
};
