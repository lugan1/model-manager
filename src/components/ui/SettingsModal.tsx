import { X, Settings, Box, Sparkles, FolderOpen, Key, AlertCircle, Clock, Trash2, Database } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { ModelType } from "../../types";
import { useSettings } from "../../contexts/SettingsContext";
import { useModelContext } from "../../contexts/ModelContext";
import { DBService } from "../../services/db.service";
import { useToast } from "../../hooks/useToast";

interface SettingsModalProps {
  show: boolean;
  onClose: () => void;
}

export const SettingsModal = ({ show, onClose }: SettingsModalProps) => {
  const { paths, savePaths, apiKey, setApiKey, updateTTL, setUpdateTTL } = useSettings();
  const { scanFolder, setModels } = useModelContext();
  const { showNotification } = useToast();

  if (!show) return null;

  const handleSelectFolder = async (modelType: ModelType) => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: `${modelType.toUpperCase()} 스캔 폴더 선택`,
    });

    if (selected && typeof selected === "string") {
      const newPaths = { ...paths, [modelType]: { scan: selected } };
      savePaths(newPaths);
    }
  };

  const handleResetCache = async () => {
    if (confirm("정말로 모든 캐시(해시, 업데이트 정보)를 초기화하시겠습니까?\n로컬 모델 파일은 삭제되지 않습니다.")) {
      try {
        await DBService.clearAll();
        
        // 현재 모델 목록에서 메타데이터 필드만 초기화 (화면에서 사라지지 않음)
        setModels(prev => prev.map(m => ({
          ...m,
          latestVersionData: undefined,
          localVersionData: undefined,
          currentVersion: undefined,
          currentVersionId: undefined,
          localPreviewUrl: undefined,
          localReleaseDate: undefined,
          hasNewVersion: false,
          isNotFound: false,
          currentTask: "IDLE: 캐시 초기화됨"
        })));

        showNotification("캐시 초기화 완료", "모든 캐시 데이터가 삭제되었습니다. 새로운 정보를 보려면 다시 스캔을 진행해주세요.", "success");
      } catch (e: any) {
        showNotification("초기화 실패", e.message || "오류가 발생했습니다.", "error");
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-xl flex items-center justify-center p-10">
      <div className="bg-[#111827] border-2 border-[#374151] w-full max-w-3xl rounded-[40px] overflow-hidden shadow-2xl">
        <div className="p-8 border-b-2 border-[#374151] flex justify-between items-center bg-[#1f2937]">
          <div className="flex items-center gap-4">
            <Settings className="text-[#ff9a00] size-8" />
            <h2 className="text-3xl font-black text-white uppercase">설정</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-white">
            <X className="size-10" />
          </button>
        </div>
        
        <div className="p-10 space-y-10 overflow-y-auto max-h-[70vh] custom-scrollbar">
          <div className="bg-[#ff9a00]/10 border border-[#ff9a00]/30 p-6 rounded-2xl flex items-center gap-4">
            <AlertCircle className="text-[#ff9a00] size-6 flex-shrink-0" />
            <p className="text-sm font-bold text-[#ff9a00]">다운로드 시 새 버전은 기존 모델이 위치한 폴더에 자동으로 저장됩니다.</p>
          </div>

          <section className="space-y-6">
            <div className="flex items-center gap-3 text-[#ff9a00]">
              <Clock className="size-6" />
              <h3 className="text-xl font-black uppercase">업데이트 확인 주기 (TTL)</h3>
            </div>
            <div className="flex items-center gap-4 bg-black/20 p-6 rounded-2xl border-2 border-[#374151]">
              <input 
                type="number" 
                value={updateTTL} 
                onChange={(e) => setUpdateTTL(Math.max(1, Number(e.target.value)))}
                className="w-24 bg-black/40 border-2 border-[#374151] p-3 rounded-xl text-xl font-black text-white outline-none focus:border-[#ff9a00] transition-colors text-center"
              />
              <span className="text-xl font-bold text-[#9ca3af]">시간 동안 결과를 캐싱합니다.</span>
              <p className="text-[10px] text-[#6b7280] ml-auto italic">최소 1시간</p>
            </div>
          </section>

          <section className="space-y-6 bg-black/20 p-8 rounded-3xl border-2 border-[#374151]">
            <div className="flex items-center gap-3 text-[#ff9a00]">
              <Box className="size-6" />
              <h3 className="text-xl font-black uppercase">체크포인트 스캔 경로</h3>
            </div>
            <div className="flex bg-black/40 border-2 border-[#374151] rounded-2xl items-center pr-4">
              <div className="flex-1 px-4 py-3 text-sm truncate text-[#9ca3af] font-mono">{paths.checkpoint.scan}</div>
              <button onClick={() => handleSelectFolder('checkpoint')} className="p-2 text-[#ff9a00] hover:bg-[#374151] rounded-xl">
                <FolderOpen className="size-5" />
              </button>
            </div>
          </section>

          <section className="space-y-6 bg-black/20 p-8 rounded-3xl border-2 border-[#374151]">
            <div className="flex items-center gap-3 text-[#ff9a00]">
              <Sparkles className="size-6" />
              <h3 className="text-xl font-black uppercase">로라 스캔 경로</h3>
            </div>
            <div className="flex bg-black/40 border-2 border-[#374151] rounded-2xl items-center pr-4">
              <div className="flex-1 px-4 py-3 text-sm truncate text-[#9ca3af] font-mono">{paths.lora.scan}</div>
              <button onClick={() => handleSelectFolder('lora')} className="p-2 text-[#ff9a00] hover:bg-[#374151] rounded-xl">
                <FolderOpen className="size-5" />
              </button>
            </div>
          </section>

          <section className="space-y-6 bg-black/20 p-8 rounded-3xl border-2 border-[#374151]">
            <div className="flex items-center gap-3 text-[#ff9a00]">
              <Database className="size-6" />
              <h3 className="text-xl font-black uppercase">LyCORIS 스캔 경로</h3>
            </div>
            <div className="flex bg-black/40 border-2 border-[#374151] rounded-2xl items-center pr-4">
              <div className="flex-1 px-4 py-3 text-sm truncate text-[#9ca3af] font-mono">{paths.lycoris.scan}</div>
              <button onClick={() => handleSelectFolder('lycoris')} className="p-2 text-[#ff9a00] hover:bg-[#374151] rounded-xl">
                <FolderOpen className="size-5" />
              </button>
            </div>
          </section>

          <section className="space-y-6">
            <div className="flex items-center gap-3 text-[#ff9a00]">
              <Key className="size-6" />
              <h3 className="text-xl font-black uppercase">Civitai API Key</h3>
            </div>
            <input 
              type="password" 
              value={apiKey} 
              onChange={(e) => setApiKey(e.target.value)} 
              placeholder="API 키를 입력하세요" 
              className="w-full bg-black/40 border-2 border-[#374151] p-6 rounded-2xl text-xl font-mono text-white outline-none focus:border-[#ff9a00] transition-colors" 
            />
          </section>

          <div className="h-[2px] bg-[#374151] my-8" />

          <section className="bg-red-900/10 p-8 rounded-3xl border-2 border-red-500/20 space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <Trash2 className="size-6" />
              <h3 className="text-xl font-black uppercase">캐시 초기화</h3>
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
              <p className="text-sm font-bold text-red-300/60 leading-relaxed max-w-lg">
                모델 식별 정보, 해시, 업데이트 이력 등 수집된 캐시 데이터만 삭제합니다.
                <br /><span className="text-[10px] opacity-50">(경로 설정 및 API 키는 유지됩니다)</span>
              </p>
              <button 
                onClick={handleResetCache}
                className="whitespace-nowrap bg-red-600 hover:bg-red-700 text-white px-8 py-3.5 rounded-2xl font-black text-sm uppercase transition-all shadow-lg active:scale-95 border-none cursor-pointer"
              >
                캐시 초기화 실행
              </button>
            </div>
          </section>

          <button 
            onClick={() => { onClose(); scanFolder(); }} 
            className="w-full bg-[#ff9a00] text-[#0b0f19] py-6 rounded-2xl font-black text-2xl uppercase hover:bg-[#e68a00] transition-all"
          >
            저장 및 닫기
          </button>
        </div>
      </div>
    </div>
  );
};
