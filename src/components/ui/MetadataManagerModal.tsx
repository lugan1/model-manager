import { useState, useEffect, useMemo } from "react";
import { X, Image as ImageIcon, FileJson, Check, RefreshCw, Play, Circle, AlertCircle, CheckSquare, Square } from "lucide-react";
import { ModelWithStatus } from "../../types";

interface MetadataManagerModalProps {
  show: boolean;
  onClose: () => void;
  targets: ModelWithStatus[];
  onDownload: (model: ModelWithStatus, options: { model: boolean, preview: boolean, info: boolean }) => Promise<void>;
}

interface TargetItem extends ModelWithStatus {
  status: "pending" | "downloading" | "completed" | "error";
  missingPreview: boolean;
  missingInfo: boolean;
}

export const MetadataManagerModal = ({ show, onClose, targets, onDownload }: MetadataManagerModalProps) => {
  const [items, setItems] = useState<TargetItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);

  // 초기 데이터 가공: 오직 팝업이 처음 열릴 때만 실행 (snapshot)
  useEffect(() => {
    if (show) {
      const initialItems = targets.map(t => ({
        ...t,
        status: "pending" as const,
        missingPreview: !t.preview_path,
        missingInfo: !t.info_path || !t.json_path
      }));
      setItems(initialItems);
      setSelectedIds(new Set(initialItems.map(i => i.model_path)));
      setIsProcessing(false);
      setCurrentIndex(-1);
    }
  }, [show]); // targets 의존성 제거하여 목록 고정

  const toggleSelect = (id: string) => {
    if (isProcessing) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (isProcessing) return;
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(i => i.model_path)));
    }
  };

  const startBatch = async () => {
    if (isProcessing || selectedIds.size === 0) return;
    setIsProcessing(true);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // 선택되지 않았거나 이미 완료된 항목은 건너뜀
      if (!selectedIds.has(item.model_path) || item.status === "completed") continue;

      setCurrentIndex(i);
      setItems(prev => prev.map((it, idx) => i === idx ? { ...it, status: "downloading" } : it));

      try {
        await onDownload(item, {
          model: false,
          preview: item.missingPreview,
          info: item.missingInfo
        });
        setItems(prev => prev.map((it, idx) => i === idx ? { ...it, status: "completed" } : it));
      } catch (e) {
        console.error(`Error processing ${item.name}:`, e);
        // 에러가 발생해도 중단하지 않고 해당 항목만 에러 표시 후 다음으로 진행
        setItems(prev => prev.map((it, idx) => i === idx ? { ...it, status: "error" } : it));
      }
    }

    setIsProcessing(false);
    setCurrentIndex(-1);
  };

  if (!show) return null;

  const completedCount = items.filter(i => i.status === "completed").length;
  const progressPercent = selectedIds.size > 0 ? Math.round((completedCount / selectedIds.size) * 100) : 0;
  const isAllSelected = items.length > 0 && selectedIds.size === items.length;

  return (
    <div className="fixed inset-0 z-[250] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-10">
      <div className="bg-[#111827] border-2 border-[#374151] w-full max-w-5xl h-[80vh] rounded-[40px] overflow-hidden shadow-2xl flex flex-col border-white/5">
        {/* Header */}
        <div className="p-8 border-b-2 border-[#374151] flex justify-between items-center bg-[#1f2937]">
          <div className="flex items-center gap-6">
            <div className="bg-[#4f46e5] p-3 rounded-2xl">
              <RefreshCw className={`text-white size-8 ${isProcessing ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h2 className="text-3xl font-black text-white uppercase tracking-tighter">메타데이터 일괄 채우기</h2>
              <p className="text-sm font-bold text-[#9ca3af]">누락된 {items.length}개의 모델 중 선택한 {selectedIds.size}개를 처리합니다</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={toggleSelectAll} 
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-black/40 text-sm font-black text-[#9ca3af] hover:text-white transition-all disabled:opacity-30"
            >
              {isAllSelected ? <CheckSquare className="text-[#ff9a00] size-5" /> : <Square className="size-5" />}
              {isAllSelected ? "전체 해제" : "전체 선택"}
            </button>
            <button onClick={onClose} disabled={isProcessing} className="p-2 hover:bg-white/10 rounded-full text-white disabled:opacity-30">
              <X className="size-10" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        {isProcessing && (
          <div className="h-2 w-full bg-black/40">
            <div 
              className="h-full bg-[#ff9a00] transition-all duration-500 shadow-[0_0_15px_rgba(255,154,0,0.5)]" 
              style={{ width: `${progressPercent}%` }} 
            />
          </div>
        )}

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-3 bg-black/20">
          {items.map((item, idx) => (
            <div 
              key={item.model_path} 
              onClick={() => toggleSelect(item.model_path)}
              className={`flex items-center gap-6 p-5 rounded-2xl border-2 transition-all cursor-pointer ${
                currentIndex === idx ? "bg-[#ff9a00]/10 border-[#ff9a00] scale-[1.01]" : 
                item.status === "completed" ? "bg-green-500/5 border-green-500/20" : 
                selectedIds.has(item.model_path) ? "bg-white/5 border-[#4b5563]" : "bg-[#1f2937]/30 border-[#374151] opacity-50"
              }`}
            >
              <div className="shrink-0">
                {item.status === "completed" ? (
                  <div className="size-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                    <Check className="text-green-400 size-6" />
                  </div>
                ) : item.status === "downloading" ? (
                  <div className="size-10 rounded-xl bg-[#ff9a00]/20 flex items-center justify-center">
                    <RefreshCw className="text-[#ff9a00] size-6 animate-spin" />
                  </div>
                ) : (
                  <div className={`size-10 rounded-xl flex items-center justify-center transition-all ${selectedIds.has(item.model_path) ? "bg-[#ff9a00] text-black" : "bg-black/40 text-[#4b5563]"}`}>
                    {selectedIds.has(item.model_path) ? <CheckSquare className="size-6" /> : <Square className="size-6" />}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h4 className={`font-black truncate text-lg uppercase tracking-tight ${selectedIds.has(item.model_path) ? "text-white" : "text-[#4b5563]"}`}>{item.name}</h4>
                <p className="text-xs font-mono text-[#6b7280] truncate">{item.model_path}</p>
              </div>

              <div className="flex gap-3 shrink-0">
                {item.missingPreview && (
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border text-[10px] font-black uppercase ${item.status === "completed" ? "bg-green-500/20 border-green-500/30 text-green-400" : "bg-blue-500/10 border-blue-500/30 text-blue-400"}`}>
                    <ImageIcon className="size-3" /> Preview
                  </div>
                )}
                {item.missingInfo && (
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border text-[10px] font-black uppercase ${item.status === "completed" ? "bg-green-500/20 border-green-500/30 text-green-400" : "bg-purple-500/10 border-purple-500/30 text-purple-400"}`}>
                    <FileJson className="size-3" /> Info/JSON
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-8 border-t-2 border-[#374151] bg-[#1f2937] flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-[#6b7280] uppercase tracking-[3px]">선택된 항목</span>
              <span className="text-2xl font-black text-white">{selectedIds.size}개</span>
            </div>
            <div className="h-10 w-[2px] bg-[#374151]" />
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-[#6b7280] uppercase tracking-[3px]">진행 완료</span>
              <span className="text-2xl font-black text-[#ff9a00]">{completedCount} 개</span>
            </div>
          </div>

          <div className="flex gap-4">
            {!isProcessing ? (
              <button 
                onClick={startBatch}
                disabled={selectedIds.size === 0}
                className={`px-12 py-4 rounded-2xl font-black text-xl flex items-center gap-3 shadow-xl transition-all active:scale-95 ${
                  selectedIds.size > 0 ? "bg-[#ff9a00] hover:bg-[#e68a00] text-[#0b0f19]" : "bg-[#374151] text-[#6b7280] cursor-not-allowed"
                }`}
              >
                <Play className="size-6 fill-current" /> {selectedIds.size}개 작업 시작
              </button>
            ) : (
              <button 
                className="bg-[#374151] text-white px-12 py-4 rounded-2xl font-black text-xl transition-all animate-pulse"
                disabled
              >
                다운로드 중...
              </button>
            )}
            {!isProcessing && (
              <button 
                onClick={onClose}
                className="border-2 border-[#374151] hover:bg-[#374151] text-white px-8 py-4 rounded-2xl font-black text-xl transition-all"
              >
                닫기
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
