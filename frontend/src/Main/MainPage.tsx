// src/Main/MainPage.tsx
// - 상단 3칸: 본사 A/B/I동 자리 현황
// - 가운데 2칸: 게시판 공지사항 / 변경점
// - 자리 카드 위: 본사 / 진우리 전체 자리 요약
// - 추가: A동/B동/I라인, 본사/진우리 별
//        - 생산 대기 / 생산 중 / 생산 완료 개수
//        - 모델별(FD, SD(e) …) 장비 개수
// - 디자인: 라이트 + 하늘색/청록 헤더, 오렌지 포인트, pill 버튼, 큰 라운드/소프트 섀도우

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

// CRA/Vite 공용: 환경변수 → 없으면 '/api'
export const API_BASE =
  process.env.NODE_ENV === "production" ? "/api" : "http://localhost:8000/api";

/* ---------- 타입 ---------- */
type Building = { used: number; capacity: number; remaining: number };
type CapacityRes = { A: Building; B: Building; I: Building };

type BriefPost = {
  no: number;
  title: string;
  author_name: string;
  created_at: string; // ISO
  category: string;
};

// 장비 요약 타입
type StatusCounts = Record<string, number>;
type ModelCounts = Record<string, number>;

type EquipGroupSummary = {
  name: string; // "A동", "B동", "I라인", "본사", "진우리"
  status_counts: StatusCounts;
  model_counts: ModelCounts;
};

type EquipSummaryRes = {
  buildings: EquipGroupSummary[]; // A동/B동/I라인
  sites: EquipGroupSummary[]; // 본사/진우리
};

const STATUS_LABELS: Record<string, string> = {
  waiting: "생산 대기",
  processing: "생산 중",
  done: "생산 완료",
};

const MainPage: React.FC<{ userName?: string }> = () => {
  const navigate = useNavigate();

  // 탭 라우팅
  const ROUTE_DASHBOARD = "/dashboard";
  const ROUTE_OPTIONS = "/options";
  const ROUTE_TROUBLESHOOT = "/troubleshoot";
  const ROUTE_ROW = "/SetupDefectEntryPage";
  const ROUTE_BOARD = "/board";
  const ROUTE_LOG_TABLE = "/logs/table";
  const ROUTE_LOG_CHART = "/log/charts";
  const ROUTE_MACHINE_MOVING = "/machine-move";
  const ROUTE_CALENDAR = "/calendar"; // ✅ 추가

  // 로그아웃
  const handleLogout = () => {
    try {
      localStorage.removeItem("access_token");
      sessionStorage.removeItem("access_token");
    } catch {}
    try {
      delete axios.defaults.headers.common["Authorization"];
    } catch {}
    navigate("/", { replace: true });
  };

  // 상단 섹션/탭
  const [activeSection, setActiveSection] =
    useState<"시스템 생산실">("시스템 생산실");
  const [showSubTabs, setShowSubTabs] = useState(true);

  /* ----- 상태: 자리 현황 (본사 카드 + 본사/진우리 요약 공용) ----- */
  const [capHead, setCapHead] = useState<CapacityRes | null>(null); // 본사
  const [capJin, setCapJin] = useState<CapacityRes | null>(null); // 진우리
  const [capLoading, setCapLoading] = useState(true);
  const [capErr, setCapErr] = useState<string | null>(null);

  /* ----- 상태: 동/사이트별 생산상태·모델 요약 ----- */
  const [equipSummary, setEquipSummary] = useState<EquipSummaryRes | null>(null);
  const [equipLoading, setEquipLoading] = useState(true);
  const [equipErr, setEquipErr] = useState<string | null>(null);

  /* ----- 상태: 게시판 요약 ----- */
  const [notices, setNotices] = useState<BriefPost[]>([]);
  const [changes, setChanges] = useState<BriefPost[]>([]);
  const [brdLoading, setBrdLoading] = useState(true);
  const [brdErr, setBrdErr] = useState<string | null>(null);

  /* ----- 헬퍼: Capacity 합계 계산 ----- */
  const summarizeCapacity = (cap: CapacityRes | null) => {
    if (!cap) return { totalCapacity: 0, used: 0, remaining: 0 };
    const totalCapacity = cap.A.capacity + cap.B.capacity + cap.I.capacity;
    const used = cap.A.used + cap.B.used + cap.I.used;
    const remaining = cap.A.remaining + cap.B.remaining + cap.I.remaining;
    return { totalCapacity, used, remaining };
  };

  const headTotals = summarizeCapacity(capHead);

  // 진우리는 총 자리 수 70대 고정, 사용대수는 DB 기준 합계 사용
  // 진우리 사이트 장비 수: equipSummary.sites 기준
  const jinEquipUsed =
    equipSummary?.sites
      ?.find((g) => g.name === "진우리")
      ?.status_counts
      ? Object.values(
          equipSummary!.sites.find((g) => g.name === "진우리")!.status_counts
        ).reduce((sum, v) => sum + v, 0)
      : 0;

  const jinTotals = {
    totalCapacity: 70,
    used: jinEquipUsed,
    remaining: Math.max(70 - jinEquipUsed, 0),
  };

  /* ----- 데이터 로딩: 자리 현황 (본사 + 진우리) + 장비 요약 ----- */
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    (async () => {
      try {
        setCapLoading(true);
        setCapErr(null);
        setEquipLoading(true);
        setEquipErr(null);

        const [headRes, jinRes, equipRes] = await Promise.all([
          axios.get<CapacityRes>(`${API_BASE}/main/capacity`, {
            params: { site: "본사" },
            timeout: 8000,
            signal: controller.signal,
          }),
          axios.get<CapacityRes>(`${API_BASE}/main/capacity`, {
            params: { site: "진우리" },
            timeout: 8000,
            signal: controller.signal,
          }),
          axios.get<EquipSummaryRes>(`${API_BASE}/main/equip-summary`, {
            timeout: 8000,
            signal: controller.signal,
          }),
        ]);

        if (!alive) return;
        setCapHead(headRes.data);
        setCapJin(jinRes.data);
        setEquipSummary(equipRes.data);
      } catch (e: any) {
        const canceled =
          e?.code === "ERR_CANCELED" ||
          e?.name === "CanceledError" ||
          e?.message === "canceled";
        if (!canceled) {
          console.error(e);
          if (alive) {
            setCapErr("자리 현황을 불러오지 못했습니다.");
            setEquipErr("장비 현황을 불러오지 못했습니다.");
          }
        }
      } finally {
        if (alive) {
          setCapLoading(false);
          setEquipLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  /* ----- 데이터 로딩: 게시판 요약 ----- */
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    (async () => {
      try {
        setBrdLoading(true);
        setBrdErr(null);
        const { data } = await axios.get<{
          notices: BriefPost[];
          changes: BriefPost[];
        }>(`${API_BASE}/board/summary`, {
          params: { limit: 6 },
          timeout: 8000,
          signal: controller.signal,
        });
        if (!alive) return;
        setNotices(data.notices ?? []);
        setChanges(data.changes ?? []);
      } catch (e: any) {
        const canceled =
          e?.code === "ERR_CANCELED" ||
          e?.name === "CanceledError" ||
          e?.message === "canceled";
        if (!canceled) {
          console.error(e);
          if (alive) setBrdErr("게시판 요약을 불러오지 못했습니다.");
        }
      } finally {
        if (alive) setBrdLoading(false);
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  /* ----- 소 UI: 카드 컴포넌트 ----- */

  // 공통 카드 쉘
  const Shell: React.FC<{
    children: React.ReactNode;
    className?: string;
    header?: string;
  }> = ({ children, className, header }) => (
    <section
      className={`h-full rounded-2xl bg-white shadow-md ring-1 ring-gray-100 ${
        className ?? ""
      }`}
    >
      <div className="h-2 rounded-t-2xl bg-gradient-to-r from-sky-200 via-cyan-200 to-sky-200" />
      {header && (
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h3 className="text-xl font-semibold text-gray-800">{header}</h3>
        </div>
      )}
      {children}
    </section>
  );

  const CapacityCard: React.FC<{
    title: string;
    data?: Building;
    loading?: boolean;
  }> = ({ title, data, loading }) => (
    <Shell>
      <div className="min-h-[180px] px-6 pb-6 pt-4 text-center">
        <div className="mb-2 text-xl font-semibold text-gray-800">
          {title}
        </div>
        {loading ? (
          <div className="py-10 text-base text-gray-500">불러오는 중…</div>
        ) : data ? (
          <div className="space-y-2">
            <div className="text-4xl font-extrabold text-gray-900">
              {data.used}{" "}
              <span className="text-xl font-medium text-gray-500">
                / {data.capacity}
              </span>
            </div>
            <div className="text-base text-gray-600">
              남은자리 : {data.remaining}
            </div>
          </div>
        ) : (
          <div className="py-10 text-base text-gray-400">데이터 없음</div>
        )}
      </div>
    </Shell>
  );

  const BoardCard: React.FC<{
    title: string;
    items: BriefPost[];
    loading?: boolean;
  }> = ({ title, items, loading }) => (
    <Shell>
      <div className="flex items-center justify-between border-b border-sky-100 bg-gradient-to-r from-sky-50 to-cyan-50 px-5 py-3">
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        <button
          onClick={() => navigate(ROUTE_BOARD)}
          className="rounded-full bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-600"
          title="게시판으로 이동"
        >
          더보기
        </button>
      </div>
      <ul className="max-h-56 divide-y divide-gray-100 overflow-y-auto">
        {loading && (
          <li className="px-5 py-4 text-base text-gray-500">
            불러오는 중…
          </li>
        )}
        {!loading && items.length === 0 && (
          <li className="px-5 py-10 text-center text-base text-gray-400">
            게시글이 없습니다.
          </li>
        )}
        {!loading &&
          items.map((p) => (
            <li key={p.no}>
              <button
                onClick={() => navigate(`/board/${p.no}`)}
                className="block w-full px-5 py-3 text-left hover:bg-gray-50"
                title={p.title}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-medium text-gray-900">
                      {p.title}
                    </div>
                    <div className="mt-0.5 text-sm text-gray-500">
                      작성자 {p.author_name} ·{" "}
                      {new Date(p.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-sky-50 px-3 py-1 text-xs text-sky-700 ring-1 ring-sky-200">
                    {p.category}
                  </span>
                </div>
              </button>
            </li>
          ))}
      </ul>
    </Shell>
  );

  // A동/B동/I라인, 본사/진우리 카드 한 개
  const EquipGroupCard: React.FC<{ group: EquipGroupSummary }> = ({ group }) => {
    const statusEntries = Object.entries(group.status_counts ?? {});
    const modelEntries = Object.entries(group.model_counts ?? {});

    return (
      <div className="rounded-xl bg-sky-50/60 px-4 py-3 ring-1 ring-sky-100">
        <div className="text-base font-semibold text-sky-700">
          {group.name}
        </div>
        {statusEntries.length === 0 && modelEntries.length === 0 ? (
          <div className="mt-2 text-sm text-gray-500">장비 데이터 없음</div>
        ) : (
          <>
            {/* 생산 대기 / 중 / 완료 */}
            <div className="mt-2 space-y-1 text-sm text-gray-700">
              {(["waiting", "processing", "done"] as const).map((key) => {
                const value = group.status_counts?.[key] ?? 0;
                if (!value) return null;
                return (
                  <div key={key}>
                    {STATUS_LABELS[key]} :{" "}
                    <span className="font-semibold text-gray-900">
                      {value}대
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 모델(예: SD(e), SE(e) …) */}
            <div className="mt-2 space-y-1 text-sm text-gray-700">
              {modelEntries.map(([model, count]) => (
                <div key={model}>
                  {model} :{" "}
                  <span className="font-semibold text-gray-900">
                    {count}대
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 text-base">
      <div className="mx-auto w-full max-w-6xl">
        {/* 상단 바 */}
        <div className="mb-5 flex items-center justify-between">
          {/* 왼쪽: 상단 탭 */}
          <div className="flex flex-wrap gap-2">
            {(["시스템 생산실"] as const).map((label) => (
              <button
                key={label}
                onClick={() => {
                  setActiveSection(label);
                  setShowSubTabs(label === "시스템 생산실");
                }}
                className={`rounded-full px-5 py-2.5 text-lg font-medium transition ${
                  activeSection === label
                    ? "bg-orange-100 text-orange-700 ring-1 ring-orange-200"
                    : "bg-gray-100 text-gray-700 hover:bg-white hover:shadow"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 오른쪽: 로그아웃 버튼 */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleLogout}
              className="rounded-full bg-orange-500 px-5 py-2.5 text-base font-semibold text-white shadow hover:bg-orange-600"
              title="로그아웃"
            >
              로그아웃
            </button>
          </div>
        </div>

        {/* 하위 탭 */}
        {showSubTabs && (
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 p-2">
              {[
                "Dashboard",
                "Option Configuration",
                "Log Charts",
                "Trouble Shoot",
                "Row data",
                "Board",
                "Log Table",
                "Machine Moving",
                "Calendar",
              ].map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    if (tab === "Dashboard") navigate(ROUTE_DASHBOARD);
                    else if (tab === "Option Configuration")
                      navigate(ROUTE_OPTIONS);
                    else if (tab === "Log Charts") navigate(ROUTE_LOG_CHART);
                    else if (tab === "Trouble Shoot")
                      navigate(ROUTE_TROUBLESHOOT);
                    else if (tab === "Row data") navigate(ROUTE_ROW);
                    else if (tab === "Board") navigate(ROUTE_BOARD);
                    else if (tab === "Log Table") navigate(ROUTE_LOG_TABLE);
                    else if (tab === "Machine Moving") navigate(ROUTE_MACHINE_MOVING);
                    else if (tab === "Calendar") navigate(ROUTE_CALENDAR);
                  }}
                  className={`rounded-full px-4 py-2 text-base transition ${
                    tab === "Dashboard"
                      ? "bg-white text-orange-600 shadow ring-1 ring-orange-200"
                      : "text-gray-700 hover:bg-white hover:shadow"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 본문 */}
        <div className="w-full space-y-6">
          {/* 공지/변경점 */}
          <div className="grid auto-rows-fr grid-cols-1 gap-6 xl:grid-cols-2">
            <BoardCard title="공지사항" items={notices} loading={brdLoading} />
            <BoardCard title="적용사항" items={changes} loading={brdLoading} />
          </div>
          {brdErr && (
            <div className="rounded-lg bg-red-50 px-4 py-2 text-base text-red-700">
              {brdErr}
            </div>
          )}

          {/* 사이트별 전체 자리 요약 (본사 / 진우리) */}
          <Shell header="본사, 진우리 전체 자리 현황">
            <div className="px-6 pb-5 pt-3">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* 본사 */}
                <div className="rounded-xl bg-sky-50/60 px-4 py-4 ring-1 ring-sky-100">
                  <div className="text-xl font-semibold text-sky-700">
                    본사
                  </div>
                  {capLoading ? (
                    <div className="mt-3 h-8 w-44 animate-pulse rounded bg-sky-100" />
                  ) : !capHead ? (
                    <div className="mt-2 text-base text-gray-500">
                      데이터 없음
                    </div>
                  ) : (
                    <>
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-3xl font-extrabold text-gray-900">
                          {headTotals.used}
                        </span>
                        <span className="text-2xl font-semibold text-gray-500">
                          / {headTotals.totalCapacity}
                        </span>
                        <span className="text-base text-gray-600">
                          대 사용
                        </span>
                      </div>
                      <div className="mt-1 text-base text-gray-500">
                        남은 자리 {headTotals.remaining}개
                      </div>
                    </>
                  )}
                </div>

                {/* 진우리: 총 자리 70 고정 */}
                <div className="rounded-xl bg-sky-50/60 px-4 py-4 ring-1 ring-sky-100">
                  <div className="text-xl font-semibold text-sky-700">
                    진우리
                  </div>
                  {capLoading ? (
                    <div className="mt-3 h-8 w-44 animate-pulse rounded bg-sky-100" />
                  ) : (
                    <>
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-3xl font-extrabold text-gray-900">
                          {jinTotals.used}
                        </span>
                        <span className="text-2xl font-semibold text-gray-500">
                          / {jinTotals.totalCapacity}
                        </span>
                        <span className="text-base text-gray-600">
                          대 사용
                        </span>
                      </div>
                      <div className="mt-1 text-base text-gray-500">
                        남은 자리 {jinTotals.remaining}개
                      </div>
                    </>
                  )}
                </div>
              </div>
              {capErr && (
                <div className="mt-3 text-sm text-red-600">{capErr}</div>
              )}
            </div>
          </Shell>

          {/* 동 / 사이트별 생산 상태 + 모델 현황 */}
          <Shell header="동 / 사이트별 생산 상태 · 모델 현황">
            <div className="px-6 pb-5 pt-3">
              {equipLoading ? (
                <div className="py-6 text-base text-gray-500">
                  불러오는 중…
                </div>
              ) : equipErr ? (
                <div className="py-6 text-base text-red-600">
                  {equipErr}
                </div>
              ) : !equipSummary ? (
                <div className="py-6 text-base text-gray-500">
                  데이터 없음
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* A동 / B동 / I라인 */}
                  <div className="space-y-3">
                    <div className="mb-1 text-sm font-semibold text-sky-800">
                      동별 현황 (A동 / B동 / I라인)
                    </div>
                    {equipSummary.buildings.map((g) => (
                      <EquipGroupCard key={g.name} group={g} />
                    ))}
                  </div>

                  {/* 본사 / 진우리 */}
                  <div className="space-y-3">
                    <div className="mb-1 text-sm font-semibold text-sky-800">
                      사이트별 현황 (본사 / 진우리)
                    </div>
                    {equipSummary.sites.map((g) => (
                      <EquipGroupCard key={g.name} group={g} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Shell>

          {/* 자리 현황 (본사 A/B/I 카드) */}
          <div className="grid auto-rows-fr grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            <CapacityCard
              title="본사 A동"
              data={capHead?.A}
              loading={capLoading}
            />
            <CapacityCard
              title="본사 B동"
              data={capHead?.B}
              loading={capLoading}
            />
            <CapacityCard
              title="본사 I동"
              data={capHead?.I}
              loading={capLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainPage;
