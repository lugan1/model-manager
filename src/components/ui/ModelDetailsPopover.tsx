import React, { useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { ModelWithStatus } from "../../types";
import { X, Copy, Hash, Fingerprint, Info, ExternalLink, Sparkles, Terminal, Quote } from "lucide-react";
import { stripHtml } from "../../utils";

interface ModelDetailsPopoverProps {
  model: ModelWithStatus;
  x: number;
  y: number;
  onClose: () => void;
}

export const ModelDetailsPopover = ({ model, x, y, onClose }: ModelDetailsPopoverProps) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [onClose]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const modelId = model.latestVersionData?.modelId || model.localVersionData?.modelId;
  const versionId = model.currentVersionId || model.latestVersionId;
  const hash = model.hash || "정보 없음";
  
  // 모델 전체 설명 또는 버전 설명(업데이트 내역) 추출
  const rawDescription = model.modelDescription || 
                         (model.latestVersionData as any)?.model?.description || 
                         model.latestVersionData?.description || 
                         (model.localVersionData as any)?.model?.description || 
                         model.localVersionData?.description || "";
  const description = stripHtml(rawDescription);

  const trainedWords = model.latestVersionData?.trainedWords || model.localVersionData?.trainedWords || [];
  
  // 첫 번째 메타데이터가 있는 이미지에서 프롬프트 추출
  const targetData = model.latestVersionData || model.localVersionData;
  const firstImageWithMeta = targetData?.images?.find(img => img.meta && (img.meta.prompt || img.meta.negativePrompt));
  const samplePrompt = firstImageWithMeta?.meta?.prompt || "";
  const sampleNegative = firstImageWithMeta?.meta?.negativePrompt || "";

  // 화면 경계 처리 (오른쪽/아래로 넘어가지 않게)
  const popoverWidth = 400;
  const popoverHeight = 600;
  const adjustedX = Math.min(x, window.innerWidth - popoverWidth - 20);
  const adjustedY = Math.min(y, window.innerHeight - popoverHeight - 20);

  return ReactDOM.createPortal(
    <div 
      ref={popoverRef}
      style={{ left: adjustedX, top: adjustedY }}
      className="fixed z-[999] w-[400px] max-h-[70vh] bg-[#111827] border-2 border-[#374151] rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
    >
      <div className="p-5 border-b border-[#374151] flex justify-between items-center bg-[#1f2937]/50">
        <div className="flex items-center gap-2">
          <Info className="size-4 text-cyan-400" />
          <span className="text-xs font-black text-white uppercase tracking-widest">모델 상세 정보</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg text-[#9ca3af] hover:text-white transition-all">
          <X className="size-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {/* Model ID & Version ID */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-[#4b5563] uppercase tracking-tighter">Civitai ID</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white tabular-nums">{modelId || "N/A"}</span>
              {modelId && (
                <button onClick={() => copyToClipboard(modelId.toString())} className="p-1 hover:bg-white/5 rounded text-cyan-500 transition-all">
                  <Copy className="size-3" />
                </button>
              )}
            </div>
          </div>
          <div className="space-y-1 text-right">
            <span className="text-[10px] font-black text-[#4b5563] uppercase tracking-tighter">Version ID</span>
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs font-bold text-white tabular-nums">{versionId || "N/A"}</span>
              {versionId && (
                <button onClick={() => copyToClipboard(versionId.toString())} className="p-1 hover:bg-white/5 rounded text-cyan-500 transition-all">
                  <Copy className="size-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Hash */}
        <div className="p-4 bg-black/40 rounded-2xl border border-white/5 space-y-2">
          <div className="flex items-center gap-1.5">
            <Fingerprint className="size-3 text-[#ff9a00]" />
            <span className="text-[10px] font-black text-[#ff9a00] uppercase tracking-widest">BLAKE3 Hash</span>
          </div>
          <div className="flex items-start gap-2 group">
            <p className="text-[10px] font-mono text-[#9ca3af] break-all leading-relaxed flex-1">{hash}</p>
            <button onClick={() => copyToClipboard(hash)} className="mt-0.5 p-1 hover:bg-white/5 rounded text-cyan-500 transition-all opacity-0 group-hover:opacity-100">
              <Copy className="size-3" />
            </button>
          </div>
        </div>

        {/* Trigger Words */}
        {trainedWords.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Terminal className="size-3 text-emerald-400" />
              <span className="text-[10px] font-black text-[#4b5563] uppercase tracking-widest">Trigger Words</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {trainedWords.map((word) => (
                <button 
                  key={word} 
                  onClick={() => copyToClipboard(word)}
                  className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/20 transition-all flex items-center gap-1"
                >
                  {word} <Copy className="size-2 opacity-50" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sample Prompts */}
        {(samplePrompt || sampleNegative) && (
          <div className="space-y-4">
            {samplePrompt && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="size-3 text-[#ff9a00]" />
                    <span className="text-[10px] font-black text-[#4b5563] uppercase tracking-widest">Sample Prompt</span>
                  </div>
                  <button onClick={() => copyToClipboard(samplePrompt)} className="text-[10px] font-black text-cyan-500 hover:text-cyan-400 flex items-center gap-1">
                    COPY <Copy className="size-2" />
                  </button>
                </div>
                <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                  <p className="text-[11px] text-gray-300 leading-relaxed line-clamp-4">{samplePrompt}</p>
                </div>
              </div>
            )}
            {sampleNegative && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <Terminal className="size-3 text-rose-400" />
                    <span className="text-[10px] font-black text-[#4b5563] uppercase tracking-widest">Negative Prompt</span>
                  </div>
                  <button onClick={() => copyToClipboard(sampleNegative)} className="text-[10px] font-black text-cyan-500 hover:text-cyan-400 flex items-center gap-1">
                    COPY <Copy className="size-2" />
                  </button>
                </div>
                <div className="bg-rose-500/5 p-3 rounded-xl border border-rose-500/10">
                  <p className="text-[11px] text-rose-200/60 leading-relaxed line-clamp-3 italic">{sampleNegative}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Description */}
        <div className="space-y-2 pb-2">
          <div className="flex items-center gap-1.5">
            <Quote className="size-3 text-cyan-400" />
            <span className="text-[10px] font-black text-[#4b5563] uppercase tracking-widest">Description</span>
          </div>
          <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
            <p className="text-xs text-[#d1d5db] leading-relaxed whitespace-pre-wrap italic">
              {description || "설명이 없습니다."}
            </p>
          </div>
        </div>
      </div>

      {model.civitaiUrl && (
        <div className="p-4 bg-[#1f2937]/30 border-t border-[#374151]">
          <a 
            href={model.civitaiUrl} 
            target="_blank" 
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-black transition-all"
          >
            <ExternalLink className="size-3" />
            CIVITAI 페이지 방문
          </a>
        </div>
      )}
    </div>,
    document.body
  );
};
