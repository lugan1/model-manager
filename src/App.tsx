import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Trash2, FolderOpen, Filter, Layers, RefreshCw, Eye, EyeOff, AlertCircle, FolderTree } from "lucide-react";
import { fromUnixTime, differenceInMonths, format, parseISO } from "date-fns";
import ModelCard from "./components/ModelCard";

export interface ModelInfo {
  name: string;
  category: string;
  model_path: string;
  preview_path: string | null;
  info_path: string | null;
  json_path: string | null;
  size: number;
  modified: number;
}

export interface ModelWithStatus extends ModelInfo {
  isOutdated: boolean;
  latestVersion?: string;
  civitaiUrl?: string;
  hasNewVersion?: boolean;
  lastReleaseDate?: string;
}

function App() {
  const [modelPath, setModelPath] = useState("D:\\ImageGenerator\\stable-diffusion-webui-reForge\\models\\Stable-diffusion");
  const [models, setModels] = useState<ModelWithStatus[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterMonths, setFilterMonths] = useState(6);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [showOnlyOutdated, setShowOnlyOutdated] = useState(false);

  useEffect(() => { scanFolder(); }, []);

  const selectFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, defaultPath: modelPath });
      if (selected && typeof selected === 'string') setModelPath(selected);
    } catch (e) { console.error(e); }
  };

  const scanFolder = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setError(null);
    try {
      const result: ModelInfo[] = await invoke("scan_models", { path: modelPath });
      const enriched = (result || []).map(m => ({
        ...m,
        isOutdated: differenceInMonths(new Date(), fromUnixTime(m.modified)) >= filterMonths
      }));
      setModels(enriched);
      setSelectedModels(new Set());
      updateLatestVersionsInParallel(enriched);
    } catch (err: any) { setError("저장소를 읽는 중 오류가 발생했습니다."); }
    finally { setIsScanning(false); }
  };

  const updateLatestVersionsInParallel = async (modelList: ModelWithStatus[]) => {
    const chunkSize = 5;
    for (let i = 0; i < modelList.length; i += chunkSize) {
      const chunk = modelList.slice(i, i + chunkSize);
      await Promise.all(chunk.map(m => processModel(m)));
    }
  };

  const processModel = async (m: ModelWithStatus) => {
    if (!m.info_path) return;
    try {
      const content: string = await invoke("read_text_file", { path: m.info_path });
      const data = JSON.parse(content);
      const modelId = data.modelId;
      const currentVersionId = data.id;

      setModels(prev => prev.map(item => 
        item.model_path === m.model_path ? { ...item, civitaiUrl: `https://civitai.com/models/${modelId}` } : item
      ));

      const response = await fetch(`https://civitai.com/api/v1/models/${modelId}`);
      if (response.status === 404) {
        setModels(prev => prev.map(item => 
          item.model_path === m.model_path ? { ...item, latestVersion: "삭제됨", hasNewVersion: false } : item
        ));
        return;
      }

      if (response.ok) {
        const civitData = await response.json();
        const latestVersion = civitData.modelVersions[0];
        setModels(prev => prev.map(item => 
          item.model_path === m.model_path 
            ? { ...item, latestVersion: latestVersion.name, hasNewVersion: latestVersion.id !== currentVersionId, lastReleaseDate: latestVersion.createdAt }
            : item
        ));
      }
    } catch (e) { }
  };

  const deleteSelected = async () => {
    if (selectedModels.size === 0 || isDeleting) return;
    if (!confirm(`선택한 ${selectedModels.size}개를 삭제하시겠습니까?`)) return;
    setIsDeleting(true);
    const paths: string[] = [];
    models.forEach(m => {
      if (selectedModels.has(m.model_path)) {
        paths.push(m.model_path);
        if (m.preview_path) paths.push(m.preview_path);
        if (m.info_path) paths.push(m.info_path);
        if (m.json_path) paths.push(m.json_path);
      }
    });
    try {
      await invoke("delete_files", { paths });
      setModels(prev => prev.filter(m => !selectedModels.has(m.model_path)));
      setSelectedModels(new Set());
    } catch (e) { setError("삭제 중 오류 발생"); }
    finally { setIsDeleting(false); }
  };

  const toggleSelection = (path: string) => {
    const next = new Set(selectedModels);
    if (next.has(path)) next.delete(path); else next.add(path);
    setSelectedModels(next);
  };

  const displayModels = showOnlyOutdated ? models.filter(m => m.isOutdated) : models;
  
  // [핵심] 카테고리별 그룹화 로직
  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelWithStatus[]> = {};
    displayModels.forEach(m => {
      if (!groups[m.category]) groups[m.category] = [];
      groups[m.category].push(m);
    });
    return groups;
  }, [displayModels]);

  const outdatedCount = models.filter(m => m.isOutdated).length;

  // [핵심] 선택된 모델들의 총 용량 계산
  const selectedTotalSize = useMemo(() => {
    return Array.from(selectedModels).reduce((acc, path) => {
      const model = models.find(m => m.model_path === path);
      return acc + (model?.size || 0);
    }, 0);
  }, [selectedModels, models]);

  const formatSize = (bytes: number) => {
    if (!bytes) return "0 GB";
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(2)} GB`;
  };

  return (
    <div className="relative flex flex-col h-screen bg-[#0b0f19] text-[#e5e7eb] font-sans overflow-hidden">
      {(isScanning || isDeleting) && (
        <div className="absolute inset-0 z-[100] bg-black/70 backdrop-blur-md flex flex-col items-center justify-center">
          <div className="bg-[#1f2937] border-2 border-[#374151] p-16 rounded-[40px] shadow-2xl flex flex-col items-center gap-10 scale-125">
            <RefreshCw className="size-24 text-[#ff9a00] animate-spin" />
            <h2 className="text-3xl font-black text-white uppercase">{isScanning ? "스캔 중..." : "삭제 중..."}</h2>
          </div>
        </div>
      )}

      <header className="h-24 bg-[#1f2937] border-b-2 border-[#374151] px-10 flex items-center justify-between z-30 flex-shrink-0">
        <div className="flex items-center gap-6">
          <div className="bg-[#ff9a00] p-2.5 rounded-xl"><Layers className="text-[#0b0f19] size-10" /></div>
          <span className="font-black text-white uppercase text-3xl">RE-FORGE <span className="text-[#ff9a00]">PURGE</span></span>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex bg-[#111827] border-2 border-[#374151] rounded-2xl h-14 items-center pr-4">
            <button onClick={selectFolder} className="px-5 h-full text-[#ff9a00] hover:bg-[#374151] rounded-l-2xl border-r-2 border-[#374151]">
              <FolderOpen className="size-7" />
            </button>
            <div className="px-6 text-lg w-[600px] truncate text-[#9ca3af] font-mono">{modelPath}</div>
          </div>
          <button onClick={scanFolder} className="bg-[#ff9a00] hover:bg-[#e68a00] text-[#0b0f19] px-10 py-3.5 rounded-2xl font-black text-xl flex items-center gap-3">
            <RefreshCw className="size-6" /> 새로고침
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-[400px] bg-[#111827] border-r-2 border-[#374151] p-10 flex flex-col gap-12 shadow-2xl overflow-y-auto">
          <section className="space-y-8">
            <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-[5px]">Dashboard</h2>
            <button 
              onClick={() => setShowOnlyOutdated(!showOnlyOutdated)}
              className={`w-full flex justify-between items-center px-6 py-5 rounded-[24px] border-2 font-black text-xl transition-all ${showOnlyOutdated ? "bg-[#ff9a00]/10 border-[#ff9a00] text-[#ff9a00]" : "bg-[#1f2937] border-[#374151] text-[#9ca3af]"}`}
            >
              <div className="flex items-center gap-4">{showOnlyOutdated ? <EyeOff className="size-7" /> : <Eye className="size-7" />} 오래된 모델</div>
              <span className={`px-4 py-1 rounded-lg ${showOnlyOutdated ? 'bg-[#ff9a00] text-black' : 'bg-black/40'}`}>{outdatedCount}</span>
            </button>
            
            <div className="bg-[#1f2937] p-8 rounded-[32px] border-2 border-[#374151] space-y-4">
              <label className="text-xs font-bold text-[#6b7280] uppercase tracking-[3px] block text-center">분석 기간</label>
              <select value={filterMonths} onChange={(e) => setFilterMonths(Number(e.target.value))} className="w-full bg-[#111827] text-2xl font-black p-4 rounded-2xl border-2 border-[#374151] outline-none text-[#ff9a00] text-center">
                <option value={1}>1개월 이상</option>
                <option value={3}>3개월 이상</option>
                <option value={6}>6개월 이상</option>
                <option value={12}>1년 이상</option>
              </select>
            </div>
          </section>

          <div className="mt-auto space-y-6 pt-10 border-t-2 border-[#374151]">
            <div className="flex justify-between items-center px-4">
              <span className="text-xs text-[#4b5563] font-black uppercase tracking-widest">전체 보유량</span>
              <span className="text-2xl font-black text-white">{models.length}개</span>
            </div>
            {selectedModels.size > 0 && (
              <div className="flex flex-col gap-4 w-full">
                <div className="flex justify-between items-center px-4 bg-[#ff9a00]/10 p-4 rounded-xl border border-[#ff9a00]/30">
                  <span className="text-xs text-[#ff9a00] font-black uppercase">확보 가능한 용량</span>
                  <span className="text-2xl font-black text-[#ff9a00]">{formatSize(selectedTotalSize)}</span>
                </div>
                <button onClick={deleteSelected} className="w-full bg-[#ef4444] hover:bg-[#dc2626] text-white py-6 rounded-[24px] font-black text-2xl flex items-center justify-center gap-4 shadow-2xl animate-pulse">
                  <Trash2 className="size-8" /> {selectedModels.size}개 삭제
                </button>
              </div>
            )}
          </div>
        </aside>

        <main className="flex-1 bg-[#0b0f19] p-12 overflow-y-auto custom-scrollbar">
          {Object.entries(groupedModels).map(([category, items]) => (
            <div key={category} className="mb-20">
              <div className="flex items-center gap-4 mb-8 border-b-2 border-[#374151] pb-4">
                <FolderTree className="size-8 text-[#ff9a00]" />
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter">{category} <span className="text-lg text-[#6b7280] ml-2 font-bold">{items.length}</span></h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-10">
                {items.map(m => (
                  <ModelCard key={m.model_path} model={m} isSelected={selectedModels.has(m.model_path)} onToggle={() => toggleSelection(m.model_path)} />
                ))}
              </div>
            </div>
          ))}
          {displayModels.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center opacity-10">
              <Layers className="size-32 mb-4" />
              <p className="text-3xl font-black uppercase italic">No Models Found</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
