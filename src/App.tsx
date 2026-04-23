import { useEffect } from "react";
import { useModelContext } from "./contexts/ModelContext";
import { useFilter } from "./contexts/FilterContext";
import { useSettings } from "./contexts/SettingsContext";
import { MainLayout } from "./components/layout/MainLayout";

function App() {
  const { scanFolder } = useModelContext();
  const { activeTab } = useFilter();
  const { paths } = useSettings();

  // 초기 스캔 및 탭 변경 시 스캔
  useEffect(() => {
    if (paths[activeTab].scan) {
      scanFolder().then(r => r);
    }
  }, [activeTab, paths, scanFolder]);

  return <MainLayout />;
}

export default App;
