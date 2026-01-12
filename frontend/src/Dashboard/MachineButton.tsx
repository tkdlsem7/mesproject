// src/Dashboard/MachineButton.tsx
import React from "react";
import { shipEquipment } from "./DashboardHandler";

const colorByProgress = (p: number) => {
  if (p >= 100) return "bg-green-600 text-white";
  if (p >= 50) return "bg-amber-500 text-white";
  if (p > 0) return "bg-blue-600 text-white";
  return "bg-gray-300 text-gray-700";
};

const LS = {
  SELECTED_IS_EMPTY: "selected_machine_is_empty",
  SELECTED_ID: "selected_machine_id",
  SELECTED_AT: "selected_machine_saved_at",
  INTENT: "machine_info_intent",
} as const;

// 로그인에서 저장해둔 auth (권한) 키 (프로젝트에서 쓰는 키에 맞추세요)
const LS_AUTH = "user_auth";

const EMPTY_MARKERS = new Set(["", "-", "empty", "빈슬롯"]);

type InfoIntent = {
  machineId: string;
  fields: { progressEmpty: boolean; shipDateEmpty: boolean; managerEmpty: boolean };
  values: { progress: number | null; shipDate: string | null; manager: string | null };
  hasAnyEmpty: boolean;
  setAt: string;
  origin: "dashboard";
  version: 1;
};

type Props = {
  title: string;
  progress: number;
  shipDate?: string | Date | null;
  manager?: string | null;
  slotCode: string;
  sizeClass?: string;
  className?: string;

  /** 외부에서 auth를 내려줄 수도 있게(선택) */
  userAuth?: number | null;

  isOpen?: boolean;
  onToggleMenu?: () => void;
  onOpenInfo?: () => void;
  onOpenChecklist?: (machineId: string) => void;
  onOpenMove?: (machineId: string) => void;
  onShipped?: (slotCode: string) => void;
};

function safeParseAuth(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function pickAuthFromJwt(tokenRaw: string | null): number | null {
  if (!tokenRaw) return null;
  try {
    const token = tokenRaw.startsWith("Bearer ") ? tokenRaw.slice(7) : tokenRaw;
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;

    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));

    const v =
      payload?.auth ??
      payload?.user_auth ??
      payload?.role ??
      payload?.permission ??
      null;

    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export default function MachineButton({
  title,
  progress,
  shipDate,
  manager,
  slotCode,
  sizeClass = "w-[220px] h-[120px]",
  className = "",
  userAuth,

  isOpen,
  onToggleMenu,
  onOpenInfo,
  onOpenChecklist,
  onOpenMove,
  onShipped,
}: Props) {
  const [openLocal, setOpenLocal] = React.useState(false);
  const open = typeof isOpen === "boolean" ? isOpen : openLocal;

  const toggle = () =>
    typeof isOpen === "boolean" ? onToggleMenu?.() : setOpenLocal((v) => !v);

  const lastToken = React.useMemo(() => {
    const raw = title ?? "";
    const parts = raw.split(/[/|>]/);
    const tail = parts[parts.length - 1] ?? "";
    return tail.trim().toLowerCase();
  }, [title]);

  const isEmptyMachine = React.useMemo(() => EMPTY_MARKERS.has(lastToken), [lastToken]);

  const shipDateText = React.useMemo(() => {
    if (!shipDate) return "-";
    if (shipDate instanceof Date) return shipDate.toISOString().slice(0, 10);
    return String(shipDate);
  }, [shipDate]);

  const resolvedAuth = React.useMemo(() => {
    if (typeof userAuth === "number" && Number.isFinite(userAuth)) return userAuth;

    const fromStorage =
      safeParseAuth(localStorage.getItem(LS_AUTH)) ??
      safeParseAuth(sessionStorage.getItem(LS_AUTH));

    if (fromStorage !== null) return fromStorage;

    // 혹시 토큰 payload에 auth가 들어있으면 그걸로도 폴백
    const tokenRaw = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    const fromJwt = pickAuthFromJwt(tokenRaw);
    return fromJwt; // null일 수도 있음
  }, [userAuth]);

  /** 이벤트 전파 차단(부모 navigate 방지용) */
  const stopAll = (e: any) => {
    try {
      e.preventDefault?.();
      e.stopPropagation?.();
    } catch {}
  };

  const handleClick = (e: React.MouseEvent) => {
    // 부모에서 mousedown/click로 navigate를 걸었을 가능성 때문에 최대한 차단
    stopAll(e);

    // 1) 빈 슬롯은 누구든 메뉴/이동 불가
    if (isEmptyMachine) {
      window.alert("빈 슬롯입니다.");
      return;
    }

    // 2) 권한 확인이 안 되면(=auth가 없으면) 보수적으로 차단
    if (resolvedAuth === null) {
      window.alert("권한 정보를 확인할 수 없습니다. 다시 로그인해 주세요.");
      return;
    }

    // 3) auth < 1 이면 메뉴 자체를 열지 않음 + alert 1번
    if (resolvedAuth < 1) {
      window.alert("권한이 부족합니다.");
      return;
    }

    // ✅ 여기까지 왔으면 정상적으로 메뉴 토글
    toggle();
  };

  const buildInfoIntent = (): InfoIntent => {
    const progressEmpty = !Number.isFinite(progress);
    const shipDateEmpty = shipDateText === "-";
    const managerEmpty = !manager || manager.trim().length === 0;

    return {
      machineId: title ?? "",
      fields: { progressEmpty, shipDateEmpty, managerEmpty },
      values: {
        progress: Number.isFinite(progress) ? progress : null,
        shipDate: shipDateEmpty ? null : shipDateText,
        manager: manager ?? null,
      },
      hasAnyEmpty: progressEmpty || shipDateEmpty || managerEmpty,
      setAt: new Date().toISOString(),
      origin: "dashboard",
      version: 1,
    };
  };

  const storeSelection = (machineId: string) => {
    try {
      localStorage.setItem(LS.SELECTED_IS_EMPTY, "0");
      localStorage.setItem(LS.SELECTED_ID, machineId);
      localStorage.setItem(LS.SELECTED_AT, new Date().toISOString());
    } catch {}
  };

  const storeInfoIntent = (intent: InfoIntent) => {
    try {
      localStorage.setItem(LS.INTENT, JSON.stringify(intent));
    } catch {}
    (window as any).__MACHINE_INFO_INTENT__ = intent;
  };

  const guardMenuAction = (): boolean => {
    // 메뉴 버튼을 눌렀을 때도 안전하게 2중 방어
    if (isEmptyMachine) {
      window.alert("빈 슬롯입니다.");
      return false;
    }
    if (resolvedAuth === null) {
      window.alert("권한 정보를 확인할 수 없습니다. 다시 로그인해 주세요.");
      return false;
    }
    if (resolvedAuth < 1) {
      window.alert("권한이 부족합니다.");
      return false;
    }
    return true;
  };

  const handleOpenInfo = () => {
    if (!guardMenuAction()) return;
    try {
      storeSelection(title);
      storeInfoIntent(buildInfoIntent());
    } catch {}
    onOpenInfo?.();
  };

  const handleOpenChecklist = () => {
    if (!guardMenuAction()) return;
    try {
      storeSelection(title);
    } catch {}
    onOpenChecklist?.(title);
  };

  const handleOpenMove = () => {
    if (!guardMenuAction()) return;
    try {
      storeSelection(title);
    } catch {}
    onOpenMove?.(title);
  };

  const handleShip = async () => {
    if (!guardMenuAction()) return;

    // eslint-disable-next-line no-alert
    const ok =
      typeof window !== "undefined" &&
      window.confirm(`[${slotCode}] 슬롯의 ${title} 장비를 출하 처리할까요?`);
    if (!ok) return;

    try {
      await shipEquipment(slotCode);
      alert("출하 처리 완료!");
      setOpenLocal(false);
      onShipped?.(slotCode);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "출하 처리 중 오류가 발생했습니다.");
    }
  };

  const menuItems = [
    { label: "🛠 장비 정보 입력", onClick: handleOpenInfo },
    { label: "✅ 체크리스트", onClick: handleOpenChecklist },
    { label: "🔁 장비 이동", onClick: handleOpenMove },
    { label: "🚚 출하 처리", onClick: handleShip },
  ];

  return (
    <div
      data-card-root="1"
      className={`relative ${sizeClass} rounded-2xl px-4 py-3 shadow-md ${colorByProgress(
        progress
      )} ${className}`}
      title="메뉴 보기"
      // ✅ 부모가 onMouseDown으로 navigate 걸어도 최대한 막기
      onMouseDown={stopAll}
      onPointerDown={stopAll}
      onClick={handleClick}
    >
      <div className="text-base sm:text-lg font-extrabold leading-6">{title || "-"}</div>

      <div className="mt-1 text-[12px] sm:text-[13px] leading-5 opacity-95">
        <div>진척도: {Number.isFinite(progress) ? `${progress}%` : "-"}</div>
        <div>
          출하: {shipDateText}
          {Number.isFinite(progress) && progress >= 100 && (
            <span className="ml-2 rounded bg-white/20 px-1.5 py-[1px] text-[10px]">
              출하 준비됨
            </span>
          )}
        </div>
        <div>담당: {manager ?? "-"}</div>
      </div>

      {open && (
        <div
          data-menu-root="1"
          className="absolute left-0 top-full z-50 mt-2 w-[220px] rounded-2xl border bg-white p-2 text-slate-800 shadow-2xl"
          onMouseDown={stopAll}
          onPointerDown={stopAll}
          onClick={(ev) => ev.stopPropagation()}
        >
          {menuItems.map((mi) => (
            <button
              key={mi.label}
              type="button"
              onMouseDown={stopAll}
              onPointerDown={stopAll}
              onClick={(ev) => {
                ev.stopPropagation();
                mi.onClick();
              }}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-[15px] hover:bg-slate-50"
            >
              {mi.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
