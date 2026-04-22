import { useState, useRef, useEffect, memo, useMemo } from "react";
import { ModelWithStatus } from "../types";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { api } from "../api";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { HardDrive, Check, AlertTriangle, ExternalLink, Download, Calendar, AlertCircle, Sparkles, FileJson, Package, Layers, FolderOpen, RefreshCw, Database, Clock } from "lucide-react";

interface Props {
  model: ModelWithStatus;
  isSelected: boolean;
  onToggle: () => void;
  onDownload: (model: ModelWithStatus, options?: { model?: boolean, preview?: boolean, info?: boolean }) => void;
  onResolveInfo: (model: ModelWithStatus) => Promise<void>;
  downloadProgress?: { received: number; total: number | null; speed: number };
}

const ModelCard = memo(({ model, isSelected, onToggle, onDownload, onResolveInfo, downloadProgress }: Props) => {
  const [showMenu, setShowMenu] = useState(false);
  const [persistedTask, setPersistedTask] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  if (!model) return null;

  // Task 잔상 로직: IDLE 상태가 되면 1초 후 제거 (기존 3초에서 단축)
  useEffect(() => {
    if (model.currentTask) {
      if (model.currentTask.startsWith("IDLE")) {
        // 이미 타이머가 있다면 취소하고 새로 설정
        if (timerRef.current) clearTimeout(timerRef.current);
        setPersistedTask(model.currentTask);
        timerRef.current = setTimeout(() => {
          setPersistedTask(null);
        }, 1000); // 1초 유지
      } else {
        // 진행 중인 상태면 즉시 반영
        if (timerRef.current) clearTimeout(timerRef.current);
        setPersistedTask(model.currentTask);
      }
    }
  }, [model.currentTask]);

  // 외부 클릭 시 메뉴 닫기
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

  const formatSize = (bytes: number) => {
    if (!bytes) return "0 GB";
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(2)} GB`;
  };

  // 프리뷰 URL 결정: 1순위 로컬 경로 변환, 2순위 서버 프리뷰 URL
  const localPreview = useMemo(() => {
    if (!model.preview_path) return null;
    try {
      // 1. 역슬래시를 슬래시로 변경 (브라우저 친화적)
      const normalizedPath = model.preview_path.replace(/\\/g, "/");
      // 2. Tauri v2 변환 수행
      const assetUrl = convertFileSrc(normalizedPath);
      // 3. 공백 및 한글 경로 이슈 대응: 
      // 만약 변환된 URL에 인코딩이 덜 된 부분이 있다면 브라우저가 못 읽을 수 있음
      // 하지만 convertFileSrc가 이미 asset:// 프로토콜을 붙였으므로 
      // 추가적인 encodeURI는 주의해서 사용해야 함. 여기서는 일단 변환 결과 그대로 사용하되 
      // 경로 문제일 경우를 대비해 normalizedPath를 기반으로 변환함.
      return assetUrl;
    } catch (e) {
      console.error("Failed to convert preview path:", e);
      return null;
    }
  }, [model.preview_path]);
  
  // 서버 URL 사용 제거 (로컬 파일 유무 명확화)
  const displayPreview = localPreview;

  const handleOpenCivitai = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // 1. 이미 URL이 있다면 즉시 이동
    if (model.civitaiUrl) {
      api.openBrowser(model.civitaiUrl).catch(console.error);
      return;
    }

    // 2. URL은 없지만 로컬 정보 파일이 있다면 클릭 시점에 로드
    if (hasLocalInfo) {
      try {
        await onResolveInfo(model);
        // 상태가 업데이트된 후 잠시 기다렸다가 URL 확인 (또는 직접 추출 로직 수행 가능)
        // 여기서는 안전하게 로컬 파일을 직접 한 번 더 읽어서 처리
        const targetPath = model.info_path || model.json_path!;
        const content = await api.readTextFile(targetPath);
        const data = JSON.parse(content);
        if (data.modelId) {
          api.openBrowser(`https://civitai.red/models/${data.modelId}`).catch(console.error);
        }
      } catch (err) {
        console.error("Failed to resolve info on click:", err);
      }
    }
  };

  const handleOpenFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    invoke("open_folder", { path: model.model_path }).catch(console.error);
  };

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  const handleDownloadItem = (e: React.MouseEvent, options: { model?: boolean, preview?: boolean, info?: boolean }) => {
    e.stopPropagation();
    onDownload(model, options);
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

  const trainedWords = model.latestVersionData?.trainedWords || [];
  const hasYaml = !!model.latestVersionData?.files?.some((f: any) => f.type === "Config");

  const hasLocalPreview = !!model.preview_path;
  const hasLocalInfo = !!model.info_path || !!model.json_path;
  const isNotFoundOnCivitai = model.isNotFound || persistedTask?.includes("서버 정보 없음") || model.currentTask?.includes("서버 정보 없음");

  return (
    <div 
      onClick={onToggle}
      className={`group relative bg-[#1f2937] border-4 rounded-[32px] overflow-hidden cursor-pointer transition-all duration-300 shadow-2xl ${
        isSelected ? "border-[#ff9a00] ring-8 ring-[#ff9a00]/20 scale-[0.98]" : "border-[#374151] hover:border-[#4b5563] hover:-translate-y-2"
      }`}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 400px' } as any}
    >
      <div className={`absolute top-4 right-4 z-30 size-8 rounded-lg border-2 flex items-center justify-center transition-all ${
        isSelected ? "bg-[#ff9a00] border-[#ff9a00]" : "bg-black/40 border-white/20 opacity-0 group-hover:opacity-100"
      }`}>
        {isSelected && <Check className="size-5 text-[#0b0f19] stroke-[4px]" />}
      </div>

      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
        {model.isOutdated && (
          <div className="bg-red-600/90 backdrop-blur-md text-white text-[10px] font-black px-2.5 py-1 rounded-lg shadow-lg flex items-center gap-1.5 uppercase tracking-wider">
            <AlertTriangle className="size-3" /> 오래됨
          </div>
        )}
        {model.hasNewVersion && (
          <div className="bg-[#ff9a00] text-[#0b0f19] text-[10px] font-black px-2.5 py-1 rounded-lg shadow-lg flex items-center gap-1.5 uppercase tracking-wider animate-pulse">
            <Download className="size-3" /> 새 버전
          </div>
        )}
        {isNotFoundOnCivitai && (
          <div className="bg-gray-800/90 backdrop-blur-md text-gray-400 text-[10px] font-black px-2.5 py-1 rounded-lg shadow-lg flex items-center gap-1.5 uppercase tracking-wider border border-white/10">
            <AlertCircle className="size-3" /> 서버 정보 없음
          </div>
        )}
        {model.imageFetchFailed && !model.preview_path && (
          <div className="bg-orange-900/90 backdrop-blur-md text-orange-200 text-[10px] font-black px-2.5 py-1 rounded-lg shadow-lg flex items-center gap-1.5 uppercase tracking-wider border border-orange-500/30">
            <AlertCircle className="size-3" /> 이미지 없음
          </div>
        )}
        {!model.civitaiUrl && !isNotFoundOnCivitai && !hasLocalInfo && (
          <div className="bg-indigo-900/90 backdrop-blur-md text-indigo-200 text-[10px] font-black px-2.5 py-1 rounded-lg shadow-lg flex items-center gap-1.5 uppercase tracking-wider border border-indigo-500/30">
            <Database className="size-3" /> 식별 필요
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

        {/* Task Overlay */}
        {persistedTask && (
          <div className={`absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300 ${persistedTask.startsWith("IDLE") ? "bg-black/40" : ""}`}>
            <div className="relative mb-4">
              <RefreshCw className={`size-12 stroke-[3px] ${persistedTask.startsWith("IDLE") ? "text-green-500" : "text-[#ff9a00] animate-spin"}`} />
              <div className="absolute inset-0 flex items-center justify-center">
                {persistedTask.startsWith("IDLE") ? <Check className="size-6 text-white" /> : <Database className="size-5 text-white" />}
              </div>
            </div>
            <p className={`${persistedTask.startsWith("IDLE") ? "text-green-400" : "text-[#ff9a00]"} font-black text-xs uppercase tracking-widest mb-2`}>
              {persistedTask.startsWith("IDLE") ? "Done" : "Processing"}
            </p>
            <p className="text-white font-bold text-sm leading-tight break-all">
              {persistedTask}
            </p>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-[#0b0f19] via-[#0b0f19]/90 to-transparent">
          <h3 className="text-xl font-black text-white leading-tight mb-3 line-clamp-2 drop-shadow-2xl uppercase tracking-tighter">{model.name}</h3>
          
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm font-bold">
              <span className="text-[#9ca3af] flex items-center gap-2"><HardDrive className="size-4" /> {formatSize(model.size)}</span>
              <div className="flex flex-col items-end gap-1">
                {model.latestVersion && (
                  <span className="text-[#ff9a00] bg-[#ff9a00]/10 px-3 py-1.5 rounded-lg border border-[#ff9a00]/20 text-xs font-black">버전 {model.latestVersion}</span>
                )}
                {model.lastReleaseDate && (
                  <span className="text-white/90 text-sm font-black flex items-center gap-2 mt-1">
                    <Calendar className="size-4 text-cyan-400" /> {format(parseISO(model.lastReleaseDate), "yyyy. MM. dd")}
                  </span>
                )}
              </div>
            </div>

            {trainedWords.length > 0 && (
              <div className="bg-black/20 p-2 rounded-lg border border-white/5 space-y-1">
                <span className="text-[9px] font-black text-[#6b7280] uppercase tracking-widest">트리거 워드</span>
                <div className="flex flex-wrap gap-1">
                  {trainedWords.slice(0, 2).map((word: string) => (
                    <span key={word} className="text-[10px] text-[#9ca3af] font-bold truncate max-w-[100px]">
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {downloadProgress && (
              <div className="bg-black/60 p-4 rounded-2xl border border-[#ff9a00]/40 space-y-3 mt-1 shadow-2xl relative overflow-hidden group/dl">
                {/* Background Progress Glow */}
                <div 
                  className="absolute inset-y-0 left-0 bg-[#ff9a00]/5 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />

                <div className="relative flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-[#ff9a00] uppercase tracking-widest opacity-70">Download Speed</span>
                      <span className="text-base font-black text-white tabular-nums">{formatSpeed(downloadProgress.speed)}</span>
                    </div>
                    <div className="text-right flex flex-col">
                      <span className="text-[10px] font-black text-[#ff9a00] uppercase tracking-widest opacity-70">Progress</span>
                      <span className="text-2xl font-black text-[#ff9a00] leading-none tabular-nums">{progressPercent}%</span>
                    </div>
                  </div>
                  
                  <div className="w-full bg-black/80 rounded-full h-4 overflow-hidden border border-white/10 p-0.5 shadow-inner">
                    <div 
                      className="bg-gradient-to-r from-[#ff9a00] to-[#ffc14d] h-full rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(255,154,0,0.6)]" 
                      style={{ width: `${progressPercent}%` }} 
                    />
                  </div>

                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5 text-[#9ca3af]">
                      <Clock className="size-3" />
                      <span className="text-xs font-bold italic">
                        ETA: <span className="text-white not-italic">{formatETA(downloadProgress.received, downloadProgress.total, downloadProgress.speed)}</span>
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-[#6b7280] uppercase">
                      {progressPercent < 100 ? "Fetching Data..." : "Finalizing..."}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-1 relative">
              <button 
                onClick={handleOpenCivitai}
                title="Civitai 페이지 열기"
                className="flex-1 flex items-center justify-center gap-2 bg-[#374151] hover:bg-[#4b5563] text-white py-3 rounded-xl text-sm font-black transition-all border-none cursor-pointer"
              >
                <ExternalLink className="size-4" />
              </button>

              <button 
                onClick={handleOpenFolder}
                title="파일 위치 열기"
                className="flex-1 flex items-center justify-center gap-2 bg-[#374151] hover:bg-[#4b5563] text-white py-3 rounded-xl text-sm font-black transition-all border-none cursor-pointer"
              >
                <FolderOpen className="size-4" />
              </button>

              <div className="flex-[2] relative" ref={menuRef}>
                <button 
                  onClick={toggleMenu}
                  disabled={!!downloadProgress}
                  className={`w-full h-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black transition-all border-none cursor-pointer shadow-xl ${
                    model.hasNewVersion ? "bg-[#ff9a00] text-[#0b0f19] hover:bg-[#e68a00]" : "bg-[#4f46e5] text-white hover:bg-[#4338ca]"
                  } disabled:opacity-50`}
                >
                  <Download className="size-4" /> 다운로드
                </button>

                {showMenu && (
                  <div className="absolute bottom-full left-0 mb-3 w-[200px] bg-[#1f2937] border-2 border-[#374151] rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="p-2 grid grid-cols-1 gap-1">
                      <button 
                        onClick={(e) => handleDownloadItem(e, { preview: true })}
                        className="flex items-center gap-3 w-full px-4 py-3 hover:bg-[#ff9a00]/10 text-left rounded-xl transition-colors group/item"
                      >
                        <Sparkles className={`size-4 ${hasLocalPreview ? 'text-green-400' : 'text-[#ff9a00]'}`} />
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-white">이미지 받기</span>
                        </div>
                      </button>
                      <button 
                        onClick={(e) => handleDownloadItem(e, { info: true })}
                        className="flex items-center gap-3 w-full px-4 py-3 hover:bg-[#ff9a00]/10 text-left rounded-xl transition-colors group/item"
                      >
                        <FileJson className={`size-4 ${hasLocalInfo ? 'text-green-400' : 'text-[#ff9a00]'}`} />
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-white">정보 파일 받기</span>
                        </div>
                      </button>
                      <button 
                        onClick={(e) => handleDownloadItem(e, { model: true })}
                        className="flex items-center gap-3 w-full px-4 py-3 hover:bg-[#ff9a00]/10 text-left rounded-xl transition-colors group/item"
                      >
                        <Package className="size-4 text-[#ff9a00]" />
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-white">모델 파일 받기</span>
                        </div>
                      </button>
                      <div className="h-[1px] bg-[#374151] my-1" />
                      <button 
                        onClick={(e) => handleDownloadItem(e, { model: true, preview: true, info: true })}
                        className="flex items-center gap-3 w-full px-4 py-3 bg-[#ff9a00] text-[#0b0f19] hover:bg-[#e68a00] text-left rounded-xl transition-colors"
                      >
                        <Layers className="size-4" />
                        <span className="text-xs font-black uppercase tracking-tighter">전체 통합 다운로드</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default ModelCard;
