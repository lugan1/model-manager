import { X, AlertCircle, Clock, Globe, Trash2, ChevronRight, RotateCw, Loader2, RefreshCw, Pause, Play, Square } from "lucide-react";
import { ErrorLog } from "../../types";

interface LogViewerModalProps {
  show: boolean;
  onClose: () => void;
  logs: ErrorLog[];
  onClear: () => void;
  onDeleteLog: (id: string) => void;
  onRetry: (path: string) => void;
  onRetryAll: (force: boolean) => void;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  isPaused?: boolean;
  batchStatus?: {
    isUpdating: boolean;
    current: number;
    total: number;
    name: string;
    task: string;
  };
}

export const LogViewerModal = ({ 
  show, onClose, logs, onClear, onDeleteLog, onRetry, onRetryAll, 
  onPause, onResume, onCancel, isPaused, batchStatus 
}: LogViewerModalProps) => {
  if (!show) return null;

  const retryableLogs = logs.filter(l => l.path);
  const isUpdating = batchStatus?.isUpdating;
  const progress = batchStatus && batchStatus.total > 0 
    ? (batchStatus.current / batchStatus.total) * 100 
    : 0;

  return (
    <div className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6 md:p-10">
      <div className="bg-[#111827] border-2 border-[#374151] w-full max-w-6xl h-[85vh] rounded-[40px] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-8 border-b-2 border-[#374151] flex justify-between items-center bg-[#1f2937]">
          <div className="flex items-center gap-6">
            <AlertCircle className="text-red-500 size-10" />
            <div>
              <h2 className="text-3xl font-black text-white uppercase tracking-tighter">에러 로그</h2>
              <p className="text-sm font-bold text-[#9ca3af]">최근 발생한 {logs.length}개의 통신 에러</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right mr-6 hidden lg:block">
              <p className="text-xs font-black text-[#9ca3af] uppercase tracking-widest leading-tight">
                {isUpdating ? "작업 중" : "대기 중"}
              </p>
              <p className="text-xs font-bold text-[#6b7280] italic">
                창을 닫아도 백그라운드에서 계속 진행됩니다
              </p>
            </div>
            {retryableLogs.length > 0 && !isUpdating && (
              <div className="flex items-center bg-black/20 border border-white/10 rounded-2xl overflow-hidden shadow-lg">
                <button 
                  onClick={() => onRetryAll(false)}
                  className="flex items-center gap-3 px-6 py-3 text-indigo-400 hover:bg-indigo-500 hover:text-white transition-all text-xs font-black uppercase border-r border-white/10"
                  title="이미 정보 파일이 있는 모델은 건너뛰고 재시도합니다."
                >
                  <RotateCw className="size-4" /> 일반 재시도
                </button>
                <button 
                  onClick={() => onRetryAll(true)}
                  className="flex items-center gap-3 px-6 py-3 text-amber-400 hover:bg-amber-500 hover:text-white transition-all text-xs font-black uppercase"
                  title="기존 정보를 무시하고 모든 모델을 강제로 다시 조회합니다."
                >
                  <RefreshCw className="size-4" /> 강제 재시도
                </button>
              </div>
            )}
            {logs.length > 0 && !isUpdating && (
              <button 
                onClick={onClear}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all text-xs font-black uppercase"
              >
                <Trash2 className="size-4" /> 로그 비우기
              </button>
            )}
            <button onClick={onClose} className="p-3 hover:bg-white/10 rounded-full text-white ml-2">
              <X className="size-10" />
            </button>
          </div>
        </div>

        {/* Batch Progress Bar */}
        {batchStatus && isUpdating && (
          <div className="px-10 py-8 bg-indigo-500/10 border-b border-indigo-500/20">
            <div className="flex justify-between items-center mb-4">
              <div className="flex flex-col gap-2 min-w-0 flex-1 mr-10">
                <div className="flex items-center gap-3">
                  {isPaused ? (
                    <Pause className="size-5 text-amber-400 animate-pulse" />
                  ) : (
                    <Loader2 className="size-5 text-indigo-400 animate-spin" />
                  )}
                  <span className={`text-sm font-black uppercase tracking-[0.2em] ${isPaused ? "text-amber-400" : "text-indigo-400"}`}>
                    배치 업데이트 {isPaused ? "일시정지됨" : "진행 중"}
                  </span>
                </div>
                <div className="text-lg font-black text-white truncate">
                  {batchStatus.name || "준비 중..."}
                </div>
                <div className="text-xs font-bold text-[#9ca3af] truncate bg-black/20 px-3 py-1 rounded-lg border border-white/5 inline-block w-fit">
                  {batchStatus.task}
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-4 mr-10 bg-black/40 p-2 rounded-3xl border border-white/5 shadow-inner">
                {isPaused ? (
                  <button
                    onClick={onResume}
                    className="p-4 bg-green-500 text-white rounded-2xl hover:bg-green-600 transition-all shadow-lg hover:scale-105 active:scale-95 group"
                    title="재개"
                  >
                    <Play className="size-6 fill-current group-hover:scale-110 transition-transform" />
                  </button>
                ) : (
                  <button
                    onClick={onPause}
                    className="p-4 bg-amber-500 text-white rounded-2xl hover:bg-amber-600 transition-all shadow-lg hover:scale-105 active:scale-95 group"
                    title="일시정지"
                  >
                    <Pause className="size-6 fill-current group-hover:scale-110 transition-transform" />
                  </button>
                )}
                <button
                  onClick={onCancel}
                  className="p-4 bg-red-500 text-white rounded-2xl hover:bg-red-600 transition-all shadow-lg hover:scale-105 active:scale-95 group"
                  title="중지"
                >
                  <Square className="size-6 fill-current group-hover:scale-110 transition-transform" />
                </button>
              </div>

              <div className="text-right shrink-0">
                <div className="flex items-baseline justify-end gap-1">
                  <span className="text-4xl font-black text-white italic tracking-tighter">
                    {batchStatus.current}
                  </span>
                  <span className="text-xl font-bold text-[#6b7280]">/</span>
                  <span className="text-xl font-black text-[#6b7280]">
                    {batchStatus.total}
                  </span>
                </div>
                <div className="text-xs font-black text-indigo-400 mt-1 tracking-widest">
                  {Math.round(progress)}% COMPLETED
                </div>
              </div>
            </div>
            <div className="h-4 bg-black/40 rounded-full overflow-hidden border border-white/5 p-1">
              <div 
                className={`h-full bg-gradient-to-r rounded-full transition-all duration-300 ease-out shadow-[0_0_20px_rgba(79,70,229,0.6)] ${
                  isPaused ? "from-amber-600 to-amber-400" : "from-indigo-600 to-indigo-400"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-black/20">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-20">
              <AlertCircle className="size-24 mb-6" />
              <p className="text-3xl font-black uppercase italic tracking-widest">발생한 에러가 없습니다</p>
            </div>
          ) : (
            <div className="space-y-6">
              {logs.map((log) => (
                <div key={log.id} className={`bg-[#1f2937]/50 border-2 border-[#374151] rounded-3xl p-8 transition-all group relative ${isUpdating ? "opacity-40 grayscale pointer-events-none" : "hover:border-[#4b5563] hover:bg-[#1f2937] hover:shadow-xl"}`}>
                  {!isUpdating && (
                    <div className="absolute top-8 right-8 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      {log.path && (
                        <button
                          onClick={() => onRetry(log.path!)}
                          title="해당 파일 업데이트 재시도"
                          className="p-3 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-all shadow-lg hover:scale-110"
                        >
                          <RotateCw className="size-5" />
                        </button>
                      )}
                      <button
                        onClick={() => onDeleteLog(log.id)}
                        title="로그 삭제"
                        className="p-3 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all hover:scale-110"
                      >
                        <Trash2 className="size-5" />
                      </button>
                    </div>
                  )}
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4 pr-24">
                      <span className={`px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider ${
                        log.status && log.status >= 500 ? "bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.4)]" : 
                        log.status && log.status >= 400 ? "bg-yellow-500 text-[#0b0f19] shadow-[0_0_15px_rgba(234,179,8,0.4)]" : 
                        log.method === "CACHE" ? "bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.4)]" :
                        "bg-[#4f46e5] text-white shadow-[0_0_15px_rgba(79,70,229,0.4)]"
                      }`}>
                        {log.status ? `HTTP ${log.status}` : log.method}
                      </span>
                      <span className="text-base font-black text-white uppercase tracking-tight">{log.method}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[#6b7280] text-sm font-bold shrink-0 bg-black/20 px-3 py-1 rounded-lg">
                      <Clock className="size-4" /> {log.timestamp}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {log.target && (
                      <div className="flex items-center gap-3 text-[#ff9a00] font-black text-lg group-hover:translate-x-1 transition-transform">
                        <ChevronRight className="size-6 shrink-0" /> 
                        <span className="truncate">{log.target}</span>
                      </div>
                    )}
                    <div className="bg-black/40 p-6 rounded-2xl border border-white/5 space-y-6">
                      <div>
                        <div className="text-[#6b7280] text-[11px] font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                          <div className="w-1 h-3 bg-indigo-500 rounded-full"></div> Message
                        </div>
                        <p className={`font-mono text-base break-words leading-relaxed ${
                          log.method === "CACHE" ? "text-green-400" : "text-red-400"
                        }`}>{log.message}</p>
                      </div>

                      {log.body && (
                        <div>
                          <p className="text-[#6b7280] text-[11px] font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                            <div className="w-1 h-3 bg-cyan-500 rounded-full"></div> Response Body
                          </p>
                          <pre className="text-cyan-400 font-mono text-sm break-all whitespace-pre-wrap bg-black/40 p-4 rounded-xl border border-white/5 max-h-60 overflow-y-auto custom-scrollbar shadow-inner">
                            {log.body}
                          </pre>
                        </div>
                      )}

                      {log.headers && Object.keys(log.headers).length > 0 && (
                        <div>
                          <p className="text-[#6b7280] text-[11px] font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                            <div className="w-1 h-3 bg-purple-500 rounded-full"></div> Response Headers
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-black/20 p-4 rounded-xl border border-white/5 font-mono text-xs">
                            {Object.entries(log.headers).map(([k, v]) => (
                              <div key={k} className="flex gap-3 items-start bg-white/5 p-2 rounded-lg">
                                <span className="text-[#9ca3af] font-black shrink-0 border-r border-white/10 pr-2">{k}</span>
                                <span className="text-[#e5e7eb] break-all">{v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {log.url && (
                      <div className="flex items-center gap-2 text-[#4b5563] text-xs font-mono break-all bg-black/20 px-3 py-2 rounded-lg w-fit max-w-full">
                        <Globe className="size-3.5 flex-shrink-0" /> 
                        <span className="truncate hover:whitespace-normal transition-all">{log.url}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

};
