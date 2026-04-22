import { Download, Trash2 } from "lucide-react";
import { DirNode } from "../../types";
import { TreeItem } from "../model/FolderTree";
import { formatSize } from "../../utils";

interface SidebarProps {
  dirTree: DirNode;
  selectedDirPath: string | null;
  onSelectDir: (path: string | null) => void;
  totalModels: number;
  totalSize: number;
  selectedCount: number;
  selectedSize: number;
  onUpdateSelected: () => void;
  onDeleteSelected: () => void;
  onClearCacheSelected: () => void;
  onDeletePreviewsSelected: () => void;
}

export const Sidebar = ({
  dirTree,
  selectedDirPath,
  onSelectDir,
  totalModels,
  totalSize,
  selectedCount,
  selectedSize,
  onUpdateSelected,
  onDeleteSelected,
  onClearCacheSelected,
  onDeletePreviewsSelected,
}: SidebarProps) => {
  return (
    <aside className="w-[400px] bg-[#111827] border-r-2 border-[#374151] p-10 flex flex-col shadow-2xl overflow-hidden">
      <section className="flex-1 flex flex-col min-h-0">
        <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-[5px] mb-8">폴더 탐색기</h2>
        <div className="flex-1 bg-black/20 rounded-[32px] border-2 border-[#374151] overflow-y-auto custom-scrollbar p-6">
          <TreeItem node={dirTree} level={0} selectedPath={selectedDirPath} onSelect={onSelectDir} />
        </div>
      </section>

      <div className="mt-8 space-y-6 pt-10 border-t-2 border-[#374151]">
        <div className="flex flex-col gap-2 px-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#4b5563] font-black uppercase tracking-widest">전체 보유 모델</span>
            <span className="text-2xl font-black text-white">{totalModels}개</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#4b5563] font-black uppercase tracking-widest">총 사용 용량</span>
            <span className="text-2xl font-black text-[#ff9a00]">{formatSize(totalSize)}</span>
          </div>
        </div>
        
        {selectedCount > 0 && (
          <div className="flex flex-col gap-4 w-full">
            <div className="flex justify-between items-center px-4 bg-[#ff9a00]/10 p-4 rounded-xl border border-[#ff9a00]/30">
              <span className="text-xs text-[#ff9a00] font-black uppercase">확보 가능한 용량</span>
              <span className="text-2xl font-black text-[#ff9a00]">{formatSize(selectedSize)}</span>
            </div>
            <div className="grid grid-cols-5 gap-3">
              <button onClick={onUpdateSelected} className="col-span-2 bg-[#4f46e5] hover:bg-[#4338ca] text-white py-6 rounded-[24px] font-black text-lg flex items-center justify-center gap-2 shadow-2xl transition-all active:scale-95">
                <Download className="size-5" /> 업데이트
              </button>
              <button onClick={onDeleteSelected} className="col-span-3 bg-[#ef4444] hover:bg-[#dc2626] text-white py-6 rounded-[24px] font-black text-lg flex items-center justify-center gap-2 shadow-2xl transition-all active:scale-95">
                <Trash2 className="size-5" /> {selectedCount}개 삭제
              </button>
            </div>
            <button 
              onClick={onClearCacheSelected} 
              className="w-full bg-gray-800 hover:bg-gray-700 text-gray-400 py-4 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
            >
              선택한 모델 DB 캐시 초기화
            </button>
            <button 
              onClick={onDeletePreviewsSelected} 
              className="w-full bg-gray-800 hover:bg-gray-700 text-gray-400 py-4 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
            >
              선택한 모델 프리뷰 삭제
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
