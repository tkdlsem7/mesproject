// src/Dashboard/LineWaitingView.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import MachineButton from "./MachineButton";
import type { SlotRow } from "./DashboardHandler";

// ✅ A동 뷰와 동일한 타일 크기/간격
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

const safeGet = (k: string, def: string) => {
  try {
    const v = localStorage.getItem(k);
    return v && v.trim() ? v : def;
  } catch {
    return def;
  }
};

const WAIT_GROUPS = [
  { prefix: "A" as const },
  { prefix: "B" as const },
  { prefix: "I" as const },
] as const;

function Legend() {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-600">
      <span className="inline-block rounded-full bg-blue-600 px-2 py-0.5 text-white">1–49%</span>
      <span className="inline-block rounded-full bg-amber-500 px-2 py-0.5 text-white">50–99%</span>
      <span className="inline-block rounded-full bg-green-600 px-2 py-0.5 text-white">100% (출하 준비)</span>
      <span className="inline-block rounded-full bg-gray-300 px-2 py-0.5 text-gray-700">빈 슬롯</span>
    </div>
  );
}

type Cell =
  | { kind: "slot"; slotCode: string; label: string }
  | { kind: "divider"; id: string };

export default function LineWaitingView({
  equipMap,
  highlightedSlot,
  onShipped,
  siteLabel: siteLabelProp, // ✅ DashboardMain에서 "라인대기" 같은 값을 넘겨줌
}: {
  equipMap: Map<string, SlotRow>;
  highlightedSlot: string | null;
  onShipped?: (slotCode: string) => void;
  siteLabel?: string; // ✅ 없으면 fallback
}) {
  const navigate = useNavigate();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const onToggleMenu = useCallback((slotCode: string) => {
    setOpenMenuId((cur) => (cur === slotCode ? null : slotCode));
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

  // ✅ 라인대기 화면에서 선택/이동 시 저장될 site/line
  const siteLabel =
    siteLabelProp ?? safeGet(LS.SELECTED_SITE, safeGet("dash_site", "본사"));
  const lineLabel = "라인대기";

  // ✅ 6행 5열 + 그룹 사이 구분선
  // A(1~5), A(6~10), [divider], B(1~5), B(6~10), [divider], I(1~5), I(6~10)
  // ✅ 라벨: a1/a2/... b1/... i1/...
  const cells: Cell[] = useMemo(() => {
    const out: Cell[] = [];

    for (let gi = 0; gi < WAIT_GROUPS.length; gi++) {
      const prefix = WAIT_GROUPS[gi].prefix;

      // 1~5
      for (let n = 1; n <= 5; n++) {
        const slotCode = `${prefix}${n}`; // 데이터 매칭은 대문자 유지
        out.push({ kind: "slot", slotCode, label: slotCode.toLowerCase() });
      }
      // 6~10
      for (let n = 6; n <= 10; n++) {
        const slotCode = `${prefix}${n}`;
        out.push({ kind: "slot", slotCode, label: slotCode.toLowerCase() });
      }

      // 그룹 사이 구분선 (A-B, B-I)
      if (gi < WAIT_GROUPS.length - 1) {
        out.push({ kind: "divider", id: `div-${prefix}-${gi}` });
      }
    }

    return out;
  }, []);

  const goForm = (mode: "create" | "edit", slotCode: string, machineId?: string) => {
    try {
      localStorage.setItem(LS.SELECTED_SITE, siteLabel);
      localStorage.setItem(LS.SELECTED_LINE, lineLabel);
      localStorage.setItem(LS.SELECTED_SLOT, slotCode);

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

    const qs = new URLSearchParams({ mode, site: siteLabel, line: lineLabel, slot: slotCode });
    if (machineId && machineId.trim()) qs.set("machine", machineId.trim());
    navigate(`/equipment?${qs.toString()}`);
  };

  const goInfoCreate = (slotCode: string) => goForm("create", slotCode);

  const goInfoEdit = (slotCode: string, machineId: string) => {
    const row = equipMap.get(slotCode.toUpperCase());
    if (row) storeIntent(buildIntentFromRow(row));
    goForm("edit", slotCode, machineId);
  };

  const goChecklist = (slotCode: string, machineId: string) => {
    try {
      localStorage.setItem(LS.SELECTED_SITE, siteLabel);
      localStorage.setItem(LS.SELECTED_LINE, lineLabel);
      localStorage.setItem(LS.SELECTED_SLOT, slotCode);
      localStorage.setItem(LS.SELECTED_IS_EMPTY, "0");
      localStorage.setItem(LS.SELECTED_ID, machineId.trim());
      localStorage.setItem(LS.SELECTED_AT, new Date().toISOString());
    } catch {}
    navigate(`/progress-checklist?machine_id=${encodeURIComponent(machineId.trim())}`);
  };

  const goMove = (slotCode: string, machineId: string) => {
    try {
      localStorage.setItem(LS.SELECTED_SITE, siteLabel);
      localStorage.setItem(LS.SELECTED_LINE, lineLabel);
      localStorage.setItem(LS.SELECTED_SLOT, slotCode);
      localStorage.setItem(LS.SELECTED_IS_EMPTY, "0");
      localStorage.setItem(LS.SELECTED_ID, machineId.trim());
      localStorage.setItem(LS.SELECTED_AT, new Date().toISOString());
    } catch {}

    const qs = new URLSearchParams({
      machine_id: machineId.trim(),
      site: siteLabel,
      line: lineLabel,
      slot: slotCode,
    });
    navigate(`/machine-move?${qs.toString()}`);
  };

  return (
    <div className="w-full">
      <Legend />

      {/* ✅ 5열 그리드, divider는 col-span-5로 한 줄 */}
      <div className={`grid grid-cols-5 ${GAP}`}>
        {cells.map((cell) => {
          if (cell.kind === "divider") {
            return (
              <div
                key={cell.id}
                className="col-span-5 my-2 border-t border-slate-300"
                aria-hidden="true"
              />
            );
          }

          const { slotCode, label } = cell;
          const row = equipMap.get(slotCode.toUpperCase()) ?? null;
          const isHighlight = !!row && highlightedSlot === row?.slot_code;
          const baseTile = `rounded-2xl shadow-md ${TILE_W} ${TILE_H}`;

          if (row && row.machine_id) {
            const machineId = String(row.machine_id);
            const isOpen = openMenuId === row.slot_code;

            return (
              <div key={slotCode} className="flex flex-col items-center">
                <div className="mb-2 text-xs font-medium text-slate-500">{label}</div>
                <div className={isHighlight ? pulseRing : ""}>
                  <MachineButton
                    title={machineId}
                    progress={row.progress ?? 0}
                    shipDate={row.shipping_date ?? null}
                    manager={row.manager ?? null}
                    slotCode={row.slot_code}
                    sizeClass={`${TILE_W} ${TILE_H}`}
                    isOpen={isOpen}
                    onToggleMenu={() => onToggleMenu(row.slot_code)}
                    onOpenInfo={() => goInfoEdit(row.slot_code, machineId)}
                    onOpenChecklist={(mid) => goChecklist(row.slot_code, mid)}
                    onOpenMove={(mid) => goMove(row.slot_code, mid)}
                    onShipped={onShipped}
                  />
                </div>
              </div>
            );
          }

          // 빈 슬롯
          return (
            <div key={slotCode} className="flex flex-col items-center">
              <div className="mb-2 text-xs font-medium text-slate-500">{label}</div>
              <button
                type="button"
                onClick={() => goInfoCreate(slotCode)}
                className={`${baseTile} bg-slate-100 ${
                  isHighlight ? pulseRing : ""
                } flex items-center justify-center hover:ring-2 hover:ring-indigo-300`}
                title="장비 정보 입력으로 이동"
              >
                <span className="text-xs text-slate-400">빈 슬롯</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
