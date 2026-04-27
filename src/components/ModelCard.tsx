import { useState, useRef, useEffect, memo, useMemo } from "react";
import { ModelWithStatus } from "../types";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ModelService } from "../services/model.service";
import { apiClient } from "../services/api.client";
import { format, parseISO } from "date-fns";
import { HardDrive, Check, AlertTriangle, ExternalLink, Download, Calendar, AlertCircle, Sparkles, FileJson, Package, Layers, FolderOpen, RefreshCw, Database, Clock, ImageOff, Lock } from "lucide-react";
import { Tooltip } from "./ui/Tooltip";
import { useModelContext } from "../contexts/ModelContext";
import { useSettings } from "../contexts/SettingsContext";
import { useDownloadAction } from "../hooks/useDownloadAction";
import { useModelUpdate } from "../hooks/useModelUpdate";
import { useDownloads } from "../hooks/useDownloads";
import { useErrorLogs } from "../hooks/useErrorLogs";
import { formatSize, isTauri } from "../utils";
import { ModelDetailsPopover } from "./ui/ModelDetailsPopover";

interface Props {
  model: ModelWithStatus;
}

const ModelCard = memo(({ model }: Props) => {
  const { selectedModels, toggleModelSelection } = useModelContext();
  const { downloads, clearDownload } = useDownloads();
  const { addLog } = useErrorLogs();
  const { startDownload } = useDownloadAction(clearDownload);
  const { updateModelInfo } = useModelUpdate(addLog, clearDownload);
  
  const [showMenu, setShowMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{x: number, y: number} | null>(null);
  const [persistedTask, setPersistedTask] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const isSelected = selectedModels.has(model.model_path);
  const downloadProgress = downloads[model.model_path];

  useEffect(() => {
    if (model.currentTask) {
      if (model.currentTask.startsWith("IDLE")) {
        if (timerRef.current) clearTimeout(timerRef.current);
        setPersistedTask(model.currentTask);
        timerRef.current = setTimeout(() => {
          setPersistedTask(null);
        }, 1000);
      } else {
        if (timerRef.current) clearTimeout(timerRef.current);
        setPersistedTask(model.currentTask);
      }
    }
  }, [model.currentTask]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMenu]);

  const localPreview = useMemo(() => {
    if (!model.preview_path) return null;
    try {
      const normalizedPath = model.preview_path.replace(/\\/g, "/");
      return convertFileSrc(normalizedPath);
    } catch (e) {
      return null;
    }
  }, [model.preview_path]);
  
  const displayPreview = localPreview;

  const handleOpenCivitai = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // 1. 이미 직접적인 URL이 있으면 즉시 열기
    if (model.civitaiUrl) {
      apiClient.openExternal(model.civitaiUrl).catch(console.error);
      return;
    }

    // 2. URL은 없지만 modelId가 있으면 생성해서 열기
    const modelId = model.latestVersionData?.modelId || model.localVersionData?.modelId;
    if (modelId) {
      const fallbackUrl = `https://civitai.com/models/${modelId}`;
      apiClient.openExternal(fallbackUrl).catch(console.error);
      return;
    }

    // 3. 둘 다 없으면 업데이트 확인 시도 후 열기
    if (model.info_path || model.json_path) {
      await updateModelInfo(model);
      // 업데이트 확인 후 다시 정보가 생겼는지 체크하여 열기
      setPersistedTask("정보 확인 중...");
      // 약간의 지연을 주어 상태가 반영될 시간을 줌
      setTimeout(() => {
        const updatedModelId = model.latestVersionData?.modelId || model.localVersionData?.modelId;
        if (updatedModelId) {
          apiClient.openExternal(`https://civitai.com/models/${updatedModelId}`).catch(console.error);
        }
      }, 500);
    } else {
      // 식별되지 않은 모델임을 알림
      setPersistedTask("식별되지 않은 모델 (업데이트 확인 필요)");
      setTimeout(() => setPersistedTask(null), 2000);
    }
  };

  const handleOpenFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTauri()) {
      ModelService.openFolder(model.model_path).catch(console.error);
    } else {
      // 웹 환경 (Reforge 등)에서는 폴더 열기가 불가능하므로 경로 복사로 대체
      navigator.clipboard.writeText(model.model_path).then(() => {
        setPersistedTask("경로 복사 완료");
        setTimeout(() => setPersistedTask(null), 2000);
      }).catch(() => {
        setPersistedTask("복사 실패");
        setTimeout(() => setPersistedTask(null), 2000);
      });
    }
  };

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  const handleDownloadItem = (e: React.MouseEvent, options: any) => {
    e.stopPropagation();
    startDownload(model, options);
    setShowMenu(false);
  };

  const progressPercent = downloadProgress?.total 
    ? Math.round((downloadProgress.received / downloadProgress.total) * 100)
    : 0;

  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec > 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  };

  const formatETA = (received: number, total: number | null, speed: number) => {
    if (!total || speed <= 0) return "계산 중...";
    const remainingBytes = total - received;
    const seconds = Math.floor(remainingBytes / speed);
    if (seconds < 60) return `${seconds}초`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}분 ${secs}초`;
  };

  const trainedWords = model.localVersionData?.trainedWords || model.latestVersionData?.trainedWords || [];
  const hasLocalPreview = !!model.preview_path;
  const hasLocalInfo = !!model.info_path || !!model.json_path;
  const isNotFoundOnCivitai = model.isNotFound || persistedTask?.includes("서버 정보 없음");

  const isUnidentified = !model.civitaiUrl && !model.latestVersionData && !model.localVersionData && !model.isNotFound;
  const hasLink = !!model.civitaiUrl || !!(model.latestVersionData?.modelId || model.localVersionData?.modelId);

  const isEarlyAccess = useMemo(() => {
    const data = model.latestVersionData;
    if (!data) return false;

    // 1. 가용성 필드가 명시적으로 Public이면 아님
    if (data.availability === "Public") return false;

    // 2. 가용성 필드가 EarlyAccess면 맞음
    if (data.availability === "EarlyAccess") return true;

    // 3. 종료 날짜가 설정되어 있다면 현재 시간과 비교
    if (data.earlyAccessEndsAt) {
      return new Date(data.earlyAccessEndsAt).getTime() > Date.now();
    }

    // 4. 그 외의 경우 (earlyAccessConfig가 있어도 위 조건에 걸리지 않으면) 아님으로 판단
    return false;
  }, [model.latestVersionData]);

  // 사용자의 요청에 따라 얼리 억세스 모델은 무조건 차단
  const disableDownload = isEarlyAccess;

  if (model.isInitializing) {
    return (
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
    );
  }

  return (
    <div 
      onClick={() => toggleModelSelection(model.model_path)}
      onContextMenu={handleContextMenu}
      className={`group relative bg-[#1f2937] border-4 rounded-[32px] overflow-hidden cursor-pointer transition-all duration-300 shadow-2xl ${
        isSelected ? "border-[#ff9a00] ring-8 ring-[#ff9a00]/20 scale-[0.98]" : "border-[#374151] hover:border-[#4b5563] hover:-translate-y-2"
      }`}
    >
      {contextMenu && (
        <ModelDetailsPopover 
          model={model} 
          x={contextMenu.x} 
          y={contextMenu.y} 
          onClose={() => setContextMenu(null)} 
        />
      )}
      <div className="absolute top-0 right-0 z-30 flex items-start gap-2 p-3">
        <div 
          onClick={(e) => { e.stopPropagation(); toggleModelSelection(model.model_path); }}
          className={`size-9 rounded-xl border-2 flex items-center justify-center transition-all cursor-pointer shadow-lg shrink-0 ${
            isSelected ? "bg-[#ff9a00] border-[#ff9a00] scale-110" : "bg-black/60 border-white/20 opacity-0 group-hover:opacity-100 hover:border-[#ff9a00]"
          }`}
        >
          {isSelected && <Check className="size-5 text-[#0b0f19] stroke-[4px]" />}
        </div>
        <div className="bg-black/80 backdrop-blur-md text-[#ff9a00] text-[10px] font-black px-2.5 py-1.5 rounded-xl border border-white/10 flex items-center gap-1.5 shadow-2xl shrink-0">
          <HardDrive className="size-3.5" /> {formatSize(model.size)}
        </div>
      </div>

      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
        {isUnidentified && (
          <div className="bg-amber-500/90 backdrop-blur-md text-[#0b0f19] text-[10px] font-black px-2.5 py-1 rounded-lg shadow-lg flex items-center gap-1.5 uppercase tracking-wider">
            <RefreshCw className="size-3 animate-spin" /> 식별 전
          </div>
        )}
        {model.isOutdated && (
          <div className="bg-red-600/90 backdrop-blur-md text-white text-[10px] font-black px-2.5 py-1 rounded-lg shadow-lg flex items-center gap-1.5 uppercase tracking-wider">
            <AlertTriangle className="size-3" /> 오래됨
          </div>
        )}
        
        {(model.hasNewVersion || model.isNewBase) && (
          <div className={`text-[#0b0f19] text-[10px] font-black px-2.5 py-1 rounded-lg shadow-lg flex items-center gap-1.5 uppercase tracking-wider animate-pulse ${model.isNewBase ? "bg-purple-500" : "bg-[#ff9a00]"}`}>
            {model.isNewBase ? <Database className="size-3" /> : <Download className="size-3" />}
            {model.isNewBase ? "새 베이스" : "새 버전"}
          </div>
        )}

        {isEarlyAccess && (
          <div className="bg-amber-400/90 backdrop-blur-md text-[#0b0f19] text-[10px] font-black px-2.5 py-1 rounded-lg shadow-lg flex items-center gap-1.5 uppercase tracking-wider">
            <Lock className="size-3" /> 얼리 억세스
          </div>
        )}

        {isNotFoundOnCivitai && (
          <div className="bg-gray-800/90 backdrop-blur-md text-gray-400 text-[10px] font-black px-2.5 py-1 rounded-lg shadow-lg flex items-center gap-1.5 uppercase tracking-wider border border-white/10">
            <AlertCircle className="size-3" /> 서버 정보 없음
          </div>
        )}
      </div>

      <div className="aspect-[3/4] w-full bg-[#111827] relative overflow-hidden">
        {displayPreview ? (
          <img src={displayPreview} alt="" loading="lazy" className={`w-full h-full object-cover transition-all duration-700 ${isSelected ? "opacity-30 blur-[4px]" : "group-hover:scale-110"}`} />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-6 opacity-10">
            <HardDrive className="size-24" />
          </div>
        )}

        {persistedTask && (
          <div className={`absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300 ${persistedTask.startsWith("IDLE") ? "bg-black/40" : ""}`}>
            <div className="relative mb-4">
              <RefreshCw className={`size-12 stroke-[3px] ${persistedTask.startsWith("IDLE") ? "text-green-500" : "text-[#ff9a00] animate-spin"}`} />
              <div className="absolute inset-0 flex items-center justify-center">
                {persistedTask.startsWith("IDLE") ? <Check className="size-6 text-white" /> : <Database className="size-5 text-white" />}
              </div>
            </div>
            <p className="text-white font-bold text-sm leading-tight break-all">{persistedTask}</p>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-[#0b0f19] via-[#0b0f19]/90 to-transparent">
          <h3 className="text-lg font-black text-white leading-tight mb-1 drop-shadow-2xl uppercase tracking-tighter break-all">
            {model.model_path.split(/[\\\/]/).pop()?.replace(/\.(safetensors|ckpt)$/i, "")}
          </h3>
          {model.modelName && <p className="text-[11px] text-[#ff9a00] font-bold mb-3 italic opacity-90 break-words">{model.modelName}</p>}
          
          <div className="flex flex-col gap-3 mt-1">
            <div className="flex flex-col gap-2 w-full">
              {(model.currentVersion || model.latestVersion) && (
                <div className="flex flex-col gap-1.5 w-full p-2 rounded-xl border border-white/10 bg-white/5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-white bg-gray-700 uppercase tracking-wider px-2 py-1 rounded-md shrink-0">Local</span>
                    <div className="flex items-center justify-between flex-1 min-w-0 gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {model.localBaseModel && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase border shrink-0 bg-gray-700 text-gray-200 border-gray-600">
                            {model.localBaseModel}
                          </span>
                        )}
                        <span className="text-white text-sm font-black truncate">{model.currentVersion || model.latestVersion}</span>
                      </div>
                    </div>
                  </div>
                  {/* 로컬 섹션에는 로컬 릴리즈 날짜 표시 */}
                  {model.localReleaseDate && (
                    <div className="flex items-center gap-1.5 px-1 opacity-60">
                      <Calendar className="size-3 text-cyan-400" />
                      <span className="text-[10px] font-bold text-white tracking-tight">
                        {format(parseISO(model.localReleaseDate), "yyyy. MM. dd")}
                      </span>
                    </div>
                  )}
                </div>
              )}
              
              {(model.hasNewVersion || model.isNewBase) && model.latestVersion && (
                <div className="flex flex-col gap-1.5 w-full p-2 rounded-xl border transition-all bg-[#ff9a00]/10 border-[#ff9a00]/30 shadow-[0_0_15px_rgba(255,154,0,0.1)]">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-[#0b0f19] bg-[#ff9a00] uppercase tracking-wider px-2 py-1 rounded-md shrink-0 shadow-[0_0_10px_rgba(255,154,0,0.4)]">Server</span>
                    <div className="flex items-center justify-between flex-1 min-w-0 gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {model.baseModel && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase border shrink-0 bg-gray-600 text-white border-gray-500">
                            {model.baseModel}
                          </span>
                        )}
                        <span className="text-[#ff9a00] text-sm font-black truncate">{model.latestVersion}</span>
                      </div>
                    </div>
                  </div>
                  {/* 서버 섹션에는 최신 릴리즈 날짜 표시 */}
                  {model.lastReleaseDate && (
                    <div className="flex items-center gap-1.5 px-1 opacity-90">
                      <Calendar className="size-3 text-[#ff9a00]" />
                      <span className="text-[10px] font-bold text-white tracking-tight">
                        {format(parseISO(model.lastReleaseDate), "yyyy. MM. dd")}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {trainedWords.length > 0 && (
              <div className="bg-black/20 p-2 rounded-lg border border-white/5 space-y-1">
                <span className="text-[9px] font-black text-[#6b7280] uppercase tracking-widest">트리거 워드</span>
                <div className="flex flex-wrap gap-1">
                  {trainedWords.slice(0, 2).map((word: string) => (
                    <span key={word} className="text-[10px] text-[#9ca3af] font-bold truncate max-w-[100px]">{word}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {downloadProgress && (
            <div className="bg-black/60 p-4 rounded-2xl border border-[#ff9a00]/40 space-y-3 mt-1 shadow-2xl relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-[#ff9a00]/5" style={{ width: `${progressPercent}%` }} />
              <div className="relative flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-2xl font-black text-[#ff9a00] tabular-nums">{progressPercent}%</span>
                  <span className="text-base font-black text-white tabular-nums">{formatSpeed(downloadProgress.speed)}</span>
                </div>
                <div className="w-full bg-black/80 rounded-full h-4 overflow-hidden border border-white/10 p-0.5">
                  <div className="bg-gradient-to-r from-[#ff9a00] to-[#ffc14d] h-full rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 mt-1 relative">
            <Tooltip content={isUnidentified ? "업데이트 확인이 필요합니다" : "Civitai 페이지 열기"} className="flex-[0.7]">
              <button 
                onClick={handleOpenCivitai} 
                disabled={isUnidentified}
                className={`w-full py-4 rounded-xl transition-all flex items-center justify-center ${
                  isUnidentified 
                    ? "bg-[#374151]/40 text-[#4b5563] cursor-not-allowed opacity-50" 
                    : "bg-[#374151] hover:bg-[#4b5563] text-white"
                }`}
              >
                <ExternalLink className="size-6" />
              </button>
            </Tooltip>
            <Tooltip content={isTauri() ? "파일 위치 열기" : "파일 경로 복사"} className="flex-[0.7]">
              <button onClick={handleOpenFolder} className="w-full bg-[#374151] hover:bg-[#4b5563] text-white py-4 rounded-xl transition-all flex items-center justify-center">
                <FolderOpen className="size-6" />
              </button>
            </Tooltip>
            {(model.hasNewVersion || model.isNewBase) && (
              <Tooltip content={disableDownload ? "얼리 억세스 기간에는 다운로드할 수 없습니다 (공개 전환 대기 필요)" : "업데이트"} className="flex-[0.7]">
                <button 
                  onClick={(e) => handleDownloadItem(e, { model: true, preview: true, info: true, isUpdate: true })} 
                  disabled={disableDownload}
                  className={`w-full py-4 rounded-xl transition-all flex items-center justify-center ${
                    disableDownload 
                      ? "bg-amber-900/20 text-amber-600/50 cursor-not-allowed border-amber-900/30" 
                      : "bg-rose-600 hover:bg-rose-700 text-white"
                  }`}
                >
                  <RefreshCw className="size-6" />
                </button>
              </Tooltip>
            )}
            <div className="flex-[1.5] relative" ref={menuRef}>
              <button 
                onClick={toggleMenu} 
                disabled={disableDownload}
                className={`w-full h-full py-4 rounded-xl text-sm font-black transition-all flex items-center justify-center ${
                  disableDownload 
                    ? "bg-gray-800/50 text-gray-600 cursor-not-allowed" 
                    : (model.hasNewVersion || model.isNewBase ? "bg-[#ff9a00] text-[#0b0f19]" : "bg-[#4f46e5] text-white")
                }`}
              >
                <Download className="size-6" />
              </button>
              {showMenu && (
                <div className="absolute bottom-full left-0 mb-3 w-[200px] bg-[#1f2937] border-2 border-[#374151] rounded-2xl shadow-2xl z-50">
                  <button onClick={(e) => handleDownloadItem(e, { preview: true })} className="w-full px-4 py-4 hover:bg-white/5 text-white flex gap-2"><Sparkles className="size-4" /> 이미지</button>
                  <button onClick={(e) => handleDownloadItem(e, { info: true })} className="w-full px-4 py-4 hover:bg-white/5 text-white flex gap-2"><FileJson className="size-4" /> 정보</button>
                  <button onClick={(e) => handleDownloadItem(e, { model: true })} className="w-full px-4 py-4 hover:bg-white/5 text-white flex gap-2"><Package className="size-4" /> 모델</button>
                  <button onClick={(e) => handleDownloadItem(e, { model: true, preview: true, info: true })} className="w-full px-4 py-4 bg-[#ff9a00] text-[#0b0f19] flex gap-2"><Layers className="size-4" /> 통합 다운로드</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default ModelCard;
