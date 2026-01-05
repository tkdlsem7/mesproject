// App.tsx
import React from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

import LoginForm from "./Login/Login_function";
import MainPage from "./Main/MainPage";
import OptionConfigPage from "./Option/OptionConfigPage";
import ModifyOptionsPage from "./Option/ModifyOptionsPage";
import DashboardMain from "./Dashboard/DashboardMain";
import EquipmentInfoPage from "./Equipment Information/EquipmentInfoPage";
import ProgressChecklistPage from "./Progress Checklist/ProgressChecklistPage";
import MoveEquipmentPage from "./MachineMoving/MoveEquipmentPage";
import TroubleShootPage from "./Troubleshoot/TroubleShootPage";
import SetupDefectEntryPages from "./SetupDefectEntryPage/SetupDefectEntryPage";

import BoardPage from "./Board/Boardpage";
import BoardNewPage from "./Board/BoardNewPage";
import BoardEditPage from "./Board/BoardEditPage";
import BoardDetailPage from "./Board/BoardDetailPage";

import LogTableBrowser from "./logtable/LogTableBrowser";
import LogChartPage from "./LogChart/LogChartPage";
import EquipmentGanttPage from "./Calender/EquipmentGanttPage";

// ✅ 추가: 캘린더 라우트용 페이지 import
import EquipmentCalendarPage from "./Calender/EquipmentCalendarPage";
import CalendarExcelUploadPage from "./Calender/ScheduleExcelUploadPage";

// ✅ 토큰만 확인하는 최소 가드
const RequireAuth: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const token = localStorage.getItem("access_token");
  const location = useLocation();
  if (!token) {
    return <Navigate to={`/?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return children;
};

const getUserName = () => {
  const n = localStorage.getItem("user_name");
  return n && n.trim() ? n : "조성국";
};

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginForm />} />
      <Route path="/main" element={<MainPage userName={getUserName()} />} />

      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <DashboardMain />
          </RequireAuth>
        }
      />

      <Route
        path="/options"
        element={
          <RequireAuth>
            <OptionConfigPage />
          </RequireAuth>
        }
      />
      <Route
        path="/options/modify/:id"
        element={
          <RequireAuth>
            <ModifyOptionsPage />
          </RequireAuth>
        }
      />

      <Route path="/equipment" element={<EquipmentInfoPage />} />
      <Route path="/progress-checklist" element={<ProgressChecklistPage />} />
      <Route path="/machine-move" element={<MoveEquipmentPage />} />
      <Route path="/troubleshoot" element={<TroubleShootPage />} />
      <Route path="/SetupDefectEntryPage" element={<SetupDefectEntryPages />} />

      <Route path="/board" element={<BoardPage />} />
      <Route path="/board/:no" element={<BoardDetailPage />} />
      <Route path="/logs/table" element={<LogTableBrowser />} />
      <Route path="/log/charts" element={<LogChartPage />} />
      <Route path="/gantt" element={<EquipmentGanttPage />} />

      <Route
        path="/board/new"
        element={
          <RequireAuth>
            <BoardNewPage />
          </RequireAuth>
        }
      />
      <Route
        path="/board/:no/edit"
        element={
          <RequireAuth>
            <BoardEditPage />
          </RequireAuth>
        }
      />

      {/* ✅ 추가: 캘린더 + 업로드 라우트 */}
      <Route
        path="/calendar"
        element={
          <RequireAuth>
            <EquipmentCalendarPage />
          </RequireAuth>
        }
      />
      <Route
        path="/calendar/upload"
        element={
          <RequireAuth>
            <CalendarExcelUploadPage />
          </RequireAuth>
        }
      />

      <Route path="/BoardPage" element={<Navigate to="/board" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
