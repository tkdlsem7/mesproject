import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

/** API 기본 경로 */
const API_BASE =
  process.env.NODE_ENV === "production" ? "/api" : "http://localhost:8000/api";

const authHeaders = (): Record<string, string> => {
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const STEPS = [
  "Common",
  "Stage",
  "Loader",
  "STAGE(Advanced)",
  "Cold Test",
  "Option&ETC",
  "개조",
  "HW",
  "Packing&Delivery",
] as const;

type StepType = (typeof STEPS)[number];

type SetupRow = Record<string, any>;

type RowsRes = {
  columns: string[];
  rows: SetupRow[];
  total: number;
};

type ManageRowsRes = {
  rows: SetupRow[];
  total: number;
};

type SortDir = "asc" | "desc";

const PAGE_BG =
  "min-h-screen bg-gradient-to-br from-amber-50 via-slate-50 to-sky-50 px-3 py-4";
const FRAME = "mx-auto w-full max-w-[1600px]";
const PANEL =
  "overflow-hidden rounded-3xl bg-white/75 shadow-xl ring-1 ring-slate-200/70 backdrop-blur";

const inputBase =
  "h-11 w-full rounded-2xl border border-slate-200/70 bg-white/90 px-4 text-[15px] text-slate-800 shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-sky-200/70";
const selectBase =
  "h-11 w-full rounded-2xl border border-slate-200/70 bg-white/90 px-3 text-[15px] text-slate-800 shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-sky-200/70";
const btnPill =
  "rounded-full px-4 py-2 text-sm font-extrabold shadow-sm transition disabled:opacity-60";
const softCard = "rounded-3xl bg-white shadow-sm ring-1 ring-slate-200/60";

const textareaCompact =
  "w-full rounded-2xl border border-slate-200/70 bg-white/90 px-4 py-3 text-[15px] text-slate-800 shadow-sm resize-y min-h-[96px] " +
  "focus:outline-none focus:ring-2 focus:ring-sky-200/70";
const textareaBase =
  "w-full rounded-2xl border border-slate-200/70 bg-white/90 px-4 py-3 text-[15px] text-slate-800 shadow-sm resize-y min-h-[120px] " +
  "focus:outline-none focus:ring-2 focus:ring-sky-200/70";

/** ---------- 유틸: T.S(분) → quality_score ---------- */
function scoreFromMinutes(mins: number | null): number | null {
  if (mins === null || Number.isNaN(mins) || mins < 0) return null;
  if (mins < 10) return 1;
  if (mins < 30) return 2;
  if (mins < 60) return 5;
  if (mins < 120) return 10;
  if (mins < 240) return 20;
  if (mins < 600) return 40;
  return 60;
}

/** ---------- defect-catalog (fallback 포함) ---------- */
type DefectCatalogItem = {
  id: number;
  defect: string;
  defect_types: string[];
};

const FALLBACK_DEFECT_TYPES_BY_DEFECT: Record<string, string[]> = {
  "Cable": ["단선", "접촉불량", "파손"],
  "Connector": ["조립불량", "파손", "오조립"],
  "Power": ["전원불량", "노이즈", "불안정"],
};

/** ---------- 간단 자동완성 (EntryPage와 동일 동작 계열) ---------- */
type AutoCompleteInputProps = {
  value: string;
  onChangeValue: (v: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  inputClassName?: string;
};

const AutoCompleteInput: React.FC<AutoCompleteInputProps> = ({
  value,
  onChangeValue,
  options,
  placeholder,
  disabled,
  inputClassName,
}) => {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);

  const filtered = useMemo(() => {
    const kw = value.trim().toLowerCase();
    const base = kw ? options.filter((x) => x.toLowerCase().includes(kw)) : options;
    return base.slice(0, 10);
  }, [value, options]);

  const pickOne = (v: string) => {
    onChangeValue(v);
    setOpen(false);
    setHi(0);
  };

  return (
    <div className="relative">
      <input
        disabled={disabled}
        className={inputClassName ?? inputBase}
        value={value}
        onChange={(e) => {
          onChangeValue(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHi((p) => Math.min(p + 1, Math.max(filtered.length - 1, 0)));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((p) => Math.max(p - 1, 0));
            return;
          }
          if (e.key === "Enter") {
            if (open && filtered.length > 0) {
              e.preventDefault();
              pickOne(filtered[hi] ?? filtered[0]);
            }
            return;
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />

      {open && filtered.length > 0 && !disabled && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          {filtered.map((opt, i) => (
            <button
              key={`${opt}-${i}`}
              type="button"
              className={
                "block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 " +
                (i === hi ? "bg-slate-100" : "")
              }
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pickOne(opt);
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const isEmptyVal = (v: any) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

const tryNumber = (v: any): number | null => {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const s = v.trim().replace(/,/g, "");
    if (!s) return null;
    if (/^-?\d+(\.\d+)?$/.test(s)) {
      const n = Number(s);
      return Number.isNaN(n) ? null : n;
    }
  }
  return null;
};

const looksLikeDate = (s: string) =>
  /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s) || s.includes("T");

const tryTime = (v: any): number | null => {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    if (!looksLikeDate(s)) return null;
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : t;
  }
  return null;
};

const compareCell = (a: any, b: any): number => {
  const aEmpty = isEmptyVal(a);
  const bEmpty = isEmptyVal(b);
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const an = tryNumber(a);
  const bn = tryNumber(b);
  if (an !== null && bn !== null) return an === bn ? 0 : an < bn ? -1 : 1;

  const at = tryTime(a);
  const bt = tryTime(b);
  if (at !== null && bt !== null) return at === bt ? 0 : at < bt ? -1 : 1;

  const as = String(a);
  const bs = String(b);
  return as.localeCompare(bs, "ko-KR", { numeric: true, sensitivity: "base" });
};

const sortRowsBy = (
  data: SetupRow[],
  sortBy: string | null,
  dir: SortDir
) => {
  if (!sortBy) return data;
  const mul = dir === "asc" ? 1 : -1;
  return [...data].sort((ra, rb) => mul * compareCell(ra?.[sortBy], rb?.[sortBy]));
};

const pick = (r: SetupRow, keys: string[], fallback = "") => {
  for (const k of keys) {
    const v = r?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return fallback;
};

const toStr = (v: any) => (v === null || v === undefined ? "" : String(v));

// ✅ machine_no 기준으로 그룹화(같은 호기라도 sheet_id가 달라서 쪼개지는 문제 방지)
function groupByMachineNo(rows: SetupRow[]) {
  const map: Record<string, SetupRow[]> = {};
  for (const r of rows) {
    const m = toStr(r.machine_no ?? r.machineNo ?? r.machine_id ?? r.machineId ?? "").trim();
    const sid = toStr(r.sheet_id ?? r.sheetId ?? "");
    const key = m || (sid ? `__no_machine__:${sid}` : "__unknown__");
    if (!map[key]) map[key] = [];
    map[key].push(r);
  }

  // 그룹 내 정렬: id 오름차순(입력순서 확인 쉬움)
  for (const k of Object.keys(map)) {
    map[k].sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0));
  }
  return map;
}

type EditModalState = {
  open: boolean;
  row: SetupRow | null;
};

export default function SetupDefectManagePage() {
  const navigate = useNavigate();

  // 검색 조건
  const [machineNo, setMachineNo] = useState("");
  const [stepFilter, setStepFilter] = useState<string>("전체");
  const [q, setQ] = useState("");

  // 페이지/데이터
  const LIMIT = 50;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<SetupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 정렬
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const toggleSort = (col: string) => {
    setSortBy((prev) => {
      if (prev === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return col;
      }
      setSortDir("asc");
      return col;
    });
  };

  // 수정 모달
  const [edit, setEdit] = useState<EditModalState>({ open: false, row: null });
  const [editDraft, setEditDraft] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  // ✅ 불량 카탈로그(자동완성)
  const [defectCatalog, setDefectCatalog] = useState<DefectCatalogItem[]>(() =>
    Object.entries(FALLBACK_DEFECT_TYPES_BY_DEFECT).map(([defect, defect_types], i) => ({
      id: -(i + 1),
      defect,
      defect_types,
    }))
  );
  const [defectCatalogLoading, setDefectCatalogLoading] = useState(false);
  const [defectCatalogError, setDefectCatalogError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setDefectCatalogLoading(true);
    setDefectCatalogError(null);

    axios
      .get(`${API_BASE}/defect-catalog`, { headers: { ...authHeaders() }, timeout: 15000 })
      .then((res) => {
        if (!alive) return;
        const data = Array.isArray(res.data) ? res.data : [];
        const normalized: DefectCatalogItem[] = data
          .map((r: any, idx: number) => {
            const defect = String(r?.defect ?? "").trim();
            const rawTypes = r?.defect_types ?? r?.defectTypes ?? [];
            const types = Array.isArray(rawTypes)
              ? rawTypes.map((x: any) => String(x ?? "").trim()).filter(Boolean)
              : String(rawTypes ?? "")
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean);
            if (!defect) return null;
            return {
              id: Number.isFinite(r?.id) ? Number(r.id) : idx + 1,
              defect,
              defect_types: types,
            } as DefectCatalogItem;
          })
          .filter(Boolean) as DefectCatalogItem[];

        if (normalized.length > 0) setDefectCatalog(normalized);
      })
      .catch((err) => {
        if (!alive) return;
        console.error(err);
        setDefectCatalogError("불량 목록을 불러오지 못했습니다. (fallback 사용)");
      })
      .finally(() => {
        if (!alive) return;
        setDefectCatalogLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const defectOptions = useMemo(() => {
    return defectCatalog
      .map((x) => String(x?.defect ?? "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [defectCatalog]);

  const defectTypesByDefect = useMemo<Record<string, string[]>>(() => {
    const rec: Record<string, string[]> = {};
    for (const it of defectCatalog) {
      const key = String(it?.defect ?? "").trim();
      if (!key) continue;
      rec[key] = Array.isArray(it?.defect_types) ? it.defect_types : [];
    }
    return rec;
  }, [defectCatalog]);

  const allDefectTypes = useMemo(() => {
    const s = new Set<string>();
    for (const it of defectCatalog) {
      const arr = Array.isArray(it?.defect_types) ? it.defect_types : [];
      for (const t of arr) {
        const v = String(t ?? "").trim();
        if (v) s.add(v);
      }
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [defectCatalog]);

  // 펼침 상태
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const viewRows = useMemo(() => sortRowsBy(rows, sortBy, sortDir), [rows, sortBy, sortDir]);
  const grouped = useMemo(() => groupByMachineNo(viewRows), [viewRows]);

  const groupMeta = useMemo(() => {
    const meta: Record<string, { maxId: number; sheetIds: string[] }> = {};
    for (const k of Object.keys(grouped)) {
      const rs = grouped[k] ?? [];
      let maxId = 0;
      const sset = new Set<string>();
      for (const r of rs) {
        const id = Number(r?.id ?? 0);
        if (id > maxId) maxId = id;
        const sid = toStr(r?.sheet_id ?? r?.sheetId ?? "").trim();
        if (sid) sset.add(sid);
      }
      meta[k] = { maxId, sheetIds: Array.from(sset).sort((a, b) => a.localeCompare(b)) };
    }
    return meta;
  }, [grouped]);

  const groupKeys = useMemo(() => {
    const keys = Object.keys(grouped);
    keys.sort((a, b) => {
      const am = groupMeta[a]?.maxId ?? 0;
      const bm = groupMeta[b]?.maxId ?? 0;
      if (am !== bm) return bm - am; // 최근 id가 큰 그룹을 위로
      return a.localeCompare(b, "ko-KR", { numeric: true, sensitivity: "base" });
    });
    return keys;
  }, [grouped, groupMeta]);

  const fetchRows = async (pageOverride?: number) => {
    setErr(null);
    setLoading(true);

    try {
      const p = pageOverride ?? page;
      const offset = (p - 1) * LIMIT;

      // ✅ 1) 우선: 관리 전용 API가 있으면 그걸 사용
      try {
        const { data } = await axios.get<ManageRowsRes>(
          `${API_BASE}/setup-sheets/manage/rows`,
          {
            params: {
              machine_no: machineNo.trim() || undefined,
              step: stepFilter !== "전체" ? stepFilter : undefined,
              q: q.trim() || undefined,
              limit: LIMIT,
              offset,
            },
            headers: { ...authHeaders() },
            timeout: 15000,
          }
        );

        const rs = Array.isArray(data?.rows) ? data.rows : [];
        setRows(rs);
        setTotal(Number(data?.total ?? rs.length) || 0);
        setColumns(rs.length ? Object.keys(rs[0]) : []);
        return;
      } catch (e: any) {
        // 404/405 등: 관리 API가 없다면 fallback
        const status = e?.response?.status;
        if (status !== 404 && status !== 405) {
          // 다른 오류면 그대로 던짐
          throw e;
        }
      }

      // ✅ 2) fallback: logs/rows 사용 (읽기만 보장)
      const keyword = [machineNo.trim(), q.trim()].filter(Boolean).join(" ");
      const { data } = await axios.get<RowsRes>(`${API_BASE}/logs/rows`, {
        params: {
          table: "setup_sheet_all",
          q: keyword || undefined,
          limit: LIMIT,
          offset,
        },
        timeout: 15000,
      });

      const rs = Array.isArray(data?.rows) ? data.rows : [];
      const cols = Array.isArray(data?.columns) ? data.columns : [];
      setRows(rs);
      setColumns(cols);
      setTotal(Number(data?.total ?? rs.length) || 0);
    } catch (e: any) {
      console.error(e);
      setErr("데이터를 불러오지 못했습니다. (백엔드 API 확인 필요)");
      setRows([]);
      setColumns([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 첫 진입 시 기본 로딩
    void fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearch = () => {
    setPage(1);
    void fetchRows(1);
  };

  const openEdit = (row: SetupRow) => {
    setEdit({ open: true, row });
    // 수정 가능한 주요 컬럼만 draft로 띄움(없어도 안전)
    const draft: Record<string, any> = {};
    const candidates = [
      "step_name",
      "setup_hours",
      "defect",
      "defect_type",
      "defect_detail",
      "quality_score",
      "ts_minutes",
      "ts_hours",
      "hw_sw",
      "defect_group",
      "defect_location",
      "remark",
      "note",
      "apply",
      "owner",
      "manager",
    ];

    for (const k of candidates) {
      if (row?.[k] !== undefined) draft[k] = row[k];
    }

    // step_name이 없으면 대체 key들로 넣어줌
    if (draft.step_name === undefined) {
      const s = pick(row, ["step_name", "step", "stepName"], "");
      if (s) draft.step_name = s;
    }

    setEditDraft(draft);
  };

  const closeEdit = () => {
    setEdit({ open: false, row: null });
    setEditDraft({});
  };

  const saveEdit = async () => {
    if (!edit.row) return;

    const id = edit.row.id;
    if (!id) {
      alert("id가 없는 행입니다. 백엔드 반환 컬럼을 확인해주세요.");
      return;
    }

    // ✅ ts 분/시간 컬럼 자동 선택:
    // - ts_minutes가 있으면 그걸 사용
    // - 없고 ts_hours만 있으면 ts_hours에 저장(현재 프로젝트가 '분'을 ts_hours에 저장 중일 가능성 큼)
    const payload: Record<string, any> = { ...editDraft };

    try {
      setSaving(true);

      // 1) PUT 시도
      try {
        await axios.put(
          `${API_BASE}/setup-sheets/manage/step/${encodeURIComponent(String(id))}`,
          payload,
          { headers: { ...authHeaders() }, timeout: 15000 }
        );
      } catch (e: any) {
        const st = e?.response?.status;
        if (st === 404 || st === 405) {
          // 2) fallback: POST update
          await axios.post(
            `${API_BASE}/setup-sheets/manage/update-step`,
            { id, patch: payload },
            { headers: { ...authHeaders() }, timeout: 15000 }
          );
        } else {
          throw e;
        }
      }

      alert("수정 완료");
      closeEdit();
      void fetchRows();
    } catch (e: any) {
      console.error(e);
      alert(
        e?.response?.data?.detail ??
          "수정 API가 없거나 오류가 발생했습니다. (백엔드 라우터 필요)"
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (row: SetupRow) => {
    const id = row?.id;
    if (!id) return alert("id가 없는 행입니다.");
    if (!window.confirm(`해당 행(id=${id})을 삭제할까요?`)) return;

    try {
      // 1) DELETE 시도
      try {
        await axios.delete(
          `${API_BASE}/setup-sheets/manage/step/${encodeURIComponent(String(id))}`,
          { headers: { ...authHeaders() }, timeout: 15000 }
        );
      } catch (e: any) {
        const st = e?.response?.status;
        if (st === 404 || st === 405) {
          // 2) fallback: POST delete
          await axios.post(
            `${API_BASE}/setup-sheets/manage/delete-step`,
            { id },
            { headers: { ...authHeaders() }, timeout: 15000 }
          );
        } else {
          throw e;
        }
      }

      alert("삭제 완료");
      void fetchRows();
    } catch (e: any) {
      console.error(e);
      alert(
        e?.response?.data?.detail ??
          "삭제 API가 없거나 오류가 발생했습니다. (백엔드 라우터 필요)"
      );
    }
  };

  // ✅ machine_no(호기) 기준 전체 삭제: 그룹 내 sheet_id들을 전부 삭제
  //   - 같은 호기가 여러 번(sheet_id 여러 개) 등록되어도 한 그룹으로 보여주기 때문에
  //     이 버튼은 해당 그룹의 sheet_id들을 모두 삭제합니다.
  const deleteMachineGroup = async (groupKey: string, rowsInGroup: SetupRow[]) => {
    const sample = rowsInGroup?.[0] ?? {};
    const mNo = pick(sample, ["machine_no", "machineNo", "machine_id", "machineId"], groupKey);

    const sset = new Set<string>();
    for (const r of rowsInGroup) {
      const sid = toStr(r?.sheet_id ?? r?.sheetId ?? "").trim();
      if (sid) sset.add(sid);
    }
    const sheetIds = Array.from(sset);

    // sheet_id가 전혀 없다면, 안전하게 row-by-row 삭제로 fallback
    const msg =
      sheetIds.length > 0
        ? `${mNo} (sheet_id: ${sheetIds.join(", ")}) 전체를 삭제할까요?`
        : `${mNo} 그룹의 모든 행을 삭제할까요? (sheet_id 없음)`;

    if (!window.confirm(msg)) return;

    try {
      // 1) sheet_id로 일괄 삭제(가능하면)
      if (sheetIds.length > 0) {
        for (const sheetId of sheetIds) {
          try {
            await axios.delete(
              `${API_BASE}/setup-sheets/manage/sheet/${encodeURIComponent(String(sheetId))}`,
              { headers: { ...authHeaders() }, timeout: 15000 }
            );
          } catch (e: any) {
            const st = e?.response?.status;
            if (st === 404 || st === 405) {
              await axios.post(
                `${API_BASE}/setup-sheets/manage/delete-sheet`,
                { sheet_id: sheetId },
                { headers: { ...authHeaders() }, timeout: 15000 }
              );
            } else {
              throw e;
            }
          }
        }
      } else {
        // 2) fallback: 그룹 내 행들을 하나씩 삭제
        for (const r of rowsInGroup) {
          const id = r?.id;
          if (!id) continue;
          try {
            await axios.delete(
              `${API_BASE}/setup-sheets/manage/step/${encodeURIComponent(String(id))}`,
              { headers: { ...authHeaders() }, timeout: 15000 }
            );
          } catch (e: any) {
            const st = e?.response?.status;
            if (st === 404 || st === 405) {
              await axios.post(
                `${API_BASE}/setup-sheets/manage/delete-step`,
                { id },
                { headers: { ...authHeaders() }, timeout: 15000 }
              );
            } else {
              throw e;
            }
          }
        }
      }

      alert("삭제 완료");
      setOpenGroups((prev) => {
        const cp = { ...prev };
        delete cp[groupKey];
        return cp;
      });
      void fetchRows();
    } catch (e: any) {
      console.error(e);
      alert(
        e?.response?.data?.detail ??
          "삭제 API가 없거나 오류가 발생했습니다. (백엔드 라우터 필요)"
      );
    }
  };

  const RowCell: React.FC<{ label: string; value: any }> = ({ label, value }) => (
    <div className="min-w-[120px]">
      <div className="text-[11px] font-extrabold text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-800">
        {toStr(value) || "-"}
      </div>
    </div>
  );

  const renderRowSummary = (r: SetupRow) => {
    const step = pick(r, ["step_name", "step"], "");
    const setupHours = pick(r, ["setup_hours", "total_hours"], "");
    const defect = pick(r, ["defect"], "");
    const defectType = pick(r, ["defect_type"], "");
    const qScore = pick(r, ["quality_score"], "");
    const ts = pick(r, ["ts_minutes", "ts_hours"], "");
    const remark = pick(r, ["remark", "note"], "");

    return (
      <div className="flex flex-wrap items-start gap-4">
        <RowCell label="STEP" value={step} />
        <RowCell label="세팅시간" value={setupHours} />
        <RowCell label="불량" value={defect} />
        <RowCell label="불량유형" value={defectType} />
        <RowCell label="품질점수" value={qScore} />
        <RowCell label="T.S(분)" value={ts} />
        <div className="min-w-[260px] flex-1">
          <div className="text-[11px] font-extrabold text-slate-400">비고</div>
          <div className="mt-0.5 text-sm text-slate-700 line-clamp-2">
            {toStr(remark) || "-"}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={PAGE_BG}>
      <div className={FRAME}>
        <div className={PANEL}>
          <div className="h-2 bg-gradient-to-r from-sky-200 via-white to-orange-200" />

          {/* 헤더 */}
          <div className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/70 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
              <div>
                <div className="text-xs font-semibold text-slate-500">MES</div>
                <div className="text-2xl font-extrabold text-slate-900">
                  ROWDATA 관리 (수정/삭제)
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  setup_sheet_all 기준 조회 / machine_no(호기) 기준 그룹화
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className={`${btnPill} bg-white/80 text-slate-700 ring-1 ring-slate-200/70 hover:bg-white`}
                >
                  뒤로가기
                </button>

                <button
                  type="button"
                  onClick={() => navigate("/SetupDefectEntryPage")}
                  className={`${btnPill} bg-slate-900 text-white hover:bg-slate-950`}
                >
                  입력 페이지로
                </button>
              </div>
            </div>
          </div>

          {/* 컨텐츠 */}
          <div className="p-5 md:p-6 space-y-4">
            {/* 검색 바 */}
            <div className={softCard}>
              <div className="px-6 py-5">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <div className="xl:col-span-2">
                    <div className="text-xs font-extrabold text-slate-600">장비번호(machine_no)</div>
                    <input
                      className={inputBase}
                      value={machineNo}
                      onChange={(e) => setMachineNo(e.target.value)}
                      placeholder="예: D(e)-13-03"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onSearch();
                      }}
                    />
                  </div>

                  <div>
                    <div className="text-xs font-extrabold text-slate-600">Step 필터</div>
                    <select
                      className={selectBase}
                      value={stepFilter}
                      onChange={(e) => setStepFilter(e.target.value)}
                    >
                      <option value="전체">전체</option>
                      {STEPS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="xl:col-span-2">
                    <div className="text-xs font-extrabold text-slate-600">추가 검색(q)</div>
                    <input
                      className={inputBase}
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="불량, 담당자, 비고 등"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onSearch();
                      }}
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-slate-600">
                    총 <span className="font-extrabold text-slate-900">{total}</span> 건
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={`${btnPill} bg-orange-500 text-white hover:bg-orange-600`}
                      onClick={onSearch}
                      disabled={loading}
                    >
                      조회
                    </button>

                    <button
                      type="button"
                      className={`${btnPill} bg-white/80 text-slate-700 ring-1 ring-slate-200/70 hover:bg-white`}
                      onClick={() => {
                        setMachineNo("");
                        setQ("");
                        setStepFilter("전체");
                        setPage(1);
                        void fetchRows(1);
                      }}
                      disabled={loading}
                    >
                      초기화
                    </button>
                  </div>
                </div>

                {err && (
                  <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">
                    {err}
                  </div>
                )}
              </div>
            </div>

            {/* 그룹 리스트 */}
            <div className={softCard}>
              <div className="px-6 py-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-lg font-extrabold text-slate-900">결과</div>
                  <div className="text-xs text-slate-500">
                    컬럼 헤더 클릭 → 정렬 (현재: {sortBy ?? "없음"} / {sortDir})
                  </div>
                </div>

                {/* 로딩 */}
                {loading ? (
                  <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-10 text-center text-slate-500 ring-1 ring-slate-200/60">
                    불러오는 중…
                  </div>
                ) : rows.length === 0 ? (
                  <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-10 text-center text-slate-500 ring-1 ring-slate-200/60">
                    데이터가 없습니다.
                  </div>
                ) : (
                  <>
                    {/* 컬럼 헤더 (정렬용) */}
                    <div className="mt-4 overflow-x-auto rounded-2xl ring-1 ring-slate-200/60">
                      <div className="min-w-[980px] border-b bg-slate-50 px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {[
                            "sheet_id",
                            "id",
                            "step_name",
                            "machine_no",
                            "setup_hours",
                            "defect",
                            "defect_type",
                            "quality_score",
                            "ts_minutes",
                            "ts_hours",
                            "remark",
                            "note",
                          ]
                            .filter((c) => columns.includes(c))
                            .map((c) => {
                              const active = sortBy === c;
                              return (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => toggleSort(c)}
                                  className="rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                                  title="정렬"
                                >
                                  {c}{" "}
                                  <span className="text-slate-400">
                                    {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                                  </span>
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    </div>

                    {/* 그룹 렌더 */}
                    <div className="mt-4 space-y-3">
                      {groupKeys.map((gk) => {
                        const groupRows = grouped[gk] ?? [];
                        if (groupRows.length === 0) return null;

                        const sample = groupRows[0];
                        const mNo = pick(
                          sample,
                          ["machine_no", "machineNo", "machine_id", "machineId"],
                          gk
                        );
                        const sheetIds = groupMeta[gk]?.sheetIds ?? [];

                        const findFirst = (keys: string[]) => {
                          for (const r of groupRows) {
                            const v = pick(r, keys, "");
                            if (String(v ?? "").trim()) return String(v);
                          }
                          return "";
                        };

                        const sn = findFirst(["sn", "serial_number", "serialNo"]);
                        const ch = findFirst([
                          "chiller_sn",
                          "chiller_serial_number",
                          "chillerSerialNo",
                        ]);

                        const opened = !!openGroups[gk];

                        return (
                          <div key={gk} className="overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200/60">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-5 py-4">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="rounded-full bg-slate-900 px-3 py-1 text-xs font-extrabold text-white">
                                    {mNo}
                                  </div>
                                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-700">
                                    sheet_id: {sheetIds.length ? sheetIds.join(", ") : "없음"}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    (rows: {groupRows.length})
                                  </div>
                                </div>

                                <div className="mt-1 text-xs text-slate-500">
                                  {sn && <span className="mr-3">S/N: {sn}</span>}
                                  {ch && <span>Chiller S/N: {ch}</span>}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  className={`${btnPill} bg-white/80 text-slate-700 ring-1 ring-slate-200/70 hover:bg-white`}
                                  onClick={() =>
                                    setOpenGroups((prev) => ({ ...prev, [gk]: !opened }))
                                  }
                                >
                                  {opened ? "접기" : "펼치기"}
                                </button>

                                <button
                                  type="button"
                                  className={`${btnPill} bg-red-500 text-white hover:bg-red-600`}
                                  onClick={() => deleteMachineGroup(gk, groupRows)}
                                >
                                  호기 전체 삭제
                                </button>
                              </div>
                            </div>

                            {opened && (
                              <div className="divide-y divide-slate-100">
                                {groupRows.map((r) => {
                                  const id = r.id;
                                  const step = pick(r, ["step_name", "step"], "");
                                  return (
                                    <div key={String(id ?? Math.random())} className="px-5 py-4">
                                      <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-[520px] flex-1">
                                          <div className="mb-2 flex flex-wrap items-center gap-2">
                                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-700">
                                              id: {id ?? "-"}
                                            </span>
                                            <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-extrabold text-sky-800">
                                              step: {step || "-"}
                                            </span>
                                          </div>

                                          {renderRowSummary(r)}
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                          <button
                                            type="button"
                                            className={`${btnPill} bg-sky-600 text-white hover:bg-sky-700`}
                                            onClick={() => openEdit(r)}
                                          >
                                            수정
                                          </button>
                                          <button
                                            type="button"
                                            className={`${btnPill} bg-white/80 text-red-600 ring-1 ring-red-200 hover:bg-red-50`}
                                            onClick={() => deleteRow(r)}
                                          >
                                            삭제
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* 페이징 */}
                <div className="mt-6 flex items-center justify-between">
                  <div className="text-sm text-slate-600">
                    {Math.min(page, totalPages)} / {totalPages}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className={`${btnPill} bg-white/80 text-slate-700 ring-1 ring-slate-200/70 hover:bg-white`}
                      onClick={() => {
                        if (page <= 1) return;
                        const next = page - 1;
                        setPage(next);
                        void fetchRows(next);
                      }}
                      disabled={loading || page <= 1}
                    >
                      ‹ 이전
                    </button>
                    <button
                      className={`${btnPill} bg-white/80 text-slate-700 ring-1 ring-slate-200/70 hover:bg-white`}
                      onClick={() => {
                        if (page >= totalPages) return;
                        const next = page + 1;
                        setPage(next);
                        void fetchRows(next);
                      }}
                      disabled={loading || page >= totalPages}
                    >
                      다음 ›
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 수정 모달 */}
          {edit.open && edit.row &&
            (() => {
              const currentDefect = toStr(editDraft.defect ?? "").trim();
              const typed = defectTypesByDefect[currentDefect] ?? [];
              const defectTypeOptions = typed.length > 0 ? typed : allDefectTypes;

              const applyTsAndQuality = (key: "ts_minutes" | "ts_hours", value: string) => {
                setEditDraft((p) => {
                  const next: Record<string, any> = { ...p, [key]: value };
                  const raw = value.trim();
                  const mins = raw === "" ? null : Number(raw);
                  const score = scoreFromMinutes(mins === null ? null : mins);
                  if (p.quality_score !== undefined) {
                    next.quality_score = score == null ? "" : String(score);
                  }
                  return next;
                });
              };

              return (
                <div className="fixed inset-0 z-50 bg-black/40">
                  <div
                    className="absolute inset-0 overflow-y-auto p-3 md:p-6"
                    onMouseDown={(e) => {
                      // backdrop 클릭 시 닫기
                      if (e.target === e.currentTarget) closeEdit();
                    }}
                  >
                    <div className="mx-auto w-full max-w-3xl">
                      <div
                        className="flex max-h-[calc(100vh-48px)] w-full flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200"
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <div className="shrink-0 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-6 py-4">
                          <div className="text-lg font-extrabold text-slate-900">행 수정</div>
                          <div className="mt-1 text-xs text-slate-500">
                            id: {edit.row.id} / sheet_id: {edit.row.sheet_id ?? "-"} / machine_no:{" "}
                            {pick(edit.row, ["machine_no", "machineNo"], "-")}
                          </div>
                        </div>

                        {/* ✅ 내용은 여기서 스크롤 */}
                        <div className="flex-1 overflow-y-auto px-6 py-5">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {"step_name" in editDraft && (
                              <div>
                                <div className="text-xs font-extrabold text-slate-600">step_name</div>
                                <select
                                  className={selectBase}
                                  value={toStr(editDraft.step_name)}
                                  onChange={(e) => setEditDraft((p) => ({ ...p, step_name: e.target.value }))}
                                >
                                  {STEPS.map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {"setup_hours" in editDraft && (
                              <div>
                                <div className="text-xs font-extrabold text-slate-600">setup_hours</div>
                                <input
                                  className={inputBase}
                                  value={toStr(editDraft.setup_hours)}
                                  onChange={(e) => setEditDraft((p) => ({ ...p, setup_hours: e.target.value }))}
                                  placeholder="예: 2.5"
                                />
                              </div>
                            )}

                            {"defect" in editDraft && (
                              <div>
                                <div className="text-xs font-extrabold text-slate-600">defect</div>
                                <AutoCompleteInput
                                  value={toStr(editDraft.defect)}
                                  onChangeValue={(v) => {
                                    setEditDraft((p) => {
                                      const next: Record<string, any> = { ...p, defect: v };
                                      const types = defectTypesByDefect[v] ?? [];
                                      if ((p.defect_type ?? "") === "" && types.length > 0) {
                                        next.defect_type = types[0] ?? "";
                                      }
                                      return next;
                                    });
                                  }}
                                  options={defectOptions}
                                  placeholder="예: ca 입력 → ca 관련 목록"
                                  inputClassName={inputBase}
                                />
                                {defectCatalogError && (
                                  <div className="mt-1 text-[11px] text-slate-400">{defectCatalogError}</div>
                                )}
                                {defectCatalogLoading && !defectCatalogError && (
                                  <div className="mt-1 text-[11px] text-slate-400">불량 목록 불러오는 중…</div>
                                )}
                              </div>
                            )}

                            {"defect_type" in editDraft && (
                              <div>
                                <div className="text-xs font-extrabold text-slate-600">defect_type</div>
                                <AutoCompleteInput
                                  value={toStr(editDraft.defect_type)}
                                  onChangeValue={(v) => setEditDraft((p) => ({ ...p, defect_type: v }))}
                                  options={defectTypeOptions}
                                  placeholder="예: ca 입력 → 포함 매칭"
                                  inputClassName={inputBase}
                                />
                              </div>
                            )}

                            {"defect_detail" in editDraft && (
                              <div className="md:col-span-2">
                                <div className="text-xs font-extrabold text-slate-600">defect_detail</div>
                                <textarea
                                  className={textareaBase}
                                  value={toStr(editDraft.defect_detail)}
                                  onChange={(e) => setEditDraft((p) => ({ ...p, defect_detail: e.target.value }))}
                                  placeholder="세부 불량 / 적용"
                                />
                              </div>
                            )}

                            {"quality_score" in editDraft && (
                              <div>
                                <div className="text-xs font-extrabold text-slate-600">quality_score</div>
                                <input
                                  className={inputBase}
                                  value={toStr(editDraft.quality_score)}
                                  onChange={(e) => setEditDraft((p) => ({ ...p, quality_score: e.target.value }))}
                                  placeholder="T.S 입력 시 자동 계산(수동 수정 가능)"
                                />
                              </div>
                            )}

                            {"ts_minutes" in editDraft && (
                              <div>
                                <div className="text-xs font-extrabold text-slate-600">t.s minutes (분)</div>
                                <input
                                  className={inputBase}
                                  value={toStr(editDraft.ts_minutes)}
                                  onChange={(e) => applyTsAndQuality("ts_minutes", e.target.value)}
                                  placeholder="예: 60"
                                />
                              </div>
                            )}

                            {"ts_hours" in editDraft && !("ts_minutes" in editDraft) && (
                              <div>
                                <div className="text-xs font-extrabold text-slate-600">
                                  t.s hours (프로젝트에 따라 분으로 쓰는 경우)
                                </div>
                                <input
                                  className={inputBase}
                                  value={toStr(editDraft.ts_hours)}
                                  onChange={(e) => applyTsAndQuality("ts_hours", e.target.value)}
                                  placeholder="예: 60"
                                />
                              </div>
                            )}

                            {"hw_sw" in editDraft && (
                              <div>
                                <div className="text-xs font-extrabold text-slate-600">hw_sw</div>
                                <input
                                  className={inputBase}
                                  value={toStr(editDraft.hw_sw)}
                                  onChange={(e) => setEditDraft((p) => ({ ...p, hw_sw: e.target.value }))}
                                  placeholder="H/W or S/W"
                                />
                              </div>
                            )}

                            {"defect_group" in editDraft && (
                              <div>
                                <div className="text-xs font-extrabold text-slate-600">defect_group</div>
                                <input
                                  className={inputBase}
                                  value={toStr(editDraft.defect_group)}
                                  onChange={(e) => setEditDraft((p) => ({ ...p, defect_group: e.target.value }))}
                                  placeholder="단순 하드웨어 / 기능"
                                />
                              </div>
                            )}

                            {"defect_location" in editDraft && (
                              <div className="md:col-span-2">
                                <div className="text-xs font-extrabold text-slate-600">defect_location</div>
                                <input
                                  className={inputBase}
                                  value={toStr(editDraft.defect_location)}
                                  onChange={(e) => setEditDraft((p) => ({ ...p, defect_location: e.target.value }))}
                                  placeholder="예: PC & Monitor"
                                />
                              </div>
                            )}

                            {("remark" in editDraft || "note" in editDraft) && (
                              <div className="md:col-span-2">
                                <div className="text-xs font-extrabold text-slate-600">비고 (remark/note)</div>
                                <textarea
                                  className={textareaCompact}
                                  value={toStr(editDraft.remark ?? editDraft.note ?? "")}
                                  onChange={(e) =>
                                    setEditDraft((p) => ({
                                      ...p,
                                      ...(p.remark !== undefined ? { remark: e.target.value } : {}),
                                      ...(p.note !== undefined ? { note: e.target.value } : {}),
                                    }))
                                  }
                                  placeholder="비고"
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ✅ 버튼은 하단 고정 */}
                        <div className="shrink-0 border-t border-slate-100 bg-white px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              className={`${btnPill} bg-white/80 text-slate-700 ring-1 ring-slate-200/70 hover:bg-white`}
                              onClick={closeEdit}
                              disabled={saving}
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              className={`${btnPill} bg-orange-500 text-white hover:bg-orange-600`}
                              onClick={saveEdit}
                              disabled={saving}
                            >
                              {saving ? "저장 중…" : "저장"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          {/* 수정 모달 끝 */}
        </div>
      </div>
    </div>
  );
}
