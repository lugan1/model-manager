import { Search, Layers, Box, Sparkles, RefreshCw, Settings, EyeOff, Copy, ArrowUpAz, Database, Clock, ScrollText } from "lucide-react";
import { useSettings } from "../../contexts/SettingsContext";
import { useFilter } from "../../contexts/FilterContext";
import { useModelContext } from "../../contexts/ModelContext";
import { useErrorLogs } from "../../hooks/useErrorLogs";
import { useBatchUpdate } from "../../hooks/useBatchUpdate";
import { Tooltip } from "../ui/Tooltip";

interface HeaderProps {
  onShowSettings: () => void;
  onShowLogs: () => void;
}

export const Header = ({ onShowSettings, onShowLogs }: HeaderProps) => {
  const { activeTab, setActiveTab, searchTerm, setSearchTerm, sortBy, setSortBy, sortOrder, setSortOrder, showOnlyOutdated, setShowOnlyOutdated, showOnlyDuplicates, setShowOnlyDuplicates } = useFilter();
  const { models, scanFolder } = useModelContext();
  const { logs, addLog } = useErrorLogs();
  const { isUpdating, updateLatestVersionsInParallel } = useBatchUpdate(addLog);

  const handleRefresh = async (checkUpdates = false, forceRefresh = false) => {
    if (checkUpdates) {
      await updateLatestVersionsInParallel(models, forceRefresh);
    } else {
      await scanFolder();
    }
  };

  return (
    <header className="h-24 bg-[#1f2937] border-b-2 border-[#374151] px-10 flex items-center justify-between z-30 flex-shrink-0">
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
            className="relative p-3.5 bg-[#1f2937] hover:bg-[#374151] border-2 border-[#374151] rounded-2xl text-white transition-all active:scale-95"
          >
            <ScrollText className="size-6" />
            {logs.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full border-2 border-[#1f2937] min-w-[20px] text-center">
                {logs.length}
              </span>
            )}
          </button>
        </Tooltip>
        <Tooltip position="bottom" content="최신 정보 확인 (Shift + 클릭: 강제 새로고침)">
          <button 
            onClick={(e) => handleRefresh(true, e.shiftKey)} 
            disabled={isUpdating}
            className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-3.5 rounded-2xl font-black text-lg flex items-center gap-3 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-wait whitespace-nowrap"
          >
            <RefreshCw className={`size-6 ${isUpdating ? 'animate-spin' : ''}`} />
            {isUpdating ? '확인 중...' : '업데이트 확인'}
          </button>
        </Tooltip>
        <Tooltip position="bottom" content="저장소 새로고침 (로컬 스캔)">
          <button 
            onClick={() => handleRefresh(false)} 
            disabled={isUpdating}
            className="bg-[#ff9a00] hover:bg-[#e68a00] text-[#0b0f19] px-6 py-3.5 rounded-2xl font-black text-lg flex items-center gap-3 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <RefreshCw className="size-6" /> 새로고침
          </button>
        </Tooltip>
        <Tooltip position="bottom" content="설정 (경로 및 API 키)">
          <button 
            onClick={onShowSettings} 
            className="p-3.5 bg-[#1f2937] hover:bg-[#374151] border-2 border-[#374151] rounded-2xl text-white"
          >
            <Settings className="size-8" />
          </button>
        </Tooltip>
      </div>
    </header>
  );
};
