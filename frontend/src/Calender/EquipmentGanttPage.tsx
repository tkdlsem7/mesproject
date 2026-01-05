import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export const API_BASE =
  process.env.NODE_ENV === "production" ? "/api" : "http://localhost:8000/api";

type CalEvent = {
  id: number;
  source_key?: string | null;
  file_name?: string | null;
  uploaded_at?: string | null;

  machine_no?: string | null;
  start_date?: string | null; // YYYY-MM-DD
  end_date?: string | null;   // YYYY-MM-DD | null

  owner?: string | null;
  note?: string | null;       // 예: "[QC] ..." / "[SETTING] ..." / "[출하요청] ..."
};

type SearchMode = "all" | "machine" | "owner";

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

const MS_DAY = 24 * 60 * 60 * 1000;
const asDate0 = (ymd: string) => new Date(ymd + "T00:00:00");
const diffDays = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / MS_DAY);

function parseTag(note?: string | null) {
  const s = (note ?? "").trim();
  const m = s.match(/^\[([^\]]+)\]\s*(.*)$/); // [QC] xxx
  if (!m) return { tag: "", rest: s };
  return { tag: m[1].trim(), rest: (m[2] ?? "").trim() };
}

function eventBarClassByTag(tagRaw: string) {
  const tagCompact = (tagRaw ?? "").replace(/\s+/g, "");
  const tagLower = tagCompact.toLowerCase();

  if (tagLower.includes("qc")) return "bg-blue-500/20 ring-1 ring-blue-300 text-blue-900";
  if (tagLower.includes("setting")) return "bg-orange-500/20 ring-1 ring-orange-300 text-orange-900";
  if (tagCompact.includes("출하요청")) return "bg-emerald-500/20 ring-1 ring-emerald-300 text-emerald-900";
  return "bg-sky-500/20 ring-1 ring-sky-300 text-sky-900";
}

function legendDotClass(tag: "QC" | "SETTING" | "출하요청") {
  if (tag === "QC") return "bg-blue-500";
  if (tag === "SETTING") return "bg-orange-500";
  return "bg-emerald-500";
}

export default function EquipmentGanttPage() {
  const navigate = useNavigate();

  const [cursor, setCursor] = useState<Date>(() => new Date());
  const today = new Date();

  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [searchMode, setSearchMode] = useState<SearchMode>("all");
  const [searchText, setSearchText] = useState("");

  // 모달
  const [openModal, setOpenModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);

  const closeModal = () => {
    setOpenModal(false);
    setSelectedEvent(null);
  };

  const viewStart = useMemo(() => startOfMonth(cursor), [cursor]);
  const viewEnd = useMemo(() => endOfMonth(cursor), [cursor]);
  const viewStartYMD = useMemo(() => toYMD(viewStart), [viewStart]);
  const viewEndYMD = useMemo(() => toYMD(viewEnd), [viewEnd]);

  const totalDays = useMemo(() => diffDays(viewStart, viewEnd) + 1, [viewStart, viewEnd]);

  // 하루 픽셀(원하면 조정)
  const DAY_PX = 32;
  const timelineWidth = Math.max(1200, totalDays * DAY_PX);

  useEffect(() => {
    const fetchMonth = async () => {
      setLoading(true);
      setErrorMsg("");
      try {
        const res = await axios.get<CalEvent[]>(`${API_BASE}/calendar/events`, {
          params: { from: viewStartYMD, to: viewEndYMD },
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
    };
    fetchMonth();
  }, [viewStartYMD, viewEndYMD]);

  const filteredEvents = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return events;

    return events.filter((ev) => {
      const m = (ev.machine_no ?? "").toLowerCase();
      const o = (ev.owner ?? "").toLowerCase();
      if (searchMode === "machine") return m.includes(q);
      if (searchMode === "owner") return o.includes(q);
      return m.includes(q) || o.includes(q);
    });
  }, [events, searchText, searchMode]);

  // machine_no 기준으로 그룹핑(간트는 보통 “행=대상” 구조)
  const rows = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const ev of filteredEvents) {
      const key = (ev.machine_no ?? "").trim();
      if (!key || !ev.start_date) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }

    const list = Array.from(map.entries()).map(([machine_no, list]) => {
      list.sort((a, b) => {
        const as = a.start_date ?? "";
        const bs = b.start_date ?? "";
        if (as !== bs) return as.localeCompare(bs);
        return (a.note ?? "").localeCompare(b.note ?? "");
      });
      return { machine_no, list };
    });

    // 행 정렬(장비번호 오름차순)
    list.sort((a, b) => a.machine_no.localeCompare(b.machine_no));
    return list;
  }, [filteredEvents]);

  // 타임라인 상단 눈금(7일 단위)
  const ticks = useMemo(() => {
    const arr: { x: number; label: string }[] = [];
    for (let i = 0; i < totalDays; i += 7) {
      const d = addDays(viewStart, i);
      arr.push({ x: i * DAY_PX, label: `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}` });
    }
    return arr;
  }, [totalDays, viewStart]);

  const title = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}`;

  const clearSearch = () => setSearchText("");

  const openEventModal = (ev: CalEvent) => {
    setSelectedEvent(ev);
    setOpenModal(true);
  };

  const modalView = useMemo(() => {
    if (!selectedEvent) return null;
    const { tag, rest } = parseTag(selectedEvent.note);
    const label = rest || tag || ""; // note 내용 없으면 tag라도
    const start = selectedEvent.start_date ?? "";
    const end = selectedEvent.end_date || selectedEvent.start_date || "";
    const barClass = eventBarClassByTag(tag);
    return { tag, rest, label, start, end, barClass };
  }, [selectedEvent]);

  // 바(막대) 위치 계산
  const calcBar = (ev: CalEvent) => {
    if (!ev.start_date) return null;

    const s = asDate0(ev.start_date);
    const e = asDate0(ev.end_date || ev.start_date);

    // 화면 범위 밖이면 클램프
    const s2 = s < viewStart ? viewStart : s;
    const e2 = e > viewEnd ? viewEnd : e;

    if (e2 < viewStart || s2 > viewEnd) return null;

    const leftDays = diffDays(viewStart, s2);
    const widthDays = diffDays(s2, e2) + 1; // inclusive
    const left = leftDays * DAY_PX;
    const width = Math.max(10, widthDays * DAY_PX);

    const { tag, rest } = parseTag(ev.note);
    const label = rest || tag || "";
    const barClass = eventBarClassByTag(tag);

    return { left, width, tag, label, barClass };
  };

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

            {/* 검색 UI */}
            <div className="ml-2 flex flex-wrap items-center gap-2">
              <select
                value={searchMode}
                onChange={(e) => setSearchMode(e.target.value as SearchMode)}
                className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm"
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
                  className="h-10 w-[280px] rounded-xl border border-slate-300 bg-white px-3 pr-10 text-sm outline-none focus:border-orange-400"
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

              <div className="text-xs text-slate-500">
                {loading ? "불러오는 중..." : `행 ${rows.length} / 이벤트 ${filteredEvents.length}`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 범례 */}
            <div className="mr-2 hidden items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600 md:flex">
              {(["QC", "SETTING", "출하요청"] as const).map((k) => (
                <div key={k} className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-sm ${legendDotClass(k)}`} />
                  <span className="font-semibold">{k}</span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => navigate("/calendar")}
              className="rounded-full bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300"
            >
              ← 캘린더로
            </button>

            <button
              type="button"
              onClick={() => navigate("/main", { replace: true })}
              className="rounded-full bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300"
            >
              ← 메인으로
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {/* 간트 본문 */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* 헤더(좌측: 라벨 / 우측: 타임라인 눈금) */}
          <div className="grid grid-cols-[260px_1fr] border-b border-slate-200">
            <div className="p-3 text-sm font-semibold text-slate-700 bg-slate-50">
              장비(호기)
            </div>

            <div className="overflow-x-auto bg-slate-50">
              <div className="relative h-12" style={{ width: timelineWidth }}>
                {/* 눈금 라인 */}
                {ticks.map((t, idx) => (
                  <div key={idx} className="absolute top-0 h-full" style={{ left: t.x }}>
                    <div className="h-full w-px bg-slate-200" />
                    <div className="mt-1 text-[11px] text-slate-500">{t.label}</div>
                  </div>
                ))}

                {/* today 표시(해당 월일 때만) */}
                {sameYMD(today, today) && today >= viewStart && today <= viewEnd && (
                  <div
                    className="absolute top-0 h-full"
                    style={{ left: diffDays(viewStart, today) * DAY_PX }}
                  >
                    <div className="h-full w-[2px] bg-orange-400/70" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 로우 */}
          <div className="divide-y divide-slate-200">
            {rows.length === 0 && !loading && (
              <div className="p-6 text-sm text-slate-500">표시할 일정이 없습니다.</div>
            )}

            {rows.map((row) => (
              <div key={row.machine_no} className="grid grid-cols-[260px_1fr]">
                {/* 좌측 라벨 */}
                <div className="p-3">
                  <div className="text-sm font-semibold text-slate-800">{row.machine_no}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {row.list.length}건
                  </div>
                </div>

                {/* 우측 타임라인 */}
                <div className="overflow-x-auto">
                  <div
                    className="relative h-16"
                    style={{ width: timelineWidth }}
                  >
                    {/* 배경 라인(가독성) */}
                    <div className="absolute inset-0">
                      {Array.from({ length: totalDays }).map((_, i) => (
                        <div
                          key={i}
                          className="absolute top-0 h-full w-px bg-slate-100"
                          style={{ left: i * DAY_PX }}
                        />
                      ))}
                    </div>

                    {/* bars */}
                    {row.list.map((ev) => {
                      const bar = calcBar(ev);
                      if (!bar) return null;

                      // note 내용 없으면 tag라도 노출
                      const showText = bar.label
                        ? bar.label
                        : (bar.tag ? bar.tag : "");

                      return (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => openEventModal(ev)}
                          className={[
                            "absolute top-3 h-10 rounded-xl px-2 text-left text-xs font-semibold",
                            "truncate shadow-sm hover:opacity-90",
                            bar.barClass,
                          ].join(" ")}
                          style={{ left: bar.left, width: bar.width }}
                          title={[
                            ev.machine_no ?? "",
                            ev.owner ? `담당: ${ev.owner}` : "",
                            bar.tag ? `구분: ${bar.tag}` : "",
                            showText ? `내용: ${showText}` : "",
                            ev.start_date ? `시작: ${ev.start_date}` : "",
                            ev.end_date ? `종료: ${ev.end_date}` : "",
                          ]
                            .filter(Boolean)
                            .join(" | ")}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">
                              {ev.owner ? `${ev.owner} · ` : ""}
                              {showText || "-"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="px-4 py-3 text-xs text-slate-500">
            기간: <span className="font-mono">{viewStartYMD}</span> ~{" "}
            <span className="font-mono">{viewEndYMD}</span> (막대 클릭 시 상세보기)
          </div>
        </div>
      </div>

      {/* 모달 */}
      {openModal && selectedEvent && modalView && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="w-full max-w-[720px] rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
              <div className="space-y-1">
                <div className="text-lg font-bold text-slate-900">
                  {selectedEvent.machine_no ?? "장비"}
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

              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
              >
                닫기
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-500">담당자</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">
                    {selectedEvent.owner || "-"}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-500">업로드 파일</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">
                    {selectedEvent.file_name || "-"}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-3">
                <div className="text-xs font-semibold text-slate-500">내용</div>
                <div
                  className={[
                    "mt-2 rounded-xl px-3 py-2 text-sm font-semibold",
                    modalView.barClass,
                  ].join(" ")}
                >
                  {modalView.label || "-"}
                </div>
                {selectedEvent.note && (
                  <div className="mt-2 text-xs text-slate-500">
                    원본 note: <span className="font-mono">{selectedEvent.note}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-300"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
