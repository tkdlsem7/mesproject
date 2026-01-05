import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import MachineButton from "./MachineButton";
import type { SlotRow } from "./DashboardHandler";

const TILE_W = "w-[240px]";
const TILE_H = "h-[140px]";
const WRAP = "mx-auto max-w-[1100px] px-2 md:px-4";
const GAP = "gap-10 md:gap-12";
const pulseRing = "ring-4 ring-indigo-400 ring-offset-2 animate-pulse";

const LS = {
  SELECTED_SITE: "selected_site",
  SELECTED_LINE: "selected_line",
  SELECTED_SLOT: "selected_slot",
  SELECTED_IS_EMPTY: "selected_machine_is_empty",
  SELECTED_ID: "selected_machine_id",
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

function setForCreate(slot: string, site = "본사", lineLabel = "I동") {
  try {
    localStorage.setItem(LS.SELECTED_SITE, site);
    localStorage.setItem(LS.SELECTED_LINE, lineLabel);
    localStorage.setItem(LS.SELECTED_SLOT, slot);
    localStorage.setItem(LS.SELECTED_IS_EMPTY, "1");
    localStorage.removeItem(LS.SELECTED_ID);
    localStorage.removeItem(LS.INTENT);
  } catch {}
}

function setForEdit(slot: string, machineId: string, site = "본사", lineLabel = "I동") {
  try {
    localStorage.setItem(LS.SELECTED_SITE, site);
    localStorage.setItem(LS.SELECTED_LINE, lineLabel);
    localStorage.setItem(LS.SELECTED_SLOT, slot);
    localStorage.setItem(LS.SELECTED_IS_EMPTY, "0");
    localStorage.setItem(LS.SELECTED_ID, machineId);
    localStorage.setItem(LS.SELECTED_AT, new Date().toISOString());
  } catch {}
}

type Props = {
  equipMap: Map<string, SlotRow>;
  highlightedSlot: string | null;
  onShipped?: (slotCode: string) => void;
};

const IBuildingView: React.FC<Props> = ({ equipMap, highlightedSlot, onShipped }) => {
  const navigate = useNavigate();

  // ✅ 배치 목표:
  // 왼쪽 위→아래: I1 I2 I3 I4
  // 오른쪽 위→아래: I5 I6 I7 I8
  // grid-cols-2 는 "행 우선"으로 채워지므로, 아래 순서로 렌더하면 원하는 열 구성이 됨.
  const slots = useMemo(
    () => ["I1", "I5", "I2", "I6", "I3", "I7", "I4", "I8"],
    []
  );

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const onToggleMenu = (slot: string) => setOpenMenuId((cur) => (cur === slot ? null : slot));

  const goInfoCreate = (slot: string) => {
    setForCreate(slot, "본사", "I동");
    const qs = new URLSearchParams({ mode: "create", site: "본사", line: "I동", slot });
    navigate(`/equipment?${qs.toString()}`);
  };

  const goInfoEdit = (slot: string, machineId: string) => {
    const row = equipMap.get(slot.toUpperCase());
    if (row) storeIntent(buildIntentFromRow(row));

    setForEdit(slot, machineId, "본사", "I동");
    const qs = new URLSearchParams({
      mode: "edit",
      site: "본사",
      line: "I동",
      slot,
      machine: machineId,
    });
    navigate(`/equipment?${qs.toString()}`);
  };

  const goChecklist = (slot: string, machineId: string) =>
    navigate(`/progress-checklist?machine_id=${encodeURIComponent(machineId)}`);

  const goMove = (slot: string, machineId: string) => {
    try {
      localStorage.setItem(LS.SELECTED_SITE, "본사");
      localStorage.setItem(LS.SELECTED_LINE, "I동");
      localStorage.setItem(LS.SELECTED_SLOT, slot);
      localStorage.setItem(LS.SELECTED_IS_EMPTY, "0");
      localStorage.setItem(LS.SELECTED_ID, machineId.trim());
      localStorage.setItem(LS.SELECTED_AT, new Date().toISOString());
    } catch {}

    const qs = new URLSearchParams({
      machine_id: machineId.trim(),
      site: "본사",
      line: "I동",
      slot,
    });

    navigate(`/machine-move?${qs.toString()}`);
  };

  const renderCell = (code: string) => {
    const row = equipMap.get(code.toUpperCase()) ?? null;
    const isHighlight = !!row && highlightedSlot === row.slot_code;

    if (row?.machine_id) {
      const machineId = String(row.machine_id);
      const isOpen = openMenuId === row.slot_code;

      return (
        <div key={code} className="flex flex-col items-center">
          <div className="mb-2 text-xs font-medium text-slate-500">{code}</div>
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

    return (
      <div key={code} className="flex flex-col items-center">
        <div className="mb-2 text-xs font-medium text-slate-500">{code}</div>
        <button
          type="button"
          onClick={() => goInfoCreate(code)}
          className={`rounded-2xl shadow-md ${TILE_W} ${TILE_H} bg-slate-100 flex items-center justify-center hover:ring-2 hover:ring-indigo-300`}
          title="장비 정보 입력으로 이동"
        >
          <span className="text-xs text-slate-400">빈 슬롯</span>
        </button>
      </div>
    );
  };

  return (
    <div className={`${WRAP} flex flex-col gap-12 md:gap-16`}>
      {/* ✅ 2열(좌/우) × 4행(위→아래) */}
      <div className={`grid grid-cols-2 grid-rows-4 place-items-center ${GAP}`}>
        {slots.map(renderCell)}
      </div>
    </div>
  );
};

export default IBuildingView;
