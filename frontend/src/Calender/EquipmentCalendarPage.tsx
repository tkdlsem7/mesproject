// src/Calendar/EquipmentCalendarPage.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export const API_BASE =
  process.env.NODE_ENV === "production" ? "/api" : "http://localhost:8000/api";

/* =========================
 *  타입 / 상수
 * ========================= */

type CalEvent = {
  id: number;
  source_key?: string | null;
  file_name?: string | null;
  uploaded_at?: string | null;

  machine_no?: string | null;
  start_date?: string | null; // YYYY-MM-DD
  end_date?: string | null; // YYYY-MM-DD | null

  owner?: string | null;
  note?: string | null; // 예: "[QC] ..." / "[SETTING] ..." / "[출하 요청] ..."
};

// ✅ 콤보박스 프리셋(사용자 제공)
export const TAG_PRESETS = [
  "SETTING",
  "QC",
  "출하 요청",
  "신규 차분 입고",
  "개조",
  "인터페이스",
  "칠러",
  "Chuck",
] as const;

export type PresetTag = (typeof TAG_PRESETS)[number];
export type TagFilter = "all" | PresetTag | "other";
type SearchMode = "all" | "machine" | "owner";

// 일정 추가 모달에서 쓰는 폼
type AddForm = {
  model: string; // 예: "J" 또는 "D(e)"
  batch: string; // 예: "10"
  unitFrom: string; // 예: "01"
  unitTo: string; // 예: "20" (단일이면 from==to)
  owner: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD | "" (빈칸 허용)
  tagMode: "preset" | "custom";
  presetTag: PresetTag;
  customTag: string; // tagMode=custom일 때
  detail: string; // [TAG] 뒤에 붙는 내용(없어도 됨)
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const toYMD = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
function sameYMD(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const norm = (s: string) => (s ?? "").trim().replace(/\s+/g, "").toLowerCase();

const isPresetTag = (tagRaw: string) => {
  const t = norm(tagRaw);
  return TAG_PRESETS.some((p) => norm(p) === t);
};

// note 저장 형태: [TAG] detail (detail 없으면 [TAG]만)
const buildNote = (tag: string, detail: string) => {
  const t = (tag ?? "").trim();
  const d = (detail ?? "").trim();
  if (!t) return d ? d : null;
  return d ? `[${t}] ${d}` : `[${t}]`;
};

/** note가 "[QC] ..." 형태면 tag/rest로 분리 */
function parseTag(note?: string | null) {
  const s = (note ?? "").trim();
  const m = s.match(/^\[([^\]]+)\]\s*(.*)$/); // [QC] xxx
  if (!m) return { tag: "", rest: s };
  return { tag: (m[1] ?? "").trim(), rest: (m[2] ?? "").trim() };
}

/** tag에 따라 칩/모달 색상 */
function eventPillClassByTag(tagRaw: string) {
  const t = norm(tagRaw);

  if (t === norm("QC")) return "bg-blue-50 text-blue-700 ring-1 ring-blue-200";
  if (t === norm("SETTING"))
    return "bg-orange-50 text-orange-700 ring-1 ring-orange-200";

  // "출하 요청" / "출하요청" / "출하일" 등 확장 대비: '출하' 포함이면 출하 계열로 처리
  if (t.includes("출하")) return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";

  if (t === norm("신규 차분 입고"))
    return "bg-violet-50 text-violet-700 ring-1 ring-violet-200";
  if (t === norm("개조")) return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
  if (t === norm("인터페이스"))
    return "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200";
  if (t === norm("칠러")) return "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200";
  if (t === norm("Chuck")) return "bg-lime-50 text-lime-700 ring-1 ring-lime-200";

  return "bg-sky-50 text-sky-700 ring-1 ring-sky-200";
}

function badgeClassByTag(tagRaw: string) {
  const t = norm(tagRaw);

  if (t === norm("QC")) return "bg-blue-100 text-blue-800";
  if (t === norm("SETTING")) return "bg-orange-100 text-orange-800";
  if (t.includes("출하")) return "bg-emerald-100 text-emerald-800";

  if (t === norm("신규 차분 입고")) return "bg-violet-100 text-violet-800";
  if (t === norm("개조")) return "bg-rose-100 text-rose-800";
  if (t === norm("인터페이스")) return "bg-indigo-100 text-indigo-800";
  if (t === norm("칠러")) return "bg-cyan-100 text-cyan-800";
  if (t === norm("Chuck")) return "bg-lime-100 text-lime-800";

  return "bg-slate-100 text-slate-700";
}

function safeDateStr(s?: string | null) {
  return (s ?? "").trim();
}

function toDateInputValue(ymd?: string | null) {
  const s = safeDateStr(ymd);
  return s ? s : "";
}

function normalizeBatchStr(batch: string) {
  const b = (batch ?? "").trim();
  if (!b) return "";
  if (/^\d+$/.test(b)) {
    const n = parseInt(b, 10);
    if (Number.isFinite(n)) {
      // 한 자리면 2자리로 보정(예: 7 -> 07). 두 자리 이상은 그대로.
      return b.length === 1 ? pad2(n) : String(n);
    }
  }
  return b;
}

function normalizeUnitStr(unit: string) {
  const u = (unit ?? "").trim();
  if (!u) return "";
  if (/^\d+$/.test(u)) {
    const n = parseInt(u, 10);
    if (Number.isFinite(n)) return pad2(n);
  }
  return u;
}

function buildMachineNo(model: string, batch: string, unit: number) {
  const m = (model ?? "").trim();
  const b = normalizeBatchStr(batch);
  const u = pad2(unit);
  return `${m}-${b}-${u}`;
}

/* =========================
 *  컴포넌트
 * ========================= */

export default function EquipmentCalendarPage() {
  const navigate = useNavigate();

  const [cursor, setCursor] = useState<Date>(() => new Date());
  const today = new Date();

  // DB에서 로드된 이벤트
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // 검색 / 필터 UI
  const [searchMode, setSearchMode] = useState<SearchMode>("all");
  const [searchText, setSearchText] = useState("");
  const [tagFilter, setTagFilter] = useState<TagFilter>("all");

  // ✅ 이벤트 상세 모달
  const [openEventModal, setOpenEventModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);

  // ✅ 날짜(일) 모달
  const [openDayModal, setOpenDayModal] = useState(false);
  const [selectedYmd, setSelectedYmd] = useState<string>("");

  // ✅ 일정 추가 모달
  const [openAddModal, setOpenAddModal] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(() => ({
    model: "",
    batch: "",
    unitFrom: "",
    unitTo: "",
    owner: "",
    start_date: "",
    end_date: "",
    tagMode: "preset",
    presetTag: "SETTING",
    customTag: "",
    detail: "",
  }));

  // ✅ 수정 모드 상태 (이벤트 상세 모달 안에서)
  const [editMode, setEditMode] = useState(false);
  const [editOwner, setEditOwner] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editTagMode, setEditTagMode] = useState<"preset" | "custom">("preset");
  const [editPresetTag, setEditPresetTag] = useState<PresetTag>("SETTING");
  const [editCustomTag, setEditCustomTag] = useState("");
  const [editDetail, setEditDetail] = useState("");

  // =========================
  //  데이터 로드
  // =========================
  const refetchMonth = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");

    const s = startOfMonth(cursor);
    const e = endOfMonth(cursor);

    try {
      const res = await axios.get<CalEvent[]>(`${API_BASE}/calendar/events`, {
        params: { from: toYMD(s), to: toYMD(e) },
      });
      setEvents(res.data || []);
    } catch (err: any) {
      setErrorMsg(
        err?.response?.data?.detail ||
          err?.message ||
          "일정 데이터를 불러오지 못했습니다."
      );
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [cursor]);

  useEffect(() => {
    refetchMonth();
  }, [refetchMonth]);

  // =========================
  //  달력(42칸) 계산
  // =========================
  const days = useMemo(() => {
    const s = startOfMonth(cursor);
    const startDow = s.getDay(); // 0~6 (일~토)
    const firstCell = addDays(s, -startDow);

    return Array.from({ length: 42 }, (_, i) => addDays(firstCell, i)).map(
      (d) => ({
        date: d,
        ymd: toYMD(d),
        inMonth: d.getMonth() === cursor.getMonth(),
        isToday: sameYMD(d, today),
      })
    );
  }, [cursor]);

  const title = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}`;

  // =========================
  //  검색/필터 적용
  // =========================
  const filteredEvents = useMemo(() => {
    const q = searchText.trim().toLowerCase();

    return (events || []).filter((ev) => {
      const m = (ev.machine_no ?? "").toLowerCase();
      const o = (ev.owner ?? "").toLowerCase();

      // 검색
      if (q) {
        if (searchMode === "machine" && !m.includes(q)) return false;
        if (searchMode === "owner" && !o.includes(q)) return false;
        if (searchMode === "all" && !(m.includes(q) || o.includes(q)))
          return false;
      }

      // 구분(tag) 필터
      if (tagFilter !== "all") {
        const { tag } = parseTag(ev.note);

        if (tagFilter === "other") {
          // 프리셋 외만 남김
          if (isPresetTag(tag)) return false;
        } else {
          // 프리셋 정확 매칭
          if (norm(tag) !== norm(tagFilter)) return false;
        }
      }

      return true;
    });
  }, [events, searchText, searchMode, tagFilter]);

  // =========================
  //  날짜별 이벤트 펼치기
  // =========================
  const eventsByDay = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};

    for (const ev of filteredEvents) {
      if (!ev.start_date) continue;

      const s = new Date(ev.start_date + "T00:00:00");
      const endStr = ev.end_date || ev.start_date; // end 없으면 하루
      const e = new Date(endStr + "T00:00:00");

      for (let d = new Date(s); d <= e; d = addDays(d, 1)) {
        const key = toYMD(d);
        (map[key] ||= []).push(ev);
      }
    }

    // 보기 좋게 정렬
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => {
        const as = a.start_date ?? "";
        const bs = b.start_date ?? "";
        if (as !== bs) return as.localeCompare(bs);
        return (a.machine_no ?? "").localeCompare(b.machine_no ?? "");
      });
    }

    return map;
  }, [filteredEvents]);

  // =========================
  //  모달 열기/닫기
  // =========================
  const openEventDetail = useCallback((ev: CalEvent) => {
    setSelectedEvent(ev);
    setOpenEventModal(true);

    // 수정 상태 초기화
    setEditMode(false);
    setEditOwner(ev.owner ?? "");
    setEditStart(toDateInputValue(ev.start_date));
    setEditEnd(toDateInputValue(ev.end_date || ev.start_date));

    const { tag, rest } = parseTag(ev.note);
    const tagIsPreset = isPresetTag(tag);

    if (tag && tagIsPreset) {
      // 프리셋이면 preset 모드
      const matched = TAG_PRESETS.find((p) => norm(p) === norm(tag)) || "SETTING";
      setEditTagMode("preset");
      setEditPresetTag(matched);
      setEditCustomTag("");
    } else {
      // 프리셋 아니면 custom 모드
      setEditTagMode("custom");
      setEditCustomTag(tag || "");
      setEditPresetTag("SETTING");
    }

    setEditDetail(rest || "");
  }, []);

  const closeEventModal = useCallback(() => {
    setOpenEventModal(false);
    setSelectedEvent(null);
    setEditMode(false);
  }, []);

  const openDayDetail = useCallback((ymd: string) => {
    setSelectedYmd(ymd);
    setOpenDayModal(true);
  }, []);

  const closeDayModal = useCallback(() => {
    setOpenDayModal(false);
    setSelectedYmd("");
  }, []);

  const openAdd = useCallback((prefillYmd?: string) => {
    setOpenAddModal(true);
    setAddForm((prev) => {
      const y = prefillYmd ?? prev.start_date ?? "";
      return {
        ...prev,
        start_date: y || "",
        end_date: y || "",
        tagMode: prev.tagMode ?? "preset",
        presetTag: prev.presetTag ?? "SETTING",
      };
    });
  }, []);

  const closeAddModal = useCallback(() => {
    setOpenAddModal(false);
  }, []);

  const clearSearch = () => setSearchText("");

  // =========================
  //  이벤트 상세 모달 표시용
  // =========================
  const modalView = useMemo(() => {
    if (!selectedEvent) return null;
    const { tag, rest } = parseTag(selectedEvent.note);
    const label = rest || tag || ""; // note가 비면 tag라도 표시
    const start = selectedEvent.start_date ?? "";
    const end = selectedEvent.end_date || selectedEvent.start_date || "";
    const pillClass = eventPillClassByTag(tag);
    const bClass = badgeClassByTag(tag);

    return { tag, rest, label, start, end, pillClass, badgeClass: bClass };
  }, [selectedEvent]);

  // =========================
  //  API: 수정/삭제/추가
  // =========================
  const onDeleteEvent = useCallback(async () => {
    if (!selectedEvent) return;
    const ok = window.confirm("이 일정을 삭제할까요?");
    if (!ok) return;

    try {
      await axios.delete(`${API_BASE}/calendar/events/${selectedEvent.id}`);
      closeEventModal();
      await refetchMonth();
    } catch (err: any) {
      alert(
        err?.response?.data?.detail ||
          err?.message ||
          "삭제에 실패했습니다."
      );
    }
  }, [selectedEvent, closeEventModal, refetchMonth]);

  const onSaveEdit = useCallback(async () => {
    if (!selectedEvent) return;

    const owner = editOwner.trim() || null;

    const start = editStart.trim();
    if (!start) {
      alert("일정 시작일(start_date)은 필수입니다.");
      return;
    }
    const end = (editEnd.trim() || start).trim();

    const tag =
      editTagMode === "preset" ? editPresetTag : editCustomTag.trim();
    const note = buildNote(tag, editDetail);

    try {
      await axios.patch(`${API_BASE}/calendar/events/${selectedEvent.id}`, {
        owner,
        start_date: start,
        end_date: end || null,
        note,
      });

      // 모달의 selectedEvent도 최신으로 보여주기 위해 refetch 후 재선택
      await refetchMonth();

      // 선택 이벤트를 새 목록에서 다시 찾아 반영(없으면 닫기)
      setSelectedEvent((prev) => {
        if (!prev) return prev;
        const found = (events || []).find((x) => x.id === prev.id);
        return found ?? prev;
      });

      setEditMode(false);
    } catch (err: any) {
      alert(
        err?.response?.data?.detail ||
          err?.message ||
          "수정에 실패했습니다."
      );
    }
  }, [
    selectedEvent,
    editOwner,
    editStart,
    editEnd,
    editTagMode,
    editPresetTag,
    editCustomTag,
    editDetail,
    refetchMonth,
    events,
  ]);

  // ✅ 일정 추가: batch endpoint 시도 후 없으면 단건 반복
  const onSubmitAdd = useCallback(async () => {
    const model = addForm.model.trim();
    const batch = addForm.batch.trim();
    const unitFromStr = normalizeUnitStr(addForm.unitFrom);
    const unitToStr = normalizeUnitStr(addForm.unitTo || addForm.unitFrom);

    if (!model || !batch || !unitFromStr) {
      alert("모델/차분/호기(시작)는 필수입니다.");
      return;
    }

    const start = addForm.start_date.trim();
    if (!start) {
      alert("일정 시작일(start_date)은 필수입니다.");
      return;
    }
    const end = (addForm.end_date.trim() || start).trim();

    const fromNum = /^\d+$/.test(unitFromStr) ? parseInt(unitFromStr, 10) : NaN;
    const toNum = /^\d+$/.test(unitToStr) ? parseInt(unitToStr, 10) : NaN;

    if (!Number.isFinite(fromNum) || !Number.isFinite(toNum)) {
      alert("호기(시작/끝)는 숫자로 입력해 주세요. 예: 01 ~ 20");
      return;
    }

    const a = Math.min(fromNum, toNum);
    const b = Math.max(fromNum, toNum);

    const tag =
      addForm.tagMode === "preset" ? addForm.presetTag : addForm.customTag.trim();
    const note = buildNote(tag, addForm.detail);

    const payloadItems = [];
    for (let n = a; n <= b; n++) {
      payloadItems.push({
        // source_key는 업로드가 아니므로 기본값(예: manual)로 저장 (백엔드가 허용하는 경우)
        source_key: "manual",
        machine_no: buildMachineNo(model, batch, n),
        start_date: start,
        end_date: end || null,
        owner: addForm.owner.trim() || null,
        note,
      });
    }

    try {
      // 1) 배치 엔드포인트가 있으면 한 방에
      try {
        await axios.post(`${API_BASE}/calendar/events/batch`, {
          items: payloadItems,
        });
      } catch (e: any) {
        const status = e?.response?.status;
        // 404/405면 배치 없음 → 단건 반복
        if (status === 404 || status === 405) {
          for (const it of payloadItems) {
            await axios.post(`${API_BASE}/calendar/events`, it);
          }
        } else {
          // 그 외 오류는 그대로 throw
          throw e;
        }
      }

      closeAddModal();
      await refetchMonth();
    } catch (err: any) {
      alert(
        err?.response?.data?.detail ||
          err?.message ||
          "일정 추가에 실패했습니다."
      );
    }
  }, [addForm, closeAddModal, refetchMonth]);

  // =========================
  //  모달 내: “수정 시작” 버튼
  // =========================
  const startEditing = useCallback(() => {
    if (!selectedEvent) return;

    setEditMode(true);

    // selectedEvent 기준으로 다시 한번 안전 초기화
    setEditOwner(selectedEvent.owner ?? "");
    setEditStart(toDateInputValue(selectedEvent.start_date));
    setEditEnd(toDateInputValue(selectedEvent.end_date || selectedEvent.start_date));

    const { tag, rest } = parseTag(selectedEvent.note);
    if (tag && isPresetTag(tag)) {
      const matched = TAG_PRESETS.find((p) => norm(p) === norm(tag)) || "SETTING";
      setEditTagMode("preset");
      setEditPresetTag(matched);
      setEditCustomTag("");
    } else {
      setEditTagMode("custom");
      setEditCustomTag(tag || "");
      setEditPresetTag("SETTING");
    }
    setEditDetail(rest || "");
  }, [selectedEvent]);

  // =========================
  //  Day Modal용 데이터
  // =========================
  const dayEvents = useMemo(() => {
    if (!selectedYmd) return [];
    return eventsByDay[selectedYmd] || [];
  }, [selectedYmd, eventsByDay]);

  const dayTitle = useMemo(() => {
    if (!selectedYmd) return "";
    return selectedYmd;
  }, [selectedYmd]);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto w-full max-w-[1600px] space-y-4">
        {/* 상단 바 */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
              }
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={() => setCursor(new Date())}
              className="h-10 rounded-xl bg-slate-200 px-3 text-sm font-semibold text-slate-800 hover:bg-slate-300"
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() =>
                setCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
              }
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50"
            >
              ▶
            </button>

            <div className="ml-2 text-xl font-bold text-slate-800">{title}</div>

            {/* 검색/필터 UI */}
            <div className="ml-2 flex flex-wrap items-center gap-2">
              <select
                value={searchMode}
                onChange={(e) => setSearchMode(e.target.value as SearchMode)}
                className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm"
                title="검색 대상 선택"
              >
                <option value="all">장비+담당자</option>
                <option value="machine">장비번호</option>
                <option value="owner">담당자</option>
              </select>

              <div className="relative">
                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="장비번호 또는 담당자 검색"
                  className="h-10 w-[260px] rounded-xl border border-slate-300 bg-white px-3 pr-10 text-sm outline-none focus:border-orange-400"
                />
                {searchText.trim() && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                    title="검색 지우기"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* ✅ 구분 필터(전체/프리셋/기타) */}
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value as TagFilter)}
                className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm"
                title="구분 필터"
              >
                <option value="all">전체</option>
                {TAG_PRESETS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                <option value="other">기타(목록 외)</option>
              </select>

              <div className="text-xs text-slate-500">
                {loading ? "불러오는 중..." : `표시 ${filteredEvents.length}건`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/main", { replace: true })}
              className="rounded-full bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300"
            >
              ← 메인으로
            </button>

            <button
              type="button"
              onClick={() => navigate("/calendar/upload")}
              className="h-10 rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white hover:bg-orange-600"
            >
              엑셀 업로드
            </button>

            <button
              type="button"
              onClick={() => openAdd()}
              className="h-10 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"
            >
              일정 추가
            </button>

            <button
              type="button"
              onClick={() => navigate("/gantt")}
              className="h-10 rounded-xl bg-slate-800 px-4 text-sm font-semibold text-white hover:bg-slate-900"
            >
              일정 막대(간트)
            </button>
          </div>
        </div>

        {/* 에러 메시지 */}
        {errorMsg && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {/* 달력 */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="min-w-[1200px]">
            {/* 요일 헤더 */}
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
              {["일", "월", "화", "수", "목", "금", "토"].map((w) => (
                <div key={w} className="px-3 py-2">
                  {w}
                </div>
              ))}
            </div>

            {/* 날짜 그리드 */}
            <div className="grid grid-cols-7">
              {days.map(({ ymd, date, inMonth, isToday }) => {
                const list = eventsByDay[ymd] || [];

                return (
                  <div
                    key={ymd}
                    onClick={() => openDayDetail(ymd)} // ✅ 날짜칸 클릭 → 해당 날짜 전체 모달
                    className={[
                      "cursor-pointer border-b border-r border-slate-200 p-3",
                      "min-h-[170px]",
                      inMonth ? "bg-white" : "bg-slate-50",
                      "hover:bg-slate-50/60",
                    ].join(" ")}
                    title={`${ymd} (클릭하면 전체 일정 보기)`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div
                        className={[
                          "text-sm font-semibold",
                          inMonth ? "text-slate-800" : "text-slate-400",
                        ].join(" ")}
                      >
                        {date.getDate()}
                      </div>

                      {isToday && (
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                          Today
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      {list.slice(0, 4).map((ev) => {
                        const { tag, rest } = parseTag(ev.note);
                        const pillClass = eventPillClassByTag(tag);
                        const label = rest || tag || ""; // ✅ note 없으면 tag라도
                        const noteText = label ? ` • ${label}` : "";

                        return (
                          <button
                            key={`${ev.id}-${ymd}`}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation(); // ✅ 날짜칸 클릭 이벤트 막기
                              openEventDetail(ev);
                            }}
                            className={[
                              "w-full text-left truncate rounded-lg px-2 py-1 text-xs",
                              pillClass,
                              "hover:opacity-90",
                            ].join(" ")}
                            title={[
                              ev.machine_no ?? "",
                              ev.owner ? `담당: ${ev.owner}` : "",
                              tag ? `구분: ${tag}` : "",
                              rest ? `내용: ${rest}` : "",
                            ]
                              .filter(Boolean)
                              .join(" | ")}
                          >
                            {ev.machine_no ?? "-"}
                            {ev.owner ? ` - ${ev.owner}` : ""}
                            {noteText}
                          </button>
                        );
                      })}

                      {list.length > 4 && (
                        <div className="text-xs text-slate-400">
                          +{list.length - 4} more…
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-500">
          가로(칸 너비)를 더 키우려면 위 달력 컨테이너의{" "}
          <span className="font-mono">max-w-[1600px]</span> 또는{" "}
          <span className="font-mono">min-w-[1200px]</span> 값을 더 크게 올리면
          됩니다.
        </div>
      </div>

      {/* =========================
       *  날짜(일) 모달: 선택 날짜의 일정 전체
       *  - 기본 크기 크게 + 스크롤 가능
       * ========================= */}
      {openDayModal && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDayModal();
          }}
        >
          <div className="w-full max-w-[980px] rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
              <div className="space-y-1">
                <div className="text-lg font-bold text-slate-900">
                  {dayTitle} 일정 ({dayEvents.length}건)
                </div>
                <div className="text-xs text-slate-500">
                  목록에서 항목을 클릭하면 상세(수정/삭제)로 이동합니다.
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openAdd(selectedYmd)}
                  className="rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  + 일정 추가
                </button>
                <button
                  type="button"
                  onClick={closeDayModal}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                >
                  닫기
                </button>
              </div>
            </div>

            {/* ✅ 스크롤 영역 */}
            <div className="max-h-[70vh] overflow-y-auto p-4">
              {dayEvents.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  이 날짜에는 일정이 없습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  {dayEvents.map((ev) => {
                    const { tag, rest } = parseTag(ev.note);
                    const pillClass = eventPillClassByTag(tag);
                    const label = rest || tag || "";
                    const start = ev.start_date ?? "-";
                    const end = ev.end_date || ev.start_date || "-";

                    return (
                      <button
                        key={`day-${selectedYmd}-${ev.id}`}
                        type="button"
                        onClick={() => {
                          closeDayModal();
                          openEventDetail(ev);
                        }}
                        className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:bg-slate-50"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-bold text-slate-900">
                              {ev.machine_no ?? "-"}
                            </div>
                            {tag ? (
                              <span
                                className={[
                                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                                  badgeClassByTag(tag),
                                ].join(" ")}
                              >
                                {tag}
                              </span>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                                구분없음
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-slate-500">
                            {start}
                            {end && end !== start ? ` ~ ${end}` : ""}
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <div className="text-xs text-slate-600">
                            담당:{" "}
                            <span className="font-semibold text-slate-800">
                              {ev.owner || "-"}
                            </span>
                          </div>

                          {label ? (
                            <span
                              className={[
                                "truncate rounded-lg px-2 py-1 text-xs",
                                pillClass,
                              ].join(" ")}
                            >
                              {label}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">
                              내용 없음
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 p-4 text-xs text-slate-500">
              현재 검색/필터 상태가 적용된 일정만 표시됩니다.
            </div>
          </div>
        </div>
      )}

      {/* =========================
       *  이벤트 상세 모달: 수정/삭제 포함
       *  - 기본 크기 크게 + 스크롤 가능
       * ========================= */}
      {openEventModal && selectedEvent && modalView && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeEventModal();
          }}
        >
          <div className="w-full max-w-[980px] rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-lg font-bold text-slate-900">
                    {selectedEvent.machine_no ?? "장비"}
                  </div>

                  {modalView.tag ? (
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        modalView.badgeClass,
                      ].join(" ")}
                    >
                      {modalView.tag}
                    </span>
                  ) : null}
                </div>

                <div className="text-sm text-slate-600">
                  기간:{" "}
                  <span className="font-semibold text-slate-800">
                    {modalView.start}
                  </span>
                  {modalView.end && modalView.end !== modalView.start && (
                    <>
                      {" "}
                      ~{" "}
                      <span className="font-semibold text-slate-800">
                        {modalView.end}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!editMode ? (
                  <>
                    <button
                      type="button"
                      onClick={startEditing}
                      className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={onDeleteEvent}
                      className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
                    >
                      삭제
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={onSaveEdit}
                      className="rounded-xl bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700"
                    >
                      저장
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditMode(false)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      취소
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={closeEventModal}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                >
                  닫기
                </button>
              </div>
            </div>

            {/* ✅ 스크롤 영역 */}
            <div className="max-h-[70vh] overflow-y-auto p-4">
              {!editMode ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-semibold text-slate-500">
                        담당자
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">
                        {selectedEvent.owner || "-"}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-semibold text-slate-500">
                        업로드 파일
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">
                        {selectedEvent.file_name || "-"}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-3">
                    <div className="text-xs font-semibold text-slate-500">
                      내용
                    </div>

                    <div
                      className={[
                        "mt-2 rounded-xl px-3 py-2 text-sm",
                        modalView.pillClass,
                      ].join(" ")}
                    >
                      {modalView.label ? modalView.label : "-"}
                    </div>

                    {selectedEvent.note && (
                      <div className="mt-2 text-xs text-slate-500">
                        원본 note:{" "}
                        <span className="font-mono">{selectedEvent.note}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* =========================
                 *  수정 폼 (담당자/일정/내용)
                 * ========================= */
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-bold text-slate-900">
                      수정하기
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      담당자 / 일정(시작~종료) / 내용([구분] + 상세)을 수정합니다.
                    </div>
                  </div>

                  {/* 담당자 */}
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-xs font-semibold text-slate-500">
                      담당자
                    </div>
                    <input
                      value={editOwner}
                      onChange={(e) => setEditOwner(e.target.value)}
                      placeholder="담당자 (예: Khan)"
                      className="mt-2 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange-400"
                    />
                  </div>

                  {/* 일정 */}
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-xs font-semibold text-slate-500">
                      일정
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                      <div>
                        <div className="text-xs text-slate-500">시작일</div>
                        <input
                          type="date"
                          value={editStart}
                          onChange={(e) => setEditStart(e.target.value)}
                          className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange-400"
                        />
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">
                          종료일 (빈칸이면 시작일과 동일)
                        </div>
                        <input
                          type="date"
                          value={editEnd}
                          onChange={(e) => setEditEnd(e.target.value)}
                          className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange-400"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 내용([TAG] + detail) */}
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-xs font-semibold text-slate-500">
                      내용 (구분 + 상세)
                    </div>

                    <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center">
                      {/* ✅ 구분: 프리셋 콤보 + 직접입력 */}
                      <select
                        value={editTagMode === "preset" ? editPresetTag : "__CUSTOM__"}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "__CUSTOM__") {
                            setEditTagMode("custom");
                            setEditCustomTag("");
                          } else {
                            setEditTagMode("preset");
                            setEditPresetTag(v as PresetTag);
                            setEditCustomTag("");
                          }
                        }}
                        className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm"
                        title="구분 선택"
                      >
                        {TAG_PRESETS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                        <option value="__CUSTOM__">직접 입력</option>
                      </select>

                      {editTagMode === "custom" && (
                        <input
                          value={editCustomTag}
                          onChange={(e) => setEditCustomTag(e.target.value)}
                          placeholder="구분 직접 입력 (예: 신규 공정)"
                          className="h-10 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange-400"
                        />
                      )}

                      <input
                        value={editDetail}
                        onChange={(e) => setEditDetail(e.target.value)}
                        placeholder="상세 내용 (없어도 됨)"
                        className="h-10 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange-400"
                      />
                    </div>

                    <div className="mt-2 text-xs text-slate-500">
                      저장 형태 예: <span className="font-mono">[QC] 내용</span>{" "}
                      / 상세가 없으면 <span className="font-mono">[QC]</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 p-4 text-xs text-slate-500">
              팁: 날짜(일) 칸을 클릭하면 해당 날짜 전체 일정 모달이 열립니다.
            </div>
          </div>
        </div>
      )}

      {/* =========================
       *  일정 추가 모달 (범위 입력 지원)
       * ========================= */}
      {openAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeAddModal();
          }}
        >
          <div className="w-full max-w-[980px] rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
              <div className="space-y-1">
                <div className="text-lg font-bold text-slate-900">
                  일정 추가 (범위 입력 가능)
                </div>
                <div className="text-xs text-slate-500">
                  예: 모델=J, 차분=10, 호기 01~20 → J-10-01 ~ J-10-20 이 한 번에 생성됩니다.
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onSubmitAdd}
                  className="rounded-xl bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700"
                >
                  추가
                </button>
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                >
                  닫기
                </button>
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-4 space-y-4">
              {/* 호기 입력 */}
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-sm font-bold text-slate-900">호기</div>

                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
                  <div>
                    <div className="text-xs font-semibold text-slate-500">모델</div>
                    <input
                      value={addForm.model}
                      onChange={(e) =>
                        setAddForm((p) => ({ ...p, model: e.target.value }))
                      }
                      placeholder="예: J / D(e)"
                      className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange-400"
                    />
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-slate-500">차분</div>
                    <input
                      value={addForm.batch}
                      onChange={(e) =>
                        setAddForm((p) => ({ ...p, batch: e.target.value }))
                      }
                      placeholder="예: 10"
                      className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange-400"
                    />
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-slate-500">호기 시작</div>
                    <input
                      value={addForm.unitFrom}
                      onChange={(e) =>
                        setAddForm((p) => ({ ...p, unitFrom: e.target.value }))
                      }
                      placeholder="예: 01"
                      className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange-400"
                    />
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-slate-500">
                      호기 끝 (단일이면 비워도 됨)
                    </div>
                    <input
                      value={addForm.unitTo}
                      onChange={(e) =>
                        setAddForm((p) => ({ ...p, unitTo: e.target.value }))
                      }
                      placeholder="예: 20"
                      className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange-400"
                    />
                  </div>
                </div>
              </div>

              {/* 담당자 */}
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500">담당자</div>
                <input
                  value={addForm.owner}
                  onChange={(e) =>
                    setAddForm((p) => ({ ...p, owner: e.target.value }))
                  }
                  placeholder="담당자 (없으면 빈칸)"
                  className="mt-2 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange-400"
                />
              </div>

              {/* 일정 */}
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500">일정</div>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <div>
                    <div className="text-xs text-slate-500">시작일</div>
                    <input
                      type="date"
                      value={addForm.start_date}
                      onChange={(e) =>
                        setAddForm((p) => ({ ...p, start_date: e.target.value }))
                      }
                      className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange-400"
                    />
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">
                      종료일 (빈칸이면 시작일과 동일)
                    </div>
                    <input
                      type="date"
                      value={addForm.end_date}
                      onChange={(e) =>
                        setAddForm((p) => ({ ...p, end_date: e.target.value }))
                      }
                      className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange-400"
                    />
                  </div>
                </div>
              </div>

              {/* 내용 */}
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500">
                  내용 (구분 + 상세)
                </div>

                <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center">
                  <select
                    value={addForm.tagMode === "preset" ? addForm.presetTag : "__CUSTOM__"}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__CUSTOM__") {
                        setAddForm((p) => ({ ...p, tagMode: "custom", customTag: "" }));
                      } else {
                        setAddForm((p) => ({
                          ...p,
                          tagMode: "preset",
                          presetTag: v as PresetTag,
                          customTag: "",
                        }));
                      }
                    }}
                    className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm"
                    title="구분 선택"
                  >
                    {TAG_PRESETS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                    <option value="__CUSTOM__">직접 입력</option>
                  </select>

                  {addForm.tagMode === "custom" && (
                    <input
                      value={addForm.customTag}
                      onChange={(e) =>
                        setAddForm((p) => ({ ...p, customTag: e.target.value }))
                      }
                      placeholder="구분 직접 입력 (예: 신규 공정)"
                      className="h-10 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange-400"
                    />
                  )}

                  <input
                    value={addForm.detail}
                    onChange={(e) =>
                      setAddForm((p) => ({ ...p, detail: e.target.value }))
                    }
                    placeholder="상세 내용 (없어도 됨)"
                    className="h-10 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange-400"
                  />
                </div>

                <div className="mt-2 text-xs text-slate-500">
                  저장 형태 예: <span className="font-mono">[SETTING] 세팅</span>{" "}
                  / 상세가 없으면 <span className="font-mono">[SETTING]</span>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 p-4 text-xs text-slate-500">
              백엔드에 <span className="font-mono">POST /calendar/events</span> 또는{" "}
              <span className="font-mono">POST /calendar/events/batch</span>가 있어야 합니다.
              (batch가 없으면 단건 반복으로 자동 폴백합니다.)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
