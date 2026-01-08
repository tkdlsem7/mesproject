// src/Main/MainPage.tsx
// - 좌측: 빠른 이동(카테고리 트리)
// - 우측: 기존 메인 콘텐츠 유지 (공지/변경점, 자리현황, 동/사이트별 현황, A/B/I 카드)
// - 출근 체크 모달 + 출근 기록 페이지 이동 유지
// - 가로 폭: 전체 max-w-5xl로 살짝 축소 + 사이드바 260px + 패딩/갭 소폭 축소
// - 세로 여백 과다 문제: Shell의 h-full 제거 + grid items-start + sidebar self-start/max-h

import React, { useEffect, useMemo, useState } from "react";
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

/* ---------- 좌측 트리 네비 타입 ---------- */
type NavItem = { label: string; desc?: string; to: string };
type NavGroup = { key: string; label: string; items: NavItem[] };

const MainPage: React.FC<{ userName?: string }> = ({ userName }) => {
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
  const ROUTE_CALENDAR = "/calendar";
  const ROUTE_ATTENDANCE = "/attendance";
  const ROUTE_LINE_ACCESS = "/line-access";

  const NAV_GROUPS: NavGroup[] = useMemo(
    () => [
      {
        key: "status",
        label: "현황",
        items: [
          { label: "Dashboard", desc: "라인/슬롯 현황", to: ROUTE_DASHBOARD },
          { label: "Calendar", desc: "일정/캘린더", to: ROUTE_CALENDAR },
        ],
      },
      {
        key: "quality",
        label: "품질/불량",
        items: [
          { label: "Trouble Shoot", desc: "불량/이슈 등록", to: ROUTE_TROUBLESHOOT },
          { label: "Row data", desc: "Raw/불량 데이터 입력", to: ROUTE_ROW },
        ],
      },
      {
        key: "logs",
        label: "로그/분석",
        items: [
          { label: "Log Charts", desc: "차트/지표", to: ROUTE_LOG_CHART },
          { label: "Log Table", desc: "테이블 조회", to: ROUTE_LOG_TABLE },
        ],
      },
      {
        key: "ops",
        label: "운영/이동",
        items: [{ label: "Machine Moving", desc: "장비 이동", to: ROUTE_MACHINE_MOVING }],
      },
      {
        key: "settings",
        label: "설정",
        items: [{ label: "Option Configuration", desc: "옵션/체크리스트", to: ROUTE_OPTIONS }],
      },
      {
        key: "board",
        label: "게시판",
        items: [{ label: "Board", desc: "공지/적용사항", to: ROUTE_BOARD }],
      },
      {
        key: "attendance",
        label: "출근",
        items: [{ label: "출근 기록", desc: "기록 조회", to: ROUTE_ATTENDANCE },
          { label: "라인 출입 현황", desc: "현재 출입자", to: ROUTE_LINE_ACCESS }, // ✅ 추가
        ],
        
        
      },
    ],
    [
      ROUTE_ATTENDANCE,
      ROUTE_LINE_ACCESS,
      ROUTE_BOARD,
      ROUTE_CALENDAR,
      ROUTE_DASHBOARD,
      ROUTE_LOG_CHART,
      ROUTE_LOG_TABLE,
      ROUTE_MACHINE_MOVING,
      ROUTE_OPTIONS,
      ROUTE_ROW,
      ROUTE_TROUBLESHOOT,
    ]
  );

  /* =========================
     로그아웃
     ========================= */
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

  /* =========================
     출근 체크(Attendance) UI/로직
     ========================= */
  const [attOpen, setAttOpen] = useState(false);
  const [attSaving, setAttSaving] = useState(false);
  const [attErrMsg, setAttErrMsg] = useState<string | null>(null);
  const [attOkMsg, setAttOkMsg] = useState<string | null>(null);

  const getUserIdFromToken = () => {
    const raw = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    if (!raw) return null;

    const token = raw.startsWith("Bearer ") ? raw.slice(7) : raw;

    try {
      const payloadPart = token.split(".")[1];
      if (!payloadPart) return null;

      const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
      const payload = JSON.parse(atob(padded));

      return (payload?.sub ?? payload?.user_id ?? payload?.id ?? null) as string | null;
    } catch {
      return null;
    }
  };

  const saveAttendance = async (recordType: 1 | 2 | 3) => {
    setAttErrMsg(null);
    setAttOkMsg(null);

    const userId = getUserIdFromToken();
    if (!userId) {
      setAttErrMsg("로그인 사용자 정보를 확인할 수 없습니다. 다시 로그인해 주세요.");
      return;
    }

    try {
      setAttSaving(true);
      await axios.post(
        `${API_BASE}/main/attendance`,
        { user_id: userId, record_type: recordType },
        { timeout: 8000 }
      );
      setAttOpen(false);
      setAttOkMsg("출근 기록이 저장되었습니다.");
    } catch (e) {
      console.error(e);
      setAttErrMsg("출근 기록 저장에 실패했습니다.");
    } finally {
      setAttSaving(false);
    }
  };

  useEffect(() => {
    if (!attOkMsg) return;
    const t = window.setTimeout(() => setAttOkMsg(null), 3000);
    return () => window.clearTimeout(t);
  }, [attOkMsg]);

  /* =========================
     데이터 상태
     ========================= */
  const [capHead, setCapHead] = useState<CapacityRes | null>(null); // 본사
  const [capJin, setCapJin] = useState<CapacityRes | null>(null); // 진우리 (응답은 받지만 현재는 총 70 고정 계산에 사용)
  const [capLoading, setCapLoading] = useState(true);
  const [capErr, setCapErr] = useState<string | null>(null);

  const [equipSummary, setEquipSummary] = useState<EquipSummaryRes | null>(null);
  const [equipLoading, setEquipLoading] = useState(true);
  const [equipErr, setEquipErr] = useState<string | null>(null);

  const [notices, setNotices] = useState<BriefPost[]>([]);
  const [changes, setChanges] = useState<BriefPost[]>([]);
  const [brdLoading, setBrdLoading] = useState(true);
  const [brdErr, setBrdErr] = useState<string | null>(null);

  const summarizeCapacity = (cap: CapacityRes | null) => {
    if (!cap) return { totalCapacity: 0, used: 0, remaining: 0 };
    const totalCapacity = cap.A.capacity + cap.B.capacity + cap.I.capacity;
    const used = cap.A.used + cap.B.used + cap.I.used;
    const remaining = cap.A.remaining + cap.B.remaining + cap.I.remaining;
    return { totalCapacity, used, remaining };
  };

  const headTotals = summarizeCapacity(capHead);

  const jinEquipUsed =
    equipSummary?.sites?.find((g) => g.name === "진우리")?.status_counts
      ? Object.values(equipSummary!.sites.find((g) => g.name === "진우리")!.status_counts).reduce(
          (sum, v) => sum + v,
          0
        )
      : 0;

  const jinTotals = {
    totalCapacity: 70,
    used: jinEquipUsed,
    remaining: Math.max(70 - jinEquipUsed, 0),
  };

  /* ----- 데이터 로딩: 자리 현황 + 장비 요약 ----- */
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
          e?.code === "ERR_CANCELED" || e?.name === "CanceledError" || e?.message === "canceled";
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

        const { data } = await axios.get<{ notices: BriefPost[]; changes: BriefPost[] }>(
          `${API_BASE}/board/summary`,
          { params: { limit: 6 }, timeout: 8000, signal: controller.signal }
        );

        if (!alive) return;
        setNotices(data.notices ?? []);
        setChanges(data.changes ?? []);
      } catch (e: any) {
        const canceled =
          e?.code === "ERR_CANCELED" || e?.name === "CanceledError" || e?.message === "canceled";
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

  /* =========================
     UI 컴포넌트
     ========================= */

  // ✅ 공통 카드 쉘 (h-full 제거)
  const Shell: React.FC<{
    children: React.ReactNode;
    className?: string;
    header?: string;
    headerRight?: React.ReactNode;
  }> = ({ children, className, header, headerRight }) => (
    <section className={`rounded-2xl bg-white shadow-sm ring-1 ring-sky-100 ${className ?? ""}`}>
      <div className="h-2 rounded-t-2xl bg-gradient-to-r from-sky-200 via-sky-100 to-sky-200" />
      {header && (
        <div className="flex items-center justify-between gap-3 border-b border-sky-100 bg-white px-5 py-3">
          <h3 className="text-lg font-semibold text-slate-900">{header}</h3>
          {headerRight}
        </div>
      )}
      {children}
    </section>
  );

  const CapacityCard: React.FC<{ title: string; data?: Building; loading?: boolean }> = ({
    title,
    data,
    loading,
  }) => (
    <Shell>
      <div className="px-5 pb-5 pt-4 text-center">
        <div className="mb-2 text-lg font-semibold text-slate-900">{title}</div>
        {loading ? (
          <div className="py-8 text-sm text-slate-500">불러오는 중…</div>
        ) : data ? (
          <div className="space-y-2">
            <div className="text-3xl font-extrabold text-slate-900">
              {data.used}{" "}
              <span className="text-lg font-semibold text-slate-500">/ {data.capacity}</span>
            </div>
            <div className="text-sm text-slate-600">남은자리 : {data.remaining}</div>
          </div>
        ) : (
          <div className="py-8 text-sm text-slate-400">데이터 없음</div>
        )}
      </div>
    </Shell>
  );

  const BoardCard: React.FC<{ title: string; items: BriefPost[]; loading?: boolean }> = ({
    title,
    items,
    loading,
  }) => (
    <Shell
      header={title}
      headerRight={
        <button
          onClick={() => navigate(ROUTE_BOARD)}
          className="rounded-full bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700"
          title="게시판으로 이동"
        >
          더보기
        </button>
      }
    >
      <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto">
        {loading && <li className="px-5 py-4 text-sm text-slate-500">불러오는 중…</li>}
        {!loading && items.length === 0 && (
          <li className="px-5 py-10 text-center text-sm text-slate-400">게시글이 없습니다.</li>
        )}
        {!loading &&
          items.map((p) => (
            <li key={p.no}>
              <button
                onClick={() => navigate(`/board/${p.no}`)}
                className="block w-full px-5 py-3 text-left hover:bg-slate-50"
                title={p.title}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{p.title}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      작성자 {p.author_name} · {new Date(p.created_at).toLocaleDateString()}
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

  const EquipGroupCard: React.FC<{ group: EquipGroupSummary }> = ({ group }) => {
    const modelEntries = Object.entries(group.model_counts ?? {});
    return (
      <div className="rounded-xl bg-sky-50/70 px-4 py-3 ring-1 ring-sky-100">
        <div className="text-sm font-semibold text-sky-800">{group.name}</div>

        <div className="mt-2 space-y-1 text-sm text-slate-700">
          {(["waiting", "processing", "done"] as const).map((key) => {
            const value = group.status_counts?.[key] ?? 0;
            if (!value) return null;
            return (
              <div key={key} className="flex items-center justify-between">
                <span className="text-slate-600">{STATUS_LABELS[key]}</span>
                <span className="font-semibold text-slate-900">{value}대</span>
              </div>
            );
          })}
        </div>

        {modelEntries.length > 0 && (
          <div className="mt-3 border-t border-sky-100 pt-2">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-700">
              {modelEntries.map(([model, count]) => (
                <div key={model} className="flex items-center justify-between gap-2">
                  <span className="truncate text-slate-600">{model}</span>
                  <span className="shrink-0 font-semibold text-slate-900">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {Object.keys(group.status_counts ?? {}).length === 0 && modelEntries.length === 0 && (
          <div className="mt-2 text-sm text-slate-500">장비 데이터 없음</div>
        )}
      </div>
    );
  };

  /* =========================
     좌측 사이드바(트리)
     ========================= */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    // 기본: 현황/로그/출근 열어두기
    return { status: true, logs: true, attendance: true };
  });

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const Sidebar: React.FC = () => (
    <aside className="sticky top-4 self-start max-h-[calc(100vh-32px)]">
      <Shell header="빠른 이동">
        <div className="px-4 pb-4 pt-3">
          <div className="mb-3 text-xs text-slate-500">카테고리를 열어 이동하세요.</div>

          <div className="space-y-2">
            {NAV_GROUPS.map((g) => {
              const isOpen = !!openGroups[g.key];
              return (
                <div key={g.key} className="rounded-xl bg-white ring-1 ring-slate-100">
                  <button
                    onClick={() => toggleGroup(g.key)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-sky-400" />
                      <span className="text-sm font-semibold text-slate-900">{g.label}</span>
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700 ring-1 ring-sky-100">
                        {g.items.length}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-slate-500">
                      {isOpen ? "접기" : "펼치기"}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-2 pb-2">
                      {g.items.map((it) => (
                        <button
                          key={it.to + it.label}
                          onClick={() => navigate(it.to)}
                          className="mt-1 w-full rounded-lg px-3 py-2 text-left hover:bg-sky-50"
                        >
                          <div className="text-sm font-semibold text-slate-900">{it.label}</div>
                          {it.desc && <div className="text-xs text-slate-500">{it.desc}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-sky-100">
            페이지가 늘어나면 NAV_GROUPS에만 추가하면 됩니다.
          </div>
        </div>
      </Shell>
    </aside>
  );

  /* =========================
     렌더
     ========================= */
  return (
    <div className="min-h-screen bg-slate-50 px-3 py-5 text-sm">
      {/* ✅ 가로 폭을 살짝 줄임: max-w-5xl */}
      <div className="mx-auto w-full max-w-5xl">
        {/* 상단 바 */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="rounded-2xl bg-white px-4 py-2 shadow-sm ring-1 ring-sky-100">
              <div className="text-sm font-semibold text-slate-900">시스템 생산실</div>
              <div className="text-xs text-slate-500">
                {userName && userName.trim() ? `${userName} 님` : "사용자"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setAttErrMsg(null);
                setAttOpen(true);
              }}
              className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
              title="출근 체크"
            >
              출근 체크
            </button>

            <button
              onClick={() => navigate(ROUTE_ATTENDANCE)}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-sky-100 hover:bg-sky-50"
              title="출근 기록 보기"
            >
              출근 기록
            </button>

            <button
              onClick={handleLogout}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-sky-100 hover:bg-sky-50"
              title="로그아웃"
            >
              로그아웃
            </button>
          </div>
        </div>

        {/* 저장 성공 메시지 */}
        {attOkMsg && (
          <div className="mb-3 rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700 ring-1 ring-emerald-100">
            {attOkMsg}
          </div>
        )}

        {/* ✅ 좌측 사이드바 + 메인 콘텐츠 */}
        <div className="grid items-start grid-cols-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <Sidebar />

          {/* 메인 콘텐츠 */}
          <main className="space-y-5">
            {/* 공지/변경점 */}
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <BoardCard title="공지사항" items={notices} loading={brdLoading} />
              <BoardCard title="적용사항" items={changes} loading={brdLoading} />
            </div>
            {brdErr && (
              <div className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700 ring-1 ring-red-100">
                {brdErr}
              </div>
            )}

            {/* 본사/진우리 전체 자리 요약 */}
            <Shell header="본사, 진우리 전체 자리 현황">
              <div className="px-5 pb-4 pt-3">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-xl bg-sky-50/70 px-4 py-4 ring-1 ring-sky-100">
                    <div className="text-base font-semibold text-sky-800">본사</div>
                    {capLoading ? (
                      <div className="mt-3 h-8 w-44 animate-pulse rounded bg-sky-100" />
                    ) : !capHead ? (
                      <div className="mt-2 text-sm text-slate-500">데이터 없음</div>
                    ) : (
                      <>
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-2xl font-extrabold text-slate-900">
                            {headTotals.used}
                          </span>
                          <span className="text-lg font-semibold text-slate-500">
                            / {headTotals.totalCapacity}
                          </span>
                          <span className="text-sm text-slate-600">대 사용</span>
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          남은 자리 {headTotals.remaining}개
                        </div>
                      </>
                    )}
                  </div>

                  <div className="rounded-xl bg-sky-50/70 px-4 py-4 ring-1 ring-sky-100">
                    <div className="text-base font-semibold text-sky-800">진우리</div>
                    {capLoading ? (
                      <div className="mt-3 h-8 w-44 animate-pulse rounded bg-sky-100" />
                    ) : (
                      <>
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-2xl font-extrabold text-slate-900">
                            {jinTotals.used}
                          </span>
                          <span className="text-lg font-semibold text-slate-500">
                            / {jinTotals.totalCapacity}
                          </span>
                          <span className="text-sm text-slate-600">대 사용</span>
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          남은 자리 {jinTotals.remaining}개
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {capErr && <div className="mt-3 text-sm text-red-600">{capErr}</div>}
              </div>
            </Shell>

            {/* 동/사이트별 생산 상태 + 모델 */}
            <Shell header="동 / 사이트별 생산 상태 · 모델 현황">
              <div className="px-5 pb-4 pt-3">
                {equipLoading ? (
                  <div className="py-4 text-sm text-slate-500">불러오는 중…</div>
                ) : equipErr ? (
                  <div className="py-4 text-sm text-red-600">{equipErr}</div>
                ) : !equipSummary ? (
                  <div className="py-4 text-sm text-slate-500">데이터 없음</div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-sky-800">
                        동별 현황 (A동 / B동 / I라인)
                      </div>
                      {equipSummary.buildings.map((g) => (
                        <EquipGroupCard key={g.name} group={g} />
                      ))}
                    </div>

                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-sky-800">
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

            {/* 본사 A/B/I 카드 */}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              <CapacityCard title="본사 A동" data={capHead?.A} loading={capLoading} />
              <CapacityCard title="본사 B동" data={capHead?.B} loading={capLoading} />
              <CapacityCard title="본사 I동" data={capHead?.I} loading={capLoading} />
            </div>
          </main>
        </div>
      </div>

      {/* 출근 체크 모달 */}
      {attOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-sky-100">
            <div className="bg-gradient-to-r from-sky-50 to-white px-5 py-4">
              <div className="text-base font-semibold text-slate-900">출근 체크</div>
              <div className="mt-1 text-xs text-slate-600">
                아래 옵션 중 하나를 선택해 기록하세요.
              </div>
            </div>

            <div className="space-y-3 px-5 py-5">
              <button
                disabled={attSaving}
                onClick={() => saveAttendance(1)}
                className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
              >
                출근 (1)
              </button>

              <button
                disabled={attSaving}
                onClick={() => saveAttendance(2)}
                className="w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-60"
              >
                오전 출근 (2)
              </button>

              <button
                disabled={attSaving}
                onClick={() => saveAttendance(3)}
                className="w-full rounded-xl bg-sky-400 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
              >
                오후 출근 (3)
              </button>

              <div className="pt-1">
                <button
                  disabled={attSaving}
                  onClick={() => setAttOpen(false)}
                  className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-sky-100 hover:bg-sky-50 disabled:opacity-60"
                >
                  닫기
                </button>
              </div>

              {attErrMsg && (
                <div className="rounded-xl bg-red-50 px-4 py-2 text-xs text-red-700 ring-1 ring-red-100">
                  {attErrMsg}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainPage;
