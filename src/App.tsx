import { useState, useEffect, useMemo, useCallback, useDeferredValue } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Layers, RefreshCw, Database } from "lucide-react";

import { ModelWithStatus, ModelType, DirNode } from "./types";
import { normalizePath } from "./utils";
import { db } from "./utils/db";
import { api } from "./api";
import { useToast } from "./hooks/useToast";
import { useDownloads } from "./hooks/useDownloads";
import { useModels } from "./hooks/useModels";
import { useDownloadAction } from "./hooks/useDownloadAction";
import { useErrorLogs } from "./hooks/useErrorLogs";

import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { Toast } from "./components/ui/Toast";
import { SettingsModal } from "./components/ui/SettingsModal";
import { LogViewerModal } from "./components/ui/LogViewerModal";
import ModelCard from "./components/ModelCard";

function App() {
  // --- States ---
  const [activeTab, setActiveTab] = useState<ModelType>(() => (localStorage.getItem("active_tab") as ModelType) || "checkpoint");
  const [paths, setPaths] = useState(() => ({
    checkpoint: { scan: localStorage.getItem("checkpoint_scan_path") || "" },
    lora: { scan: localStorage.getItem("lora_scan_path") || "" }
  }));
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [sortBy, setSortBy] = useState<"name" | "size" | "modified">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [selectedDirPath, setSelectedDirPath] = useState<string | null>(null);
  const [showOnlyOutdated, setShowOnlyOutdated] = useState(false);
  const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false);
  const [filterMonths, setFilterMonths] = useState(6);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("civitai_api_key") || "");
  const [showSettings, setShowSettings] = useState(false);
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateTTL, setUpdateTTL] = useState(() => Number(localStorage.getItem("update_ttl_hours")) || 24);
  const [updateStatus, setUpdateStatus] = useState({ 
    current: 0, total: 0, fetched: 0, skipped: 0, mode: "" as "STANDARD" | "FORCE" | "INIT" | "", 
    name: "", task: "", results: [] as { name: string; status: "fetched" | "skipped" | "error"; message: string }[] 
  });
  const [showUpdateReport, setShowUpdateReport] = useState(false);

  // --- Custom Hooks ---
  const currentScanPath = paths[activeTab].scan;
  const { toast, showNotification, hideToast } = useToast();
  const { downloads, clearDownload } = useDownloads();
  const { models, isScanning, isDeleting, scanFolder, updateModelInfo, deleteSelected } = useModels(currentScanPath, filterMonths);
  const { startDownload } = useDownloadAction(apiKey, showNotification, scanFolder, clearDownload);
  const { logs, addLog, clearLogs } = useErrorLogs();

  // --- Logic ---

  const updateLatestVersionsInParallel = useCallback(async (modelList: ModelWithStatus[], forceRefresh = false) => {
    const total = modelList.length;
    if (total === 0) return;
    const mode = forceRefresh ? "FORCE" : "STANDARD";
    setUpdateStatus({ current: 0, total, fetched: 0, skipped: 0, mode, name: "BATCH_START", task: `[${mode}] 처리 시작...`, results: [] });
    
    const chunkSize = 3;
    for (let i = 0; i < total; i += chunkSize) {
      const chunk = modelList.slice(i, i + chunkSize);
      const activeTasks = new Map<string, string>();
      await Promise.all(chunk.map(async (m) => {
        let finalTask = "IDLE: PENDING";
        try {
          await updateModelInfo(m, addLog, { checkNewVersion: true, ignoreTTL: forceRefresh, ttlHours: updateTTL }, (task) => {
            activeTasks.set(m.name, task);
            finalTask = task;
            const activeEntry = Array.from(activeTasks.entries()).find(([_, t]) => !t.startsWith("IDLE"));
            setUpdateStatus(p => ({ ...p, name: activeEntry ? activeEntry[0] : m.name, task: activeEntry ? activeEntry[1] : task }));
          });
        } catch (err: any) { finalTask = `IDLE: ERROR (${err.message || "Unknown"})`; }
        finally {
          const isSkipped = ["SKIPPED", "캐시", "로드 완료"].some(k => finalTask.includes(k));
          const isError = ["오류", "실패", "ERROR"].some(k => finalTask.includes(k));
          const status = isError ? "error" : (isSkipped ? "skipped" : "fetched");
          setUpdateStatus(p => {
            const nextResults = [...p.results, { name: m.name, status, message: finalTask.replace("IDLE: ", "") }];
            return { ...p, current: nextResults.length, fetched: nextResults.filter(r => r.status === "fetched").length, skipped: nextResults.filter(r => r.status === "skipped").length, results: nextResults };
          });
        }
      }));
    }
    setUpdateStatus(p => ({ ...p, name: "BATCH_COMPLETE", task: "모든 처리가 완료되었습니다." }));
    setTimeout(() => { setShowUpdateReport(true); setIsUpdating(false); }, 300);
  }, [updateModelInfo, addLog, updateTTL]);

  const handleRefresh = async (checkUpdates = false, forceRefresh = false) => {
    if (isUpdating) return; 
    const res = await scanFolder(selectedDirPath);
    if (checkUpdates && res) {
      setIsUpdating(true);
      const targets = res.filter(m => !selectedDirPath || normalizePath(m.model_path).startsWith(normalizePath(selectedDirPath)));
      await updateLatestVersionsInParallel(targets, forceRefresh);
    }
  };

  const handleResetCache = async () => {
    if (confirm("모델 식별 정보 및 업데이트 캐시를 삭제하시겠습니까?\n(API 키 및 스캔 경로 설정은 유지됩니다)")) {
      try {
        await db.clearAll();
        addLog({ method: "CACHE", status: 200, message: "캐시 전체 초기화 완료", target: "SYSTEM" });
        showNotification("캐시 초기화 완료", "모든 모델 캐시 정보가 삭제되었습니다.", "success");
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } catch (err: any) {
        const msg = err?.message || "알 수 없는 오류";
        addLog({ method: "CACHE", status: 500, message: `초기화 실패: ${msg}`, target: "SYSTEM" });
        showNotification("초기화 실패", `캐시를 삭제하는 중 오류가 발생했습니다: ${msg}`, "error");
      }
    }
  };

  // --- Effects ---
  useEffect(() => { localStorage.setItem("active_tab", activeTab); setSelectedDirPath(null); if (currentScanPath) scanFolder(); }, [activeTab, scanFolder, currentScanPath]);
  useEffect(() => { localStorage.setItem("checkpoint_scan_path", paths.checkpoint.scan); localStorage.setItem("lora_scan_path", paths.lora.scan); }, [paths]);

  const handleSelectFolder = async (type: 'scan', modelType: ModelType) => {
    const selected = await open({ directory: true, multiple: false, defaultPath: paths[modelType][type] });
    if (selected && typeof selected === 'string') setPaths(p => ({ ...p, [modelType]: { ...p[modelType], [type]: selected } }));
  };

  const handleUpdateSelected = async () => {
    const toUpdate = models.filter(m => selectedModels.has(m.model_path) && m.hasNewVersion);
    if (toUpdate.length === 0) return showNotification("업데이트 가능 모델 없음", "새 버전이 있는 모델을 선택해주세요.", "warning");
    if (!confirm(`${toUpdate.length}개의 모델을 업데이트하시겠습니까?`)) return;
    for (const model of toUpdate) await startDownload(model, { model: true, preview: true, info: true });
  };

  const handleDeleteSelected = async () => {
    if (!confirm(`선택한 ${selectedModels.size}개의 모델 파일을 정말 삭제하시겠습니까?\n(모델 파일, 이미지, 정보 파일 및 캐시가 모두 영구 삭제됩니다)`)) return;
    await deleteSelected(selectedModels);
    setSelectedModels(new Set());
  };

  const handleClearCacheSelected = async () => {
    if (!confirm(`선택한 ${selectedModels.size}개의 DB 캐시 정보(식별 정보, 최신 버전 정보 등)를 삭제하시겠습니까?\n(실제 모델 파일은 삭제되지 않습니다)`)) return;
    for (const path of Array.from(selectedModels)) {
      await db.deleteEntry(path);
      await db.deleteHash(path);
    }
    showNotification("캐시 삭제 완료", `${selectedModels.size}개의 모델 정보를 초기화했습니다.`, "success");
    setSelectedModels(new Set());
    // 화면 갱신을 위해 스캔 수행
    scanFolder(selectedDirPath);
  };

  const handleDeletePreviewsSelected = async () => {
    const targets: string[] = [];
    models.forEach(m => {
      if (selectedModels.has(m.model_path) && m.preview_path) {
        targets.push(m.preview_path);
      }
    });

    if (targets.length === 0) {
      return showNotification("삭제할 이미지 없음", "선택한 모델 중 로컬 이미지가 있는 모델이 없습니다.", "warning");
    }

    if (!confirm(`선택한 모델의 프리뷰 이미지 ${targets.length}개를 삭제하시겠습니까?\n(DB 정보 및 모델 파일은 유지됩니다)`)) return;

    try {
      await api.deleteFiles(targets);
      // DB에서도 이미지 정보 제거
      for (const path of Array.from(selectedModels)) {
        const model = models.find(m => m.model_path === path);
        if (model) {
          await db.setUpdateEntry(path, { 
            ...model.latestVersionData, 
            previewUrl: undefined, 
            imageFetchFailed: true, 
            modified: model.modified 
          });
        }
      }
      showNotification("이미지 삭제 완료", `${targets.length}개의 프리뷰 이미지를 삭제했습니다.`, "success");
      setSelectedModels(new Set());
      scanFolder(selectedDirPath);
    } catch (err: any) {
      const errorMsg = err?.message || err?.toString() || "알 수 없는 오류";
      addLog({ method: "DELETE_IMG", status: 500, message: `이미지 삭제 실패: ${errorMsg}`, target: "MULTIPLE" });
      showNotification("삭제 실패", `이미지 삭제 중 오류가 발생했습니다: ${errorMsg}`, "error");
    }
  };

  // --- Memos ---
  const displayModels = useMemo(() => {
    let filtered = models.filter(m => (!selectedDirPath || normalizePath(m.model_path).startsWith(normalizePath(selectedDirPath))));
    if (showOnlyOutdated) filtered = filtered.filter(m => m.isOutdated);
    if (showOnlyDuplicates) {
      const counts: Record<string, number> = {};
      models.forEach(m => counts[m.name] = (counts[m.name] || 0) + 1);
      filtered = filtered.filter(m => counts[m.name] > 1);
    }
    if (deferredSearchTerm) {
      const low = deferredSearchTerm.toLowerCase();
      filtered = filtered.filter(m => m.name.toLowerCase().includes(low) || m.category.toLowerCase().includes(low));
    }
    return filtered.sort((a, b) => {
      const cmp = sortBy === "name" ? a.name.localeCompare(b.name) : sortBy === "size" ? a.size - b.size : a.modified - b.modified;
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [models, showOnlyOutdated, showOnlyDuplicates, deferredSearchTerm, sortBy, sortOrder, selectedDirPath]);

  const dirTree = useMemo(() => {
    const root: DirNode = { name: "전체 모델", path: "", children: {} };
    const base = normalizePath(currentScanPath);
    models.forEach(m => {
      const full = normalizePath(m.model_path);
      if (!full.startsWith(base)) return;
      const parts = full.substring(base.length).replace(/^\\+/, "").split("\\");
      parts.pop();
      let curr = root; let currP = base;
      parts.forEach(p => { currP = `${currP}\\${p}`; if (!curr.children[p]) curr.children[p] = { name: p, path: currP, children: {} }; curr = curr.children[p]; });
    });
    return root;
  }, [models, currentScanPath]);

  const groupedModels = useMemo(() => {
    const g: Record<string, ModelWithStatus[]> = {};
    displayModels.forEach(m => { const c = m.category || "기타"; if (!g[c]) g[c] = []; g[c].push(m); });
    return g;
  }, [displayModels]);

  const progressPercent = updateStatus.total > 0 ? Math.round((updateStatus.current / updateStatus.total) * 100) : 0;

  return (
    <div className="relative flex flex-col h-screen bg-[#0b0f19] text-[#e5e7eb] font-sans overflow-hidden">
      {(isScanning || isDeleting) && (
        <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center">
          <div className="bg-[#1f2937] border-2 border-[#374151] p-20 rounded-[60px] shadow-2xl flex flex-col items-center gap-12 scale-110 max-w-4xl w-full mx-10">
            <RefreshCw className="size-32 text-[#ff9a00] animate-spin stroke-[3px]" />
            <h2 className="text-4xl font-black text-white uppercase tracking-tighter">{isScanning ? "저장소 스캔 중..." : "모델 삭제 중..."}</h2>
          </div>
        </div>
      )}

      <Header 
        activeTab={activeTab} setActiveTab={setActiveTab} searchTerm={searchTerm} setSearchTerm={setSearchTerm}
        showOnlyOutdated={showOnlyOutdated} setShowOnlyOutdated={setShowOnlyOutdated} showOnlyDuplicates={showOnlyDuplicates} setShowOnlyDuplicates={setShowOnlyDuplicates}
        sortBy={sortBy} setSortBy={setSortBy} sortOrder={sortOrder} setSortOrder={setSortOrder}
        onRefresh={handleRefresh} onShowSettings={() => setShowSettings(true)} onShowLogs={() => setShowLogViewer(true)} logCount={logs.length} isUpdating={isUpdating}
      />

      {isUpdating && (
        <div className="h-8 w-full bg-black/60 relative z-20 overflow-hidden border-b border-white/10 flex items-center">
          <div className={`absolute inset-y-0 left-0 transition-all duration-500 ease-out shadow-[0_0_15px_rgba(6,182,212,0.4)] ${updateStatus.mode === "FORCE" ? "bg-red-600/40" : "bg-cyan-600/40"}`} style={{ width: `${progressPercent}%` }} />
          <div className="relative w-full px-6 flex items-center justify-between pointer-events-none">
            <div className="flex items-center gap-4">
              <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${updateStatus.mode === "FORCE" ? "text-red-400 border-red-500/50 bg-red-500/10" : "text-cyan-400 border-cyan-500/50 bg-cyan-500/10"}`}>{updateStatus.mode}</span>
              <span className="text-xs font-black text-white/80 uppercase">Progress: {updateStatus.current} / {updateStatus.total}</span>
            </div>
            <div className="absolute inset-0 flex items-center justify-center"><div className="flex items-center gap-2 max-w-[40%]"><span className="text-[11px] font-black text-[#ff9a00] uppercase truncate">{updateStatus.name}</span><span className="text-[11px] font-bold text-white/90 truncate italic">{updateStatus.task}</span></div></div>
            <div className="flex items-center gap-4 text-[11px] font-black uppercase">
              <div className="flex items-center gap-1.5"><div className="size-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.8)]" /><span className="text-green-400">Fetched: {updateStatus.fetched}</span></div>
              <div className="flex items-center gap-1.5"><div className="size-1.5 rounded-full bg-yellow-500/50" /><span className="text-yellow-400/70">Skipped: {updateStatus.skipped}</span></div>
            </div>
          </div>
        </div>
      )}

      <SettingsModal 
        show={showSettings} onClose={() => setShowSettings(false)} paths={paths} onSelectFolder={handleSelectFolder}
        apiKey={apiKey} onSaveApiKey={(k) => { setApiKey(k); localStorage.setItem("civitai_api_key", k); }}
        updateTTL={updateTTL} onSaveTTL={(h) => { setUpdateTTL(h); localStorage.setItem("update_ttl_hours", h.toString()); }}
        onRefresh={handleRefresh} onResetCache={handleResetCache}
      />

      <LogViewerModal show={showLogViewer} onClose={() => setShowLogViewer(false)} logs={logs} onClear={clearLogs} />

      {showUpdateReport && (
        <div className="fixed inset-0 z-[400] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-10 animate-in fade-in duration-300">
          <div className="bg-[#111827] border-2 border-[#374151] w-full max-w-4xl h-[80vh] rounded-[40px] shadow-2xl flex flex-col scale-100 animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b-2 border-[#374151] flex justify-between items-center bg-[#1f2937]">
              <div className="flex items-center gap-4"><RefreshCw className="text-cyan-500 size-8" /><div><h2 className="text-3xl font-black text-white uppercase tracking-tighter">업데이트 결과 리포트</h2><p className="text-sm font-bold text-[#9ca3af]">총 {updateStatus.total}개 처리 ({updateStatus.fetched}개 조회됨, {updateStatus.skipped}개 스킵됨)</p></div></div>
              <button onClick={() => setShowUpdateReport(false)} className="px-8 py-3 bg-[#ff9a00] text-[#0b0f19] rounded-xl font-black uppercase text-sm hover:bg-[#e68a00]">닫기</button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-black/20 space-y-3">
              {updateStatus.results.map((res, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl hover:border-white/10">
                  <div className="flex items-center gap-4 overflow-hidden"><div className={`size-3 rounded-full shrink-0 ${res.status === "fetched" ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" : res.status === "skipped" ? "bg-yellow-500/50" : "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"}`} /><span className="text-white font-bold truncate">{res.name}</span></div>
                  <div className="flex items-center gap-3 shrink-0"><span className={`text-[10px] font-black uppercase px-2 py-1 rounded-md ${res.status === "fetched" ? "bg-green-500/10 text-green-400 border border-green-500/20" : res.status === "skipped" ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>{res.status}</span><span className="text-[#6b7280] font-mono text-[10px] italic">{res.message}</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar 
          dirTree={dirTree} selectedDirPath={selectedDirPath} onSelectDir={setSelectedDirPath} 
          totalModels={models.length} totalSize={models.reduce((acc, m) => acc + (m.size || 0), 0)} 
          selectedCount={selectedModels.size} selectedSize={Array.from(selectedModels).reduce((acc, path) => acc + (models.find(x => x.model_path === path)?.size || 0), 0)} 
          onUpdateSelected={handleUpdateSelected} onDeleteSelected={handleDeleteSelected} 
          onClearCacheSelected={handleClearCacheSelected} onDeletePreviewsSelected={handleDeletePreviewsSelected}
        />
        <main className="flex-1 bg-[#0b0f19] p-12 overflow-y-auto custom-scrollbar">
          {Object.entries(groupedModels).map(([category, items]) => (
            <div key={category} className="mb-20">
              <div className="flex items-center gap-4 mb-8 border-b-2 border-[#374151] pb-4"><h2 className="text-3xl font-black text-white uppercase tracking-tighter">{category} <span className="text-lg text-[#6b7280] ml-2 font-bold">{items.length}</span></h2></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-10">
                {items.map(m => (
                  <ModelCard 
                    key={m.model_path} model={m} isSelected={selectedModels.has(m.model_path)} onToggle={() => setSelectedModels(prev => { const next = new Set(prev); if (next.has(m.model_path)) next.delete(m.model_path); else next.add(m.model_path); return next; })} 
                    onDownload={startDownload} downloadProgress={downloads[m.model_path]} onResolveInfo={(model) => updateModelInfo(model, null, { checkNewVersion: false })} 
                  />
                ))}
              </div>
            </div>
          ))}
          {models.length === 0 && !isScanning && <div className="h-full flex flex-col items-center justify-center opacity-10"><Layers className="size-32 mb-4" /><p className="text-3xl font-black uppercase italic">모델을 찾을 수 없습니다</p></div>}
        </main>
      </div>
      <Toast toast={toast} onClose={hideToast} />
    </div>
  );
}

export default App;
