import React from "react";
import { useNavigate } from "react-router-dom";
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

  // ✅ 장비정보 페이지에서 slot/site를 읽는 키들
  SELECTED_SLOT: "selected_slot",
  SELECTED_SITE: "selected_site",

  INTENT: "machine_info_intent",
} as const;

const LS_AUTH = "user_auth";
const EMPTY_MARKERS = new Set(["", "-", "empty", "빈슬롯"]);

type InfoIntentV2 = {
  machineId: string;
  slotCode: string | null;
  site: string | null;
  values: {
    progress: number | null;
    shipDate: string | null;
    manager: string | null;
    customer: string | null;
    serialNumber: string | null;
    chillerSerialNumber: string | null; // ✅ 핵심(장비정보 페이지에서 쓰기 쉽게 camelCase)
    note: string | null;
    status: "가능" | "불가능" | null;
  };
  setAt: string;
  origin: "dashboard";
  version: 2;
};

type Props = {
  title: string;
  progress: number;
  shipDate?: string | Date | null;
  manager?: string | null;
  slotCode: string;
  sizeClass?: string;
  className?: string;

  userAuth?: number | null;

  isOpen?: boolean;
  onToggleMenu?: () => void;
  onOpenInfo?: () => void;
  onOpenChecklist?: (machineId: string) => void;
  onOpenMove?: (machineId: string) => void;
  onOpenRowdata?: (machineId: string) => void;

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

const authHeaders = (): Record<string, string> => {
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// ✅ /api 우선 + 폴백 URL들로 detail 조회
async function fetchEquipmentDetailBySlot(site: string | null, slotCode: string) {
  const s = (site ?? "").trim();
  const sc = (slotCode ?? "").trim().toUpperCase();
  const qs = new URLSearchParams({
    site: s,
    slot_code: sc,
  }).toString();

  const path = `/dashboard/equipment/detail?${qs}`;
  const candidates = Array.from(
    new Set([
      `/api${path}`, // 1순위
      path,          // 리버스 프록시 환경 폴백
    ])
  );

  for (let i = 0; i < candidates.length; i += 1) {
    const url = candidates[i];
    try {
      const res = await fetch(url, {
        credentials: "include",
        headers: { ...authHeaders() },
      });
      if (res.ok) return await res.json();
      if (res.status !== 404) return null;
    } catch {
      // ignore and try next
    }
  }
  return null;
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
  onOpenRowdata,
  onShipped,
}: Props) {
  const navigate = useNavigate();

  const [openLocal, setOpenLocal] = React.useState(false);
  const open = typeof isOpen === "boolean" ? isOpen : openLocal;

  const toggle = () =>
    typeof isOpen === "boolean" ? onToggleMenu?.() : setOpenLocal((v) => !v);

  const closeMenu = () => {
    if (typeof isOpen === "boolean") onToggleMenu?.();
    else setOpenLocal(false);
  };

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

    const tokenRaw = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    return pickAuthFromJwt(tokenRaw);
  }, [userAuth]);

  const stopAll = (e: any) => {
    try {
      e.preventDefault?.();
      e.stopPropagation?.();
    } catch {}
  };

  const guardMenuAction = (): boolean => {
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

  const storeSelection = (machineId: string) => {
    try {
      localStorage.setItem(LS.SELECTED_IS_EMPTY, "0");
      localStorage.setItem(LS.SELECTED_ID, machineId);
      localStorage.setItem(LS.SELECTED_AT, new Date().toISOString());

      // ✅ 추가: 장비정보 페이지가 slot/site로 진입할 수 있게 저장
      localStorage.setItem(LS.SELECTED_SLOT, String(slotCode ?? "").toUpperCase());

      // site는 DashboardMain이 계속 덮어쓰고 있지만, 혹시 없으면 현재값 유지
      const curSite = localStorage.getItem(LS.SELECTED_SITE);
      if (!curSite) localStorage.setItem(LS.SELECTED_SITE, "");
    } catch {}
  };

  const buildBaseIntent = (): InfoIntentV2 => {
    return {
      machineId: title ?? "",
      slotCode: String(slotCode ?? "").toUpperCase(),
      site: (localStorage.getItem(LS.SELECTED_SITE) ?? "").trim() || null,
      values: {
        progress: Number.isFinite(progress) ? progress : null,
        shipDate: shipDateText === "-" ? null : shipDateText,
        manager: manager ?? null,
        customer: null,
        serialNumber: null,
        chillerSerialNumber: null,
        note: null,
        status: null,
      },
      setAt: new Date().toISOString(),
      origin: "dashboard",
      version: 2,
    };
  };

  const storeInfoIntent = (intent: InfoIntentV2) => {
    try {
      localStorage.setItem(LS.INTENT, JSON.stringify(intent));
    } catch {}
    (window as any).__MACHINE_INFO_INTENT__ = intent;
  };

  const handleClick = (e: React.MouseEvent) => {
    stopAll(e);
    if (isEmptyMachine) {
      window.alert("빈 슬롯입니다.");
      return;
    }
    if (resolvedAuth === null) {
      window.alert("권한 정보를 확인할 수 없습니다. 다시 로그인해 주세요.");
      return;
    }
    if (resolvedAuth < 1) {
      window.alert("권한이 부족합니다.");
      return;
    }
    toggle();
  };

  const handleOpenInfo = async () => {
    if (!guardMenuAction()) return;

    try {
      storeSelection(title);

      // 1) 우선 기본 intent 저장(즉시 프리필 가능)
      const base = buildBaseIntent();
      storeInfoIntent(base);

      // 2) 서버에서 최신값(특히 chiller_serial_number) 가져와서 intent 보강
      const site = (localStorage.getItem(LS.SELECTED_SITE) ?? "").trim() || null;
      const detail = await fetchEquipmentDetailBySlot(site, slotCode);

      if (detail) {
        const patched: InfoIntentV2 = {
          ...base,
          machineId: String(detail.machine_id ?? base.machineId ?? ""),
          site: String(detail.site ?? base.site ?? "") || null,
          values: {
            ...base.values,
            customer: detail.customer ?? null,
            serialNumber: detail.serial_number ?? null,
            chillerSerialNumber: detail.chiller_serial_number ?? null,
            note: detail.note ?? null,
            status:
              detail.status === "가능" ? "가능" : detail.status === "불가능" ? "불가능" : null,
          },
          setAt: new Date().toISOString(),
        };
        storeInfoIntent(patched);
      }
    } catch {
      // 실패해도 페이지 이동은 진행(최소한 base intent는 저장됨)
    }

    closeMenu();
    onOpenInfo?.();
  };

  const handleOpenChecklist = () => {
    if (!guardMenuAction()) return;
    try {
      storeSelection(title);
    } catch {}
    closeMenu();
    onOpenChecklist?.(title);
  };

  const handleOpenMove = () => {
    if (!guardMenuAction()) return;
    try {
      storeSelection(title);
    } catch {}
    closeMenu();
    onOpenMove?.(title);
  };

  const handleOpenRowdata = () => {
    if (!guardMenuAction()) return;
    try {
      storeSelection(title);
    } catch {}
    closeMenu();
    if (onOpenRowdata) {
      onOpenRowdata(title);
      return;
    }
    navigate("/SetupDefectEntryPage");
  };

  const handleShip = async () => {
    if (!guardMenuAction()) return;

    const ok =
      typeof window !== "undefined" &&
      window.confirm(`[${slotCode}] 슬롯의 ${title} 장비를 출하 처리할까요?`);
    if (!ok) return;

    try {
      await shipEquipment(slotCode);
      alert("출하 처리 완료!");
      closeMenu();
      onShipped?.(slotCode);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "출하 처리 중 오류가 발생했습니다.");
    }
  };

  const menuItems = [
    { label: "🧾 Rowdata 입력", onClick: handleOpenRowdata },
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
