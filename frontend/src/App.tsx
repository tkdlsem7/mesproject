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
import AttendanceHistoryPage from "./Attendance/AttendanceHistoryPage";
import LineAccessCurrentPage from "./LineAccess/LineAccessCurrentPage";
import LineAccessLogsPage from "./LineAccess/LineAccessLogsPage";
import SetupDefectManagePage from "./SetupDefectEntryPage/SetupDefectManagePage";
import DefectCatalogPage from "./DefectCatalog/DefectCatalogPage";

import BoardPage from "./Board/Boardpage";
import BoardNewPage from "./Board/BoardNewPage";
import BoardEditPage from "./Board/BoardEditPage";
import BoardDetailPage from "./Board/BoardDetailPage";

import LogTableBrowser from "./logtable/LogTableBrowser";
import LogChartPage from "./LogChart/LogChartPage";
import EquipmentGanttPage from "./Calender/EquipmentGanttPage";

import EquipmentCalendarPage from "./Calender/EquipmentCalendarPage";
import CalendarExcelUploadPage from "./Calender/ScheduleExcelUploadPage";

// ✅ 회원정보 수정 페이지 (이미 만들어둔 파일 경로에 맞춰 수정)
import UserEditPage from "./Login/UserEditPage";

// ✅ 토큰만 확인하는 최소 가드
const RequireAuth: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const token =
    localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
  const location = useLocation();

  if (!token) {
    // ✅ 핵심 수정:
    // /account/edit로 가려다 로그인 페이지로 튕겼을 때,
    // redirect=/account/edit 를 붙이면 로그인 직후 다시 /account/edit로 가버림.
    // 그래서 이 경우에는 redirect 파라미터를 붙이지 않음 → 로그인 후 기본(/main)으로 감.
    if (location.pathname === "/account/edit") {
      return <Navigate to="/" replace />;
    }

    return (
      <Navigate
        to={`/?redirect=${encodeURIComponent(location.pathname)}`}
        replace
      />
    );
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
      {/* 로그인 */}
      <Route path="/" element={<LoginForm />} />

      {/* 메인 (원하면 RequireAuth로 감싸도 됨) */}
      <Route path="/main" element={<MainPage userName={getUserName()} />} />

      {/* ✅ 회원정보 수정: 로그인 후 메인에서 버튼 눌러서만 들어가게 유지 */}
      <Route
        path="/account/edit"
        element={
          <RequireAuth>
            <UserEditPage />
          </RequireAuth>
        }
      />

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
      <Route path="/SetupDefectEntryPage/manage" element={<SetupDefectManagePage />} />

      <Route path="/board" element={<BoardPage />} />
      <Route path="/board/:no" element={<BoardDetailPage />} />
      <Route path="/logs/table" element={<LogTableBrowser />} />
      <Route path="/log/charts" element={<LogChartPage />} />
      <Route path="/gantt" element={<EquipmentGanttPage />} />
      <Route path="/line-access/logs" element={<LineAccessLogsPage />} />
      <Route path="/defect-catalog" element={<DefectCatalogPage />} />

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

      <Route
        path="/attendance"
        element={
          <RequireAuth>
            <AttendanceHistoryPage />
          </RequireAuth>
        }
      />

      <Route
        path="/line-access"
        element={
          <RequireAuth>
            <LineAccessCurrentPage />
          </RequireAuth>
        }
      />

      <Route path="/BoardPage" element={<Navigate to="/board" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
