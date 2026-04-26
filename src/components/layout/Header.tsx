import { Search, Layers, Box, Sparkles, RefreshCw, Settings, EyeOff, Copy, ArrowUpAz, Database, Clock, ScrollText, ArrowRight, Pause, Play, XCircle } from "lucide-react";
import { useSettings } from "../../contexts/SettingsContext";
import { useFilter } from "../../contexts/FilterContext";
import { useModelContext } from "../../contexts/ModelContext";
import { useErrorLogs } from "../../hooks/useErrorLogs";
import { useBatchUpdateContext } from "../../contexts/BatchUpdateContext";
import { Tooltip } from "../ui/Tooltip";
import { useMemo } from "react";
import { useToast } from "../../hooks/useToast";

interface HeaderProps {
  onShowSettings: () => void;
  onShowLogs: () => void;
}

export const Header = ({ onShowSettings, onShowLogs }: HeaderProps) => {
  const { 
    activeTab, setActiveTab, searchTerm, setSearchTerm, sortBy, setSortBy, 
    sortOrder, setSortOrder, showOnlyOutdated, setShowOnlyOutdated, 
    showOnlyDuplicates, setShowOnlyDuplicates, selectedDirPath 
  } = useFilter();
  
  const { models, scanFolder, selectedModels } = useModelContext();
  const { logs } = useErrorLogs();
  const { showNotification } = useToast();
  const { 
    isUpdating, isPaused, updateStatus, updateLatestVersionsInParallel,
    pauseBatchUpdate, resumeBatchUpdate, cancelBatchUpdate 
  } = useBatchUpdateContext();

  // 현재 선택된 경로 아래에 있는 모델들만 필터링
  const modelsInSelectedDir = useMemo(() => {
    if (!selectedDirPath) return models;
    const normalizedSelected = selectedDirPath.replace(/[\\\/]+/g, "\\").toLowerCase();
    return models.filter(m => m.model_path.toLowerCase().startsWith(normalizedSelected));
  }, [models, selectedDirPath]);

  // 업데이트 대상 결정 (선택된 모델이 있으면 그것만, 없으면 폴더 전체)
  const updateTargets = useMemo(() => {
    if (selectedModels.size > 0) {
      return models.filter(m => selectedModels.has(m.model_path));
    }
    return modelsInSelectedDir;
  }, [models, modelsInSelectedDir, selectedModels]);

  const handleRefresh = async (checkUpdates = false, forceRefresh = false) => {
    if (checkUpdates) {
      const targets = updateTargets;
      if (targets.length === 0) {
        showNotification("알림", "업데이트 확인할 모델이 없습니다.", "warning");
        return;
      }
      await updateLatestVersionsInParallel(targets, forceRefresh);
      showNotification("업데이트 확인 완료", `${targets.length}개의 모델 정보를 확인했습니다.`, "success");
    } else {
      await scanFolder();
    }
  };

  const progressPercent = Math.round((updateStatus.current / (updateStatus.total || 1)) * 100);

  return (
    <>
      <header className="h-24 bg-[#1f2937] border-b-2 border-[#374151] px-10 flex items-center justify-between z-40 flex-shrink-0 relative">
        <div className="flex items-center gap-12">
          <div className="flex items-center gap-6">
            <div className="bg-[#ff9a00] p-2.5 rounded-xl"><Layers className="text-[#0b0f19] size-10" /></div>
            <span className="font-black text-white uppercase text-3xl tracking-tighter whitespace-nowrap">MODEL <span className="text-[#ff9a00]">MANAGER</span></span>
          </div>

          <nav className="flex bg-black/40 p-1.5 rounded-2xl border-2 border-[#374151]">
            <button onClick={() => setActiveTab("checkpoint")} className={`flex items-center gap-3 px-8 py-3 rounded-xl font-black text-lg transition-all ${activeTab === "checkpoint" ? "bg-[#ff9a00] text-[#0b0f19] shadow-lg" : "text-[#9ca3af] hover:text-white"}`}>
              <Box className="size-6" /> 체크포인트
            </button>
            <button onClick={() => setActiveTab("lora")} className={`flex items-center gap-3 px-8 py-3 rounded-xl font-black text-lg transition-all ${activeTab === "lora" ? "bg-[#ff9a00] text-[#0b0f19] shadow-lg" : "text-[#9ca3af] hover:text-white"}`}>
              <Sparkles className="size-6" /> 로라
            </button>
            <button onClick={() => setActiveTab("lycoris")} className={`flex items-center gap-3 px-8 py-3 rounded-xl font-black text-lg transition-all ${activeTab === "lycoris" ? "bg-[#ff9a00] text-[#0b0f19] shadow-lg" : "text-[#9ca3af] hover:text-white"}`}>
              <Database className="size-6" /> LyCORIS
            </button>
          </nav>
        </div>

        <div className="flex-1 max-w-4xl mx-12 flex items-center gap-6">
          <div className="relative flex-1 group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-[#4b5563] group-focus-within:text-[#ff9a00] transition-colors size-6" />
            <input 
              type="text" 
              placeholder="모델 이름 또는 카테고리 검색..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black/40 border-2 border-[#374151] focus:border-[#ff9a00] pl-16 pr-6 py-3 rounded-2xl outline-none text-xl font-bold transition-all placeholder:text-[#4b5563]"
            />
          </div>
          
          <div className="flex bg-black/40 p-1.5 rounded-2xl border-2 border-[#374151] gap-1">
            {[
              { id: 'name', icon: ArrowUpAz, label: '이름' },
              { id: 'size', icon: Database, label: '크기' },
              { id: 'modified', icon: Clock, label: '날짜' }
            ].map((item) => (
              <Tooltip key={item.id} position="bottom" content={`${item.label} 정렬 (${sortOrder === 'asc' ? '오름차순' : '내림차순'})`}>
                <button
                  onClick={() => {
                    if (sortBy === item.id) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    else { setSortBy(item.id as any); setSortOrder('asc'); }
                  }}
                  className={`p-3 rounded-xl transition-all flex items-center gap-2 ${sortBy === item.id ? "bg-[#ff9a00] text-[#0b0f19]" : "text-[#9ca3af] hover:bg-white/5"}`}
                >
                  <item.icon className="size-6" />
                  {sortBy === item.id && <span className="text-xs font-black uppercase">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </Tooltip>
            ))}
          </div>

          <div className="flex bg-black/40 p-1.5 rounded-2xl border-2 border-[#374151] gap-1 ml-4">
            <Tooltip position="bottom" content="오래된 모델만 보기">
              <button
                onClick={() => setShowOnlyOutdated(!showOnlyOutdated)}
                className={`p-3 rounded-xl transition-all flex items-center gap-2 ${showOnlyOutdated ? "bg-[#ef4444] text-white shadow-lg" : "text-[#9ca3af] hover:bg-white/5"}`}
              >
                <EyeOff className="size-6" />
              </button>
            </Tooltip>
            <Tooltip position="bottom" content="중복 모델만 보기">
              <button
                onClick={() => setShowOnlyDuplicates(!showOnlyDuplicates)}
                className={`p-3 rounded-xl transition-all flex items-center gap-2 ${showOnlyDuplicates ? "bg-[#3b82f6] text-white shadow-lg" : "text-[#9ca3af] hover:bg-white/5"}`}
              >
                <Copy className="size-6" />
              </button>
            </Tooltip>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          <Tooltip position="bottom" content="에러 로그 보기">
            <button 
              onClick={onShowLogs} 
              className="relative p-3.5 bg-[#1f2937] hover:bg-[#374151] border-2 border-[#374151] rounded-2xl text-white transition-all active:scale-95 shadow-xl"
            >
              <ScrollText className="size-6" />
              {logs.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full border-2 border-[#1f2937] min-w-[20px] text-center shadow-lg">
                  {logs.length}
                </span>
              )}
            </button>
          </Tooltip>
          <Tooltip position="bottom" content={`${selectedModels.size > 0 ? `선택된 모델(${selectedModels.size}개)` : `현재 폴더(${modelsInSelectedDir.length}개)`} 최신 정보 확인 (Shift + 클릭: 강제)`}>
            <button 
              onClick={(e) => handleRefresh(true, e.shiftKey)} 
              disabled={isUpdating}
              className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-3.5 rounded-2xl font-black text-lg flex items-center gap-3 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-wait whitespace-nowrap shadow-xl"
            >
              <RefreshCw className={`size-6 ${isUpdating ? 'animate-spin' : ''}`} />
              {isUpdating ? '확인 중...' : '업데이트 확인'}
            </button>
          </Tooltip>
          <Tooltip position="bottom" content="저장소 새로고침 (로컬 스캔)">
            <button 
              onClick={() => handleRefresh(false)} 
              disabled={isUpdating}
              className="bg-[#ff9a00] hover:bg-[#e68a00] text-[#0b0f19] px-6 py-3.5 rounded-2xl font-black text-lg flex items-center gap-3 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap shadow-xl"
            >
              <RefreshCw className="size-6" /> 새로고침
            </button>
          </Tooltip>
          <Tooltip position="bottom" content="설정 (경로 및 API 키)">
            <button 
              onClick={onShowSettings} 
              className="p-3.5 bg-[#1f2937] hover:bg-[#374151] border-2 border-[#374151] rounded-2xl text-white transition-all active:scale-95 shadow-xl"
            >
              <Settings className="size-8" />
            </button>
          </Tooltip>
        </div>

        {/* --- Integrated Slim Progress Bar (Header Bottom) --- */}
        {isUpdating && (
          <div className="absolute bottom-0 left-0 w-full h-1 bg-black/20 overflow-hidden">
            <div 
              className={`h-full ${isPaused ? 'bg-amber-400' : 'bg-cyan-400'} transition-all duration-300 shadow-[0_0_10px_rgba(34,211,238,0.8)]`} 
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </header>

      {/* --- Batch Update Progress Info (Sticky below header) --- */}
      {isUpdating && (
        <div className="bg-[#0b0f19]/90 backdrop-blur-md border-b border-cyan-900/30 px-10 py-2 flex items-center justify-between z-30 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-4 min-w-0">
            <div className={`flex items-center gap-2 px-3 py-1 ${isPaused ? 'bg-amber-500/10 border-amber-500/20' : 'bg-cyan-500/10 border-cyan-500/20'} rounded-lg border`}>
              {isPaused ? (
                <Pause className="size-3 text-amber-400" />
              ) : (
                <RefreshCw className="size-3 text-cyan-400 animate-spin" />
              )}
              <span className={`text-[10px] font-black ${isPaused ? 'text-amber-400' : 'text-cyan-400'} uppercase tracking-widest`}>
                {isPaused ? 'Paused' : 'Checking Updates'}
              </span>
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <ArrowRight className="size-3 text-[#4b5563]" />
              <span className="text-xs font-bold text-white truncate max-w-md">{updateStatus.name}</span>
              <span className="text-[10px] font-medium text-[#9ca3af] italic truncate">
                {isPaused ? '(일시정지됨)' : updateStatus.task}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-6 shrink-0">
             <div className="flex items-center gap-2 border-r border-[#374151] pr-6">
                <Tooltip position="bottom" content={isPaused ? "재개" : "일시정지"}>
                  <button 
                    onClick={isPaused ? resumeBatchUpdate : pauseBatchUpdate}
                    className={`p-2 rounded-lg transition-all ${isPaused ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30' : 'bg-amber-600/20 text-amber-400 hover:bg-amber-600/30'}`}
                  >
                    {isPaused ? <Play className="size-5" /> : <Pause className="size-5" />}
                  </button>
                </Tooltip>
                <Tooltip position="bottom" content="중단">
                  <button 
                    onClick={cancelBatchUpdate}
                    className="p-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-lg transition-all"
                  >
                    <XCircle className="size-5" />
                  </button>
                </Tooltip>
             </div>
             <div className="text-right">
                <span className={`text-sm font-black ${isPaused ? 'text-amber-400' : 'text-cyan-400'} font-mono`}>{progressPercent}%</span>
                <span className="text-[10px] font-bold text-[#4b5563] ml-2 uppercase tracking-tighter">{updateStatus.current} / {updateStatus.total}</span>
              </div>
          </div>
        </div>
      )}
    </>
  );
};
