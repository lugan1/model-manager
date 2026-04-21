import { ModelWithStatus } from "../App";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { HardDrive, Check, AlertTriangle, ExternalLink, Download, Calendar, AlertCircle } from "lucide-react";

interface Props {
  model: ModelWithStatus;
  isSelected: boolean;
  onToggle: () => void;
}

const ModelCard = ({ model, isSelected, onToggle }: Props) => {
  if (!model) return null;

  const formatSize = (bytes: number) => {
    if (!bytes) return "0 GB";
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(2)} GB`;
  };

  const previewUrl = model.preview_path ? convertFileSrc(model.preview_path) : null;

  const handleOpenCivitai = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (model.civitaiUrl) {
      try {
        // Rust 백엔드 명령을 직접 호출하여 브라우저를 엽니다.
        await invoke("open_browser", { url: model.civitaiUrl });
      } catch (err) {
        console.error("Failed to open URL via Rust:", err);
      }
    }
  };

  return (
    <div 
      onClick={onToggle}
      className={`group relative bg-[#1f2937] border-4 rounded-[32px] overflow-hidden cursor-pointer transition-all duration-300 shadow-2xl ${
        isSelected ? "border-[#ff9a00] ring-8 ring-[#ff9a00]/20 scale-[0.98]" : "border-[#374151] hover:border-[#4b5563] hover:-translate-y-2"
      }`}
    >
      <div className={`absolute top-5 right-5 z-30 size-10 rounded-xl border-4 flex items-center justify-center transition-all ${
        isSelected ? "bg-[#ff9a00] border-[#ff9a00]" : "bg-black/40 border-white/20 opacity-0 group-hover:opacity-100"
      }`}>
        {isSelected && <Check className="size-7 text-[#0b0f19] stroke-[5px]" />}
      </div>

      <div className="aspect-[3/4] w-full bg-[#111827] relative overflow-hidden">
        {previewUrl ? (
          <img src={previewUrl} alt="" className={`w-full h-full object-cover transition-all duration-700 ${isSelected ? "opacity-30 blur-[4px]" : "group-hover:scale-110"}`} />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-6 opacity-10">
            <HardDrive className="size-24" />
          </div>
        )}

        <div className="absolute top-5 left-5 z-20 flex flex-col gap-3">
          {model.isOutdated && (
            <div className="bg-red-600 text-white text-sm font-black px-4 py-1.5 rounded-xl shadow-2xl flex items-center gap-2">
              <AlertTriangle className="size-4" /> 오래됨
            </div>
          )}
          {model.latestVersion === "삭제된 모델" && (
            <div className="bg-zinc-800 text-[#9ca3af] text-sm font-black px-4 py-1.5 rounded-xl shadow-2xl flex items-center gap-2 border border-white/10">
              <AlertCircle className="size-4" /> 서버에서 삭제됨
            </div>
          )}
          {model.hasNewVersion && (
            <div className="bg-[#ff9a00] text-[#0b0f19] text-sm font-black px-4 py-1.5 rounded-xl shadow-2xl flex items-center gap-2 animate-pulse">
              <Download className="size-4" /> 새 버전
            </div>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 p-8 bg-gradient-to-t from-[#0b0f19] via-[#0b0f19]/95 to-transparent">
          <h3 className="text-2xl font-black text-white leading-tight mb-4 line-clamp-2 drop-shadow-2xl">{model.name}</h3>
          
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between text-base font-bold">
              <span className="text-[#9ca3af] flex items-center gap-2"><HardDrive className="size-4" /> {formatSize(model.size)}</span>
              {model.latestVersion && (
                <span className="text-[#ff9a00] bg-[#ff9a00]/10 px-3 py-1 rounded-lg">v {model.latestVersion}</span>
              )}
            </div>

            {/* 출시일 정보 추가 */}
            {model.lastReleaseDate && (
              <div className="flex items-center gap-2 text-sm font-bold text-[#6b7280] bg-black/30 w-fit px-3 py-1 rounded-lg border border-white/5">
                <Calendar className="size-4 text-indigo-400" />
                마지막 업데이트: {format(parseISO(model.lastReleaseDate), "yyyy년 MM월 dd일", { locale: ko })}
              </div>
            )}
            
            {model.civitaiUrl && (
              <button 
                onClick={handleOpenCivitai}
                className="mt-2 flex items-center justify-center gap-3 bg-[#374151] hover:bg-[#ff9a00] hover:text-[#0b0f19] text-white py-4 rounded-2xl text-lg font-black transition-all shadow-xl border-none cursor-pointer"
              >
                <ExternalLink className="size-5" /> Civitai 페이지
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelCard;
