import { X, AlertCircle, Clock, Globe, Trash2, ChevronRight } from "lucide-react";
import { ErrorLog } from "../../types";

interface LogViewerModalProps {
  show: boolean;
  onClose: () => void;
  logs: ErrorLog[];
  onClear: () => void;
}

export const LogViewerModal = ({ show, onClose, logs, onClear }: LogViewerModalProps) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-10">
      <div className="bg-[#111827] border-2 border-[#374151] w-full max-w-4xl h-[70vh] rounded-[40px] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-8 border-b-2 border-[#374151] flex justify-between items-center bg-[#1f2937]">
          <div className="flex items-center gap-4">
            <AlertCircle className="text-red-500 size-8" />
            <div>
              <h2 className="text-3xl font-black text-white uppercase tracking-tighter">에러 로그</h2>
              <p className="text-sm font-bold text-[#9ca3af]">최근 발생한 {logs.length}개의 통신 에러</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {logs.length > 0 && (
              <button 
                onClick={onClear}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all text-xs font-black uppercase"
              >
                <Trash2 className="size-4" /> 로그 비우기
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-white">
              <X className="size-10" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-black/20">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-20">
              <AlertCircle className="size-20 mb-4" />
              <p className="text-2xl font-black uppercase italic">발생한 에러가 없습니다</p>
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <div key={log.id} className="bg-[#1f2937]/50 border-2 border-[#374151] rounded-2xl p-6 hover:border-[#4b5563] transition-all group">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase ${
                        log.status && log.status >= 500 ? "bg-red-500 text-white" : 
                        log.status && log.status >= 400 ? "bg-yellow-500 text-[#0b0f19]" : 
                        log.method === "CACHE" ? "bg-green-500 text-white" :
                        "bg-[#4f46e5] text-white"
                      }`}>
                        {log.status ? `HTTP ${log.status}` : log.method}
                      </span>
                      <span className="text-sm font-bold text-white uppercase">{log.method}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[#6b7280] text-xs font-bold">
                      <Clock className="size-3" /> {log.timestamp}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {log.target && (
                      <div className="flex items-center gap-2 text-[#ff9a00] font-black text-sm">
                        <ChevronRight className="size-4" /> {log.target}
                      </div>
                    )}
                    <div className="bg-black/40 p-4 rounded-xl border border-white/5 space-y-4">
                      <div>
                        <p className="text-[#6b7280] text-[10px] font-black uppercase mb-1">Message</p>
                        <p className={`font-mono text-sm break-all leading-relaxed ${
                          log.method === "CACHE" ? "text-green-400" : "text-red-400"
                        }`}>{log.message}</p>
                      </div>

                      {log.body && (
                        <div>
                          <p className="text-[#6b7280] text-[10px] font-black uppercase mb-1">Response Body</p>
                          <pre className="text-cyan-400 font-mono text-xs break-all whitespace-pre-wrap bg-black/40 p-3 rounded-lg border border-white/5 max-h-40 overflow-y-auto custom-scrollbar">
                            {log.body}
                          </pre>
                        </div>
                      )}

                      {log.headers && Object.keys(log.headers).length > 0 && (
                        <div>
                          <p className="text-[#6b7280] text-[10px] font-black uppercase mb-1">Response Headers</p>
                          <div className="grid grid-cols-1 gap-1 bg-black/20 p-3 rounded-lg border border-white/5 font-mono text-[10px]">
                            {Object.entries(log.headers).map(([k, v]) => (
                              <div key={k} className="flex gap-2">
                                <span className="text-[#9ca3af] font-black shrink-0">{k}:</span>
                                <span className="text-[#e5e7eb] break-all">{v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {log.url && (
                      <div className="flex items-center gap-2 text-[#4b5563] text-[10px] font-mono break-all truncate">
                        <Globe className="size-3 flex-shrink-0" /> {log.url}
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
