// src/Dashboard/JinwooriView.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import MachineButton from "./MachineButton";
import type { SlotRow } from "./DashboardHandler";

const TILE_W = "w-[220px]";
const TILE_H = "h-[120px]";
const GAP = "gap-6";
const pulseRing = "ring-4 ring-indigo-400 ring-offset-2 animate-pulse";

const LS = {
  SELECTED_SITE: "selected_site",
  SELECTED_LINE: "selected_line",
  SELECTED_SLOT: "selected_slot",
  SELECTED_ID: "selected_machine_id",
  SELECTED_IS_EMPTY: "selected_machine_is_empty",
  SELECTED_AT: "selected_machine_saved_at",
  INTENT: "machine_info_intent",
} as const;

type InfoIntent = {
  machineId: string;
  fields: { progressEmpty: boolean; shipDateEmpty: boolean; managerEmpty: boolean };
  values: {
    progress: number | null;
    shipDate: string | null;
    manager: string | null;
    customer?: string | null;
    serialNumber?: string | null;
    note?: string | null;
    status?: string | null;
  };
  hasAnyEmpty: boolean;
  setAt: string;
  origin: "dashboard";
  version: 1;
};

function buildIntentFromRow(row: SlotRow): InfoIntent {
  const p = Number.isFinite(row.progress as any) ? (row.progress as number) : NaN;
  const progressEmpty = !Number.isFinite(p);
  const shipDateEmpty = !row.shipping_date || String(row.shipping_date).trim().length === 0;
  const managerEmpty = !row.manager || String(row.manager).trim().length === 0;

  return {
    machineId: (row.machine_id ?? "").trim(),
    fields: { progressEmpty, shipDateEmpty, managerEmpty },
    values: {
      progress: !progressEmpty ? p : null,
      shipDate: (row.shipping_date as any) ?? null,
      manager: row.manager ?? null,
      customer: (row as any).customer ?? null,
      serialNumber: (row as any).serial_number ?? null,
      note: (row as any).note ?? null,
      status: (row as any).status ?? null,
    },
    hasAnyEmpty: progressEmpty || shipDateEmpty || managerEmpty,
    setAt: new Date().toISOString(),
    origin: "dashboard",
    version: 1 as const,
  };
}

function storeIntent(intent: InfoIntent) {
  try {
    localStorage.setItem(LS.INTENT, JSON.stringify(intent));
  } catch {}
  (window as any).__MACHINE_INFO_INTENT__ = intent;
}

export default function JinwooriView({
  rows,
  highlightedKey,
  onShipped,
  siteLabel = "진우리",
}: {
  rows: SlotRow[];
  highlightedKey: string | null; // ✅ 진우리는 machine_id로 하이라이트
  onShipped?: (slotCode: string) => void;
  siteLabel?: string;
}) {
  const navigate = useNavigate();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const onToggleMenu = useCallback((posCode: string) => {
    setOpenMenuId((cur) => (cur === posCode ? null : posCode));
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest?.("[data-menu-root='1']") || el.closest?.("[data-card-root='1']")) return;
      setOpenMenuId(null);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  // ✅ slot_code가 전부 1 같은 환경이라, 진우리는 machine_id 기준으로 정렬해 “순서대로 채움”
  const ordered = useMemo(() => {
    const arr = [...rows].filter((r) => String(r.machine_id ?? "").trim().length > 0);
    arr.sort((a, b) => String(a.machine_id ?? "").localeCompare(String(b.machine_id ?? ""), "ko"));
    return arr;
  }, [rows]);

  const COLS = 7;
  const ROWS =10; // 필요시 10으로 바꾸면 70칸(7x10)
  const TOTAL = COLS * ROWS;

  const lineLabel = "진우리";

  const setSelectedCommon = (slotForUi: string, machineId?: string) => {
    try {
      localStorage.setItem(LS.SELECTED_SITE, siteLabel);
      localStorage.setItem(LS.SELECTED_LINE, lineLabel);
      localStorage.setItem(LS.SELECTED_SLOT, slotForUi);

      if (machineId && machineId.trim()) {
        localStorage.setItem(LS.SELECTED_IS_EMPTY, "0");
        localStorage.setItem(LS.SELECTED_ID, machineId.trim());
        localStorage.setItem(LS.SELECTED_AT, new Date().toISOString());
      } else {
        localStorage.setItem(LS.SELECTED_IS_EMPTY, "1");
        localStorage.removeItem(LS.SELECTED_ID);
        localStorage.removeItem(LS.INTENT);
      }
    } catch {}
  };

  const goEquipmentForm = (mode: "create" | "edit", posCode: string, machineId?: string) => {
    setSelectedCommon(posCode, machineId);
    const qs = new URLSearchParams({ mode, site: siteLabel, line: lineLabel, slot: posCode });
    if (machineId && machineId.trim()) qs.set("machine", machineId.trim());
    navigate(`/equipment?${qs.toString()}`);
  };

  const goInfoCreate = (posCode: string) => goEquipmentForm("create", posCode);

  const goInfoEdit = (posCode: string, machineId: string, row: SlotRow) => {
    storeIntent(buildIntentFromRow(row));
    goEquipmentForm("edit", posCode, machineId);
  };

  // ✅ 체크리스트 이동 활성화
  const goChecklist = (posCode: string, machineId: string) => {
    setSelectedCommon(posCode, machineId);
    navigate(`/progress-checklist?machine_id=${encodeURIComponent(machineId.trim())}`);
  };

  // ✅ 장비이동(라인이동) 이동 활성화
  const goMove = (posCode: string, machineId: string) => {
    setSelectedCommon(posCode, machineId);
    const qs = new URLSearchParams({
      machine_id: machineId.trim(),
      site: siteLabel,
      line: lineLabel,
      slot: posCode, // ✅ 진우리는 가상 슬롯(JINxx)로 전달 (구분 가능)
    });
    navigate(`/machine-move?${qs.toString()}`);
  };

  const gridRows = useMemo(() => {
    const arr: Array<{ posCode: string; row: SlotRow | null }> = [];
    for (let i = 0; i < TOTAL; i++) {
      const posCode = `JIN${i + 1}`; // 화면상 위치(가상 슬롯)
      arr.push({ posCode, row: ordered[i] ?? null });
    }
    return arr;
  }, [TOTAL, ordered]);

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <span className="inline-block rounded-full bg-blue-600 px-2 py-0.5 text-white">1–49%</span>
        <span className="inline-block rounded-full bg-amber-500 px-2 py-0.5 text-white">50–99%</span>
        <span className="inline-block rounded-full bg-green-600 px-2 py-0.5 text-white">100% (출하 준비)</span>
        <span className="inline-block rounded-full bg-gray-300 px-2 py-0.5 text-gray-700">빈 슬롯</span>
      </div>

      <div className="overflow-x-auto">
        <div className={`grid grid-cols-7 ${GAP}`}>
          {gridRows.map(({ posCode, row }) => {
            const label = posCode.toLowerCase();
            const baseTile = `rounded-2xl shadow-md ${TILE_W} ${TILE_H}`;

            // 빈 슬롯(클릭 → 장비 정보 입력)
            if (!row || !row.machine_id) {
              return (
                <div key={posCode} className="flex flex-col items-center">
                  <div className="mb-2 text-xs font-medium text-slate-500">{label}</div>
                  <button
                    type="button"
                    onClick={() => goInfoCreate(posCode)}
                    className={`${baseTile} bg-slate-100 flex items-center justify-center hover:ring-2 hover:ring-indigo-300`}
                    title="장비 정보 입력으로 이동"
                  >
                    <span className="text-xs text-slate-400">빈 슬롯</span>
                  </button>
                </div>
              );
            }

            const machineId = String(row.machine_id).trim();
            const isOpen = openMenuId === posCode;
            const isHighlight = highlightedKey ? highlightedKey === machineId : false;

            return (
              <div key={posCode} className="flex flex-col items-center">
                <div className="mb-2 text-xs font-medium text-slate-500">{label}</div>

                <div className={isHighlight ? pulseRing : ""}>
                  <MachineButton
                    title={machineId}
                    progress={row.progress ?? 0}
                    shipDate={row.shipping_date ?? null}
                    manager={row.manager ?? null}
                    slotCode={posCode} // ✅ 진우리에서는 가상 슬롯코드 사용
                    sizeClass={`${TILE_W} ${TILE_H}`}
                    isOpen={isOpen}
                    onToggleMenu={() => onToggleMenu(posCode)}
                    onOpenInfo={() => goInfoEdit(posCode, machineId, row)}
                    onOpenChecklist={(mid) => goChecklist(posCode, mid)} // ✅ 활성화
                    onOpenMove={(mid) => goMove(posCode, mid)} // ✅ 활성화
                    onShipped={onShipped}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
