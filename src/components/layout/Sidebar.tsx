import { useMemo, useCallback } from "react";
import { Download, Trash2, Database, ImageOff } from "lucide-react";
import { DirNode, ModelWithStatus } from "../../types";
import { TreeItem } from "../model/FolderTree";
import { formatSize, normalizePath } from "../../utils";
import { useModelContext } from "../../contexts/ModelContext";
import { useSettings } from "../../contexts/SettingsContext";
import { useFilter } from "../../contexts/FilterContext";
import { useErrorLogs } from "../../hooks/useErrorLogs";
import { useBatchUpdate } from "../../hooks/useBatchUpdate";
import { DBService } from "../../services/db.service";
import { ModelService } from "../../services/model.service";

export const Sidebar = () => {
  const { models, selectedModels, deleteSelected, patchModel, toggleModelSelection, clearSelection } = useModelContext();
  const { paths } = useSettings();
  const { activeTab, selectedDirPath, setSelectedDirPath } = useFilter();
  const { addLog } = useErrorLogs();
  const { updateLatestVersionsInParallel } = useBatchUpdate(addLog);

  const currentScanPath = useMemo(() => normalizePath(paths[activeTab].scan), [paths, activeTab]);
  const normalizedSelectedPath = useMemo(() => selectedDirPath ? normalizePath(selectedDirPath) : null, [selectedDirPath]);

  const dirTree = useMemo(() => {
    const rootName = currentScanPath.split(/[\\\/]/).pop() || "Root";
    const root: DirNode = { name: rootName, path: currentScanPath, children: {} };
    
    models.forEach(m => {
      const normalizedModelPath = normalizePath(m.model_path);
      if (!normalizedModelPath.startsWith(currentScanPath)) return;

      const relativePart = normalizedModelPath.substring(currentScanPath.length).replace(/^[\\\/]/, "");
      const parts = relativePart.split(/[\\\/]/);
      parts.pop();

      let current = root;
      let currentPath = currentScanPath;
      
      parts.forEach(part => {
        currentPath = normalizePath(`${currentPath}\\${part}`);
        if (!current.children[part]) {
          current.children[part] = { name: part, path: currentPath, children: {} };
        }
        current = current.children[part];
      });
    });
    return root;
  }, [models, currentScanPath]);

  const stats = useMemo(() => {
    let totalSize = 0;
    let selectedSize = 0;
    models.forEach(m => {
      totalSize += m.size;
      if (selectedModels.has(m.model_path)) selectedSize += m.size;
    });
    return { totalSize, selectedSize };
  }, [models, selectedModels]);

  const selectedModelsList = useMemo(() => 
    models.filter(m => selectedModels.has(m.model_path)), 
    [models, selectedModels]
  );

  const handleUpdateSelected = useCallback(() => {
    updateLatestVersionsInParallel(selectedModelsList, true);
    clearSelection();
  }, [selectedModelsList, updateLatestVersionsInParallel, clearSelection]);

  const handleClearCacheSelected = useCallback(async () => {
    for (const m of selectedModelsList) {
      await DBService.deleteEntry(m.model_path);
      await DBService.deleteHash(m.model_path);
      patchModel(m.model_path, { 
        latestVersionData: undefined, 
        localVersionData: undefined,
        currentVersion: undefined,
        currentVersionId: undefined,
        localPreviewUrl: undefined,
        localReleaseDate: undefined,
        hasNewVersion: false, 
        isNotFound: false,
        currentTask: "IDLE: 캐시 초기화됨"
      });
    }
  }, [selectedModelsList, patchModel]);

  const handleDeletePreviewsSelected = useCallback(async () => {
    const targets: string[] = [];
    selectedModelsList.forEach(m => {
      if (m.preview_path) targets.push(m.preview_path);
    });
    if (targets.length > 0) {
      await ModelService.deleteFiles(targets);
      selectedModelsList.forEach(m => {
        patchModel(m.model_path, { preview_path: null });
      });
    }
  }, [selectedModelsList, patchModel]);

  return (
    <aside className="w-[400px] bg-[#111827] border-r-2 border-[#374151] p-10 flex flex-col shadow-2xl overflow-hidden">
      <section className="flex-1 flex flex-col min-h-0">
        <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-[5px] mb-8">폴더 탐색기</h2>
        <div className="flex-1 bg-black/20 rounded-[32px] border-2 border-[#374151] overflow-y-auto custom-scrollbar p-6">
          <TreeItem node={dirTree} level={0} selectedPath={normalizedSelectedPath} onSelect={setSelectedDirPath} />
        </div>
      </section>

      <div className="mt-8 space-y-6 pt-10 border-t-2 border-[#374151]">
        <div className="flex flex-col gap-2 px-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#4b5563] font-black uppercase tracking-widest">전체 보유 모델</span>
            <span className="text-2xl font-black text-white">{models.length}개</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#4b5563] font-black uppercase tracking-widest">총 사용 용량</span>
            <span className="text-2xl font-black text-[#ff9a00]">{formatSize(stats.totalSize)}</span>
          </div>
        </div>
        
        {selectedModels.size > 0 && (
          <div className="flex flex-col gap-4 w-full">
            <div className="flex justify-between items-center px-4 bg-[#ff9a00]/10 p-4 rounded-xl border border-[#ff9a00]/30">
              <span className="text-xs text-[#ff9a00] font-black uppercase">확보 가능한 용량</span>
              <span className="text-2xl font-black text-[#ff9a00]">{formatSize(stats.selectedSize)}</span>
            </div>
            <div className="grid grid-cols-5 gap-3">
              <button onClick={handleUpdateSelected} className="col-span-2 bg-[#4f46e5] hover:bg-[#4338ca] text-white py-6 rounded-[24px] font-black text-lg flex items-center justify-center gap-2 shadow-2xl transition-all active:scale-95">
                <Download className="size-5" /> 업데이트
              </button>
              <button onClick={deleteSelected} className="col-span-3 bg-[#ef4444] hover:bg-[#dc2626] text-white py-6 rounded-[24px] font-black text-lg flex items-center justify-center gap-2 shadow-2xl transition-all active:scale-95">
                <Trash2 className="size-5" /> {selectedModels.size}개 삭제
              </button>
            </div>
            <button 
              onClick={handleClearCacheSelected} 
              className="w-full bg-gray-800 hover:bg-gray-700 text-gray-400 py-4 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
            >
              <Database className="size-4" /> 선택한 모델 DB 캐시 초기화
            </button>
            <button 
              onClick={handleDeletePreviewsSelected} 
              className="w-full bg-gray-800 hover:bg-gray-700 text-gray-400 py-4 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
            >
              <ImageOff className="size-4" /> 선택한 모델 프리뷰 삭제
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
