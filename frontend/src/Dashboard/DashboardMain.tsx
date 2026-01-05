// src/Dashboard/DashboardMain.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ABuildingView from "./ABuildingView";
import IBuildingView from "./IBuildingView";
import BBuildingView from "./BBuildingView";
import LineWaitingView from "./LineWaitingView";
import JinwooriView from "./JinwooriView";
import { fetchSlots, type SlotRow } from "./DashboardHandler";

const LS_BUILDING = "dash_building";
const LS_SITE = "dash_site";
const AUTO_REFRESH_MS = 5 * 60 * 1000;

// ✅ 슬롯 클릭 시 다른 페이지들이 참조하는(기존에 쓰던) 선택 값 키들
// 프로젝트에 이미 존재하는 키명이라면 그대로 맞춰주세요.
const LS_SELECTED_SITE = "selected_site";
const LS_SELECTED_LINE = "selected_line";

type ViewKey = "A" | "B" | "I" | "WAIT" | "JIN";
const HQ_SITE = "본사";
const WAIT_SITE = "라인대기";
const JIN_SITE = "진우리";

function useDebounced<T>(v: T, d = 200): T {
  const [x, setX] = useState(v);
  useEffect(() => {
    const id = setTimeout(() => setX(v), d);
    return () => clearTimeout(id);
  }, [v, d]);
  return x;
}

function normalizeView(v: string | null): ViewKey {
  if (v === "A" || v === "B" || v === "I" || v === "WAIT" || v === "JIN") return v;
  return "A";
}

// ✅ 여기서 “현재 화면이 의미하는 site”를 한 방에 정리
function viewToSite(v: ViewKey): string {
  if (v === "WAIT") return WAIT_SITE;
  if (v === "JIN") return JIN_SITE;
  return HQ_SITE; // A/B/I는 본사
}

export default function DashboardMain() {
  const navigate = useNavigate();

  const [building, setBuilding] = useState<ViewKey>(() =>
    normalizeView(localStorage.getItem(LS_BUILDING))
  );

  const [rows, setRows] = useState<SlotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 200);

  // ✅ 본사/라인대기: slot_code 하이라이트, 진우리: machine_id 하이라이트
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);

  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<number>(AUTO_REFRESH_MS);

  const isHQ = building === "A" || building === "B" || building === "I";

  // ✅ 화면 전환 시: “선택된 사이트/라인” localStorage를 항상 현재 화면 기준으로 덮어쓰기
  //    -> 라인대기에서 본사로 왔을 때도 selected_site가 '본사'로 바뀌어서,
  //       본사 슬롯 클릭 시 정보 입력이 라인대기로 들어가는 문제 해결
  useEffect(() => {
    const site = viewToSite(building);

    localStorage.setItem(LS_BUILDING, building);
    localStorage.setItem(LS_SITE, site);

    // 다른 페이지(장비정보입력/이동/체크리스트 등)가 보는 키도 같이 맞춰줌
    localStorage.setItem(LS_SELECTED_SITE, site);
    localStorage.setItem(LS_SELECTED_LINE, building); // 필요 없으면 지워도 됨
  }, [building]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      if (building === "WAIT") {
        const [a, b, i] = await Promise.all([
          fetchSlots({ site: WAIT_SITE, building: "A" }),
          fetchSlots({ site: WAIT_SITE, building: "B" }),
          fetchSlots({ site: WAIT_SITE, building: "I" }),
        ]);
        setRows([...a, ...b, ...i]);
      } else if (building === "JIN") {
        // ✅ 진우리는 building="JIN"으로 1번만 호출
        const list = await fetchSlots({ site: JIN_SITE, building: "JIN" as any });
        setRows(list);
      } else {
        // ✅ 본사(A/B/I)는 site를 무조건 "본사"로 고정
        const list = await fetchSlots({ site: HQ_SITE, building });
        setRows(list);
      }

      setLastSyncAt(new Date());
      setCountdown(AUTO_REFRESH_MS);
    } catch (e: any) {
      setError(e?.message ?? "목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [building]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const tick = setInterval(() => setCountdown((ms) => (ms > 1000 ? ms - 1000 : 0)), 1000);
    const auto = setInterval(() => void load(), AUTO_REFRESH_MS);
    return () => {
      clearInterval(tick);
      clearInterval(auto);
    };
  }, [load]);

  useEffect(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return setHighlightedKey(null);

    const found = rows.find((r) => String(r.machine_id ?? "").toLowerCase().includes(q));
    if (!found) return setHighlightedKey(null);

    if (building === "JIN") setHighlightedKey(String(found.machine_id ?? ""));
    else setHighlightedKey(String(found.slot_code ?? ""));
  }, [debouncedQuery, rows, building]);

  const onSearchClick = () => {
    const q = query.trim().toLowerCase();
    if (!q) return setHighlightedKey(null);

    const found = rows.find((r) => String(r.machine_id ?? "").toLowerCase().includes(q));
    if (!found) return setHighlightedKey(null);

    if (building === "JIN") setHighlightedKey(String(found.machine_id ?? ""));
    else setHighlightedKey(String(found.slot_code ?? ""));
  };

  const equipMap = useMemo(() => {
    const m = new Map<string, SlotRow>();
    rows.forEach((r) => m.set(String(r.slot_code ?? "").toUpperCase(), r));
    return m;
  }, [rows]);

  const RootBtn = ({
    active,
    label,
    onClick,
  }: {
    active: boolean;
    label: string;
    onClick: () => void;
  }) => (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-md hover:bg-slate-700/40 ${
        active ? "bg-slate-700 text-white" : "text-slate-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 bg-white border-b shadow-sm">
        <div className="w-full max-w-none px-6 2xl:px-10 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-5xl font-extrabold tracking-tight text-orange-600 hover:opacity-80 focus:outline-none"
            title="이전 페이지로 이동"
          >
            SEMICS
          </button>

          <div className="flex-1 flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="호기(장비번호)로 검색…  예) j-01-10"
              className="w-full rounded-lg border px-4 py-2.5 text-sm focus:ring-4 focus:ring-indigo-200"
            />
            <button
              onClick={onSearchClick}
              className="rounded-lg bg-gray-200 px-10 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-300"
            >
              검색
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void load()}
              className="rounded-lg bg-indigo-600 px-10 py-5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              새로고침
            </button>
            <div className="text-xs text-slate-600">
              마지막 동기화: {lastSyncAt ? lastSyncAt.toLocaleTimeString() : "-"} · 자동 새로고침까지{" "}
              {Math.ceil(countdown / 1000)}s
            </div>
          </div>
        </div>
      </header>

      <div className="w-full max-w-none px-6 2xl:px-10 py-6 grid grid-cols-[320px_1fr] gap-8 2xl:gap-12">
        <aside className="rounded-xl bg-slate-900 p-3 text-slate-200">
          <div className="px-2 py-2 text-slate-300 text-sm">사이트 선택</div>

          <ul className="mt-1 ml-3 pl-2 border-l border-slate-700 space-y-2">
            <li>
              <RootBtn
                active={isHQ}
                label="본사"
                onClick={() => {
                  // ✅ 본사 루트 클릭 시 A로 진입
                  setBuilding("A");
                }}
              />
              {isHQ && (
                <ul className="mt-1 ml-4 pl-3 border-l border-slate-700/70 space-y-1">
                  {(["A", "B", "I"] as const).map((b) => (
                    <li key={b}>
                      <button
                        onClick={() => setBuilding(b)}
                        className={`w-full text-left px-3 py-2 rounded-md hover:bg-slate-700/40 ${
                          building === b ? "bg-slate-700 text-white" : "text-slate-200"
                        }`}
                      >
                        {b}동
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>

            <li className="pt-2 border-t border-slate-700/60">
              <RootBtn active={building === "WAIT"} label="라인대기" onClick={() => setBuilding("WAIT")} />
            </li>

            <li className="pt-2 border-t border-slate-700/60">
              <RootBtn active={building === "JIN"} label="진우리" onClick={() => setBuilding("JIN")} />
            </li>
          </ul>
        </aside>

        <main>
          {error ? (
            <div className="rounded-md bg-red-50 px-4 py-3 text-red-600">{error}</div>
          ) : loading ? (
            <div className="rounded-xl border bg-white p-10 text-slate-600">불러오는 중…</div>
          ) : building === "A" ? (
            <ABuildingView equipMap={equipMap} highlightedSlot={highlightedKey} onShipped={() => void load()} />
          ) : building === "B" ? (
            <BBuildingView equipMap={equipMap} highlightedSlot={highlightedKey} onShipped={() => void load()} />
          ) : building === "I" ? (
            <IBuildingView equipMap={equipMap} highlightedSlot={highlightedKey} onShipped={() => void load()} />
          ) : building === "WAIT" ? (
            <LineWaitingView
              equipMap={equipMap}
              highlightedSlot={highlightedKey}
              onShipped={(_slot) => void load()}
              siteLabel={WAIT_SITE}
            />
          ) : (
            <JinwooriView
              rows={rows}
              highlightedKey={highlightedKey}
              onShipped={(_slot) => void load()}
              siteLabel={JIN_SITE}
            />
          )}
        </main>
      </div>
    </div>
  );
}
