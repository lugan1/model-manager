import { Search, Layers, Box, Sparkles, RefreshCw, Settings, EyeOff, Copy, ArrowUpAz, Database, Clock, ImagePlus, ScrollText } from "lucide-react";
import { ModelType } from "../../types";

interface HeaderProps {
  activeTab: ModelType;
  setActiveTab: (tab: ModelType) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  showOnlyOutdated: boolean;
  setShowOnlyOutdated: (show: boolean) => void;
  showOnlyDuplicates: boolean;
  setShowOnlyDuplicates: (show: boolean) => void;
  sortBy: string;
  setSortBy: (sort: any) => void;
  sortOrder: "asc" | "desc";
  setSortOrder: (order: "asc" | "desc") => void;
  onRefresh: (checkUpdates?: boolean, forceRefresh?: boolean) => void;
  onShowSettings: () => void;
  onShowLogs: () => void;
  logCount: number;
  isUpdating: boolean;
}

export const Header = ({
  activeTab,
  setActiveTab,
  searchTerm,
  setSearchTerm,
  showOnlyOutdated,
  setShowOnlyOutdated,
  showOnlyDuplicates,
  setShowOnlyDuplicates,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  onRefresh,
  onShowSettings,
  onShowLogs,
  logCount,
  isUpdating,
}: HeaderProps) => {
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
            <button
              key={item.id}
              onClick={() => {
                if (sortBy === item.id) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                else { setSortBy(item.id as any); setSortOrder('asc'); }
              }}
              className={`p-2.5 rounded-xl transition-all flex items-center gap-2 ${sortBy === item.id ? "bg-[#ff9a00] text-[#0b0f19]" : "text-[#9ca3af] hover:bg-white/5"}`}
              title={`${item.label} 정렬 (${sortOrder === 'asc' ? '오름차순' : '내림차순'})`}
            >
              <item.icon className="size-5" />
              {sortBy === item.id && <span className="text-xs font-black uppercase">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
            </button>
          ))}
        </div>

        <div className="flex bg-black/40 p-1.5 rounded-2xl border-2 border-[#374151] gap-1 ml-4">
          <button
            onClick={() => setShowOnlyOutdated(!showOnlyOutdated)}
            className={`p-2.5 rounded-xl transition-all flex items-center gap-2 ${showOnlyOutdated ? "bg-[#ef4444] text-white shadow-lg" : "text-[#9ca3af] hover:bg-white/5"}`}
            title="오래된 모델만 보기"
          >
            <EyeOff className="size-5" />
          </button>
          <button
            onClick={() => setShowOnlyDuplicates(!showOnlyDuplicates)}
            className={`p-2.5 rounded-xl transition-all flex items-center gap-2 ${showOnlyDuplicates ? "bg-[#3b82f6] text-white shadow-lg" : "text-[#9ca3af] hover:bg-white/5"}`}
            title="중복 모델만 보기"
          >
            <Copy className="size-5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <button 
          onClick={onShowLogs} 
          title="에러 로그 보기"
          className="relative p-3.5 bg-[#1f2937] hover:bg-[#374151] border-2 border-[#374151] rounded-2xl text-white transition-all active:scale-95"
        >
          <ScrollText className="size-6" />
          {logCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full border-2 border-[#1f2937] min-w-[20px] text-center">
              {logCount}
            </span>
          )}
        </button>
        <button 
          onClick={(e) => onRefresh(true, e.shiftKey)} 
          disabled={isUpdating}
          title="최신 정보 확인 (Shift + 클릭: 24h 캐시 무시하고 강제 새로고침)"
          className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-3.5 rounded-2xl font-black text-lg flex items-center gap-3 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-wait"
        >
          <RefreshCw className={`size-6 ${isUpdating ? 'animate-spin' : ''}`} />
          {isUpdating ? '확인 중...' : '업데이트 확인'}
        </button>
        <button 
          onClick={() => onRefresh(false)} 
          disabled={isUpdating}
          className="bg-[#ff9a00] hover:bg-[#e68a00] text-[#0b0f19] px-6 py-3.5 rounded-2xl font-black text-lg flex items-center gap-3 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <RefreshCw className="size-6" /> 새로고침
        </button>
        <button onClick={onShowSettings} className="p-3.5 bg-[#1f2937] hover:bg-[#374151] border-2 border-[#374151] rounded-2xl text-white">
          <Settings className="size-8" />
        </button>
      </div>
    </header>
  );
};
