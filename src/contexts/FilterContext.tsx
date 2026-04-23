import React, { createContext, useContext, useState, useDeferredValue, useEffect } from "react";
import { ModelType } from "../types";

type SortBy = "name" | "size" | "modified";
type SortOrder = "asc" | "desc";

interface FilterContextType {
  activeTab: ModelType;
  setActiveTab: (tab: ModelType) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  deferredSearchTerm: string;
  sortBy: SortBy;
  setSortBy: (sort: SortBy) => void;
  sortOrder: SortOrder;
  setSortOrder: (order: SortOrder) => void;
  showOnlyOutdated: boolean;
  setShowOnlyOutdated: (val: boolean) => void;
  showOnlyDuplicates: boolean;
  setShowOnlyDuplicates: (val: boolean) => void;
  filterMonths: number;
  setFilterMonths: (val: number) => void;
  selectedDirPath: string | null;
  setSelectedDirPath: (path: string | null) => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export const FilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTabState] = useState<ModelType>(() => (localStorage.getItem("active_tab") as ModelType) || "checkpoint");
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [sortBy, setSortByState] = useState<SortBy>(() => (localStorage.getItem("sort_by") as any) || "modified");
  const [sortOrder, setSortOrderState] = useState<SortOrder>(() => (localStorage.getItem("sort_order") as any) || "desc");
  const [showOnlyOutdated, setShowOnlyOutdated] = useState(false);
  const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false);
  const [filterMonths, setFilterMonths] = useState(6);
  
  // 초기 로딩 시 활성 탭의 스캔 경로를 디폴트로 설정
  const [selectedDirPath, setSelectedDirPath] = useState<string | null>(() => {
    const tab = (localStorage.getItem("active_tab") as ModelType) || "checkpoint";
    return localStorage.getItem(`${tab}_scan_path`) || null;
  });

  const setActiveTab = (tab: ModelType) => {
    setActiveTabState(tab);
    localStorage.setItem("active_tab", tab);
    
    // 탭 변경 시 즉시 해당 탭의 경로로 업데이트하여 'No Models' 노출 시간 최소화
    const scanPath = localStorage.getItem(`${tab}_scan_path`);
    setSelectedDirPath(scanPath || null);
  };

  const setSortBy = (sort: SortBy) => {
    setSortByState(sort);
    localStorage.setItem("sort_by", sort);
  };

  const setSortOrder = (order: SortOrder) => {
    setSortOrderState(order);
    localStorage.setItem("sort_order", order);
  };

  return (
    <FilterContext.Provider value={{
      activeTab, setActiveTab,
      searchTerm, setSearchTerm, deferredSearchTerm,
      sortBy, setSortBy,
      sortOrder, setSortOrder,
      showOnlyOutdated, setShowOnlyOutdated,
      showOnlyDuplicates, setShowOnlyDuplicates,
      filterMonths, setFilterMonths,
      selectedDirPath, setSelectedDirPath
    }}>
      {children}
    </FilterContext.Provider>
  );
};

export const useFilter = () => {
  const context = useContext(FilterContext);
  if (context === undefined) {
    throw new Error("useFilter must be used within a FilterProvider");
  }
  return context;
};
