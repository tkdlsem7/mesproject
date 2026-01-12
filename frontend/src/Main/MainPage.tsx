// src/Main/MainPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../lib/AuthContext"; // ✅ 전역 auth/이름 가져오기

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
  const location = useLocation();

  // ✅ 전역 로그인 정보(AuthContext)에서 이름/권한 가져오기
  const { manager: ctxManager, auth, logout } = useAuth();

  // ✅ 표시할 이름: prop(userName)이 있으면 우선, 없으면 전역 manager 사용
  const displayName = userName && userName.trim() ? userName.trim() : (ctxManager ?? "사용자");

  /* =========================
     라우팅 상수
     ========================= */
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
  const ROUTE_ACCOUNT_EDIT = "/account/edit";

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
        items: [
          { label: "Option Configuration", desc: "옵션/체크리스트", to: ROUTE_OPTIONS },
          { label: "회원정보 수정", desc: "비밀번호/이름/부서 변경", to: ROUTE_ACCOUNT_EDIT },
        ],
      },
      {
        key: "board",
        label: "게시판",
        items: [{ label: "Board", desc: "공지/적용사항", to: ROUTE_BOARD }],
      },
      {
        key: "attendance",
        label: "출근",
        items: [
          { label: "출근 기록", desc: "기록 조회", to: ROUTE_ATTENDANCE },
          { label: "라인 출입 현황", desc: "현재 출입자", to: ROUTE_LINE_ACCESS },
        ],
      },
    ],
    [
      ROUTE_ACCOUNT_EDIT,
      ROUTE_ATTENDANCE,
      ROUTE_BOARD,
      ROUTE_CALENDAR,
      ROUTE_DASHBOARD,
      ROUTE_LINE_ACCESS,
      ROUTE_LOG_CHART,
      ROUTE_LOG_TABLE,
      ROUTE_MACHINE_MOVING,
      ROUTE_OPTIONS,
      ROUTE_ROW,
      ROUTE_TROUBLESHOOT,
    ]
  );

  /* =========================
     ✅ 권한 가드 이동 함수
     - 장비이동 / Row data 페이지는 auth >= 1 이어야 이동 가능
     ========================= */
  const guardedNavigate = (to: string) => {

    const authLabel = auth === null ? "null" : String(auth);
    const needsAuth1 = to === ROUTE_MACHINE_MOVING || to === ROUTE_ROW;
    const needsAuth2 = to === ROUTE_OPTIONS;
    // auth가 null이면 0처럼 취급(미로그인/미설정)
    const currentAuth = auth ?? 0;

    if (needsAuth1 && currentAuth < 1) {
      // 요청대로: 가공 없이 "받아온 상태" 그대로 출력
      alert(`권한이 부족합니다.\n이름: ${displayName}\n권한: ${authLabel}`);
      return;
    }


    if (needsAuth2 && currentAuth < 2) {
      alert(`권한이 부족합니다.\n이름: ${displayName}\n권한: ${authLabel}`);
      return;
    }

    navigate(to);
  };

  /* =========================
     로그아웃
     ========================= */
  const handleLogout = () => {
    try {
      // ✅ AuthContext의 logout()이 localStorage 정리까지 함
      logout();
    } catch {}

    // 혹시 sessionStorage를 쓰는 경우 대비
    try {
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
    const t = window.setTimeout(() => setAttOkMsg(null), 2500);
    return () => window.clearTimeout(t);
  }, [attOkMsg]);

  /* =========================
     데이터 상태
     ========================= */
  const [capHead, setCapHead] = useState<CapacityRes | null>(null); // 본사
  const [capJin, setCapJin] = useState<CapacityRes | null>(null); // 진우리
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
  const jinCapApi = summarizeCapacity(capJin).totalCapacity;
  const jinTotalCapacity = jinCapApi > 0 ? jinCapApi : 70;

  const jinEquipUsed =
    equipSummary?.sites?.find((g) => g.name === "진우리")?.status_counts
      ? Object.values(equipSummary!.sites.find((g) => g.name === "진우리")!.status_counts).reduce(
          (sum, v) => sum + v,
          0
        )
      : 0;

  const jinTotals = {
    totalCapacity: jinTotalCapacity,
    used: jinEquipUsed,
    remaining: Math.max(jinTotalCapacity - jinEquipUsed, 0),
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
  const Shell: React.FC<{
    children: React.ReactNode;
    className?: string;
    header?: string;
    headerRight?: React.ReactNode;
    badge?: string;
  }> = ({ children, className, header, headerRight, badge }) => (
    <section
      className={[
        "rounded-3xl bg-white shadow-sm ring-1 ring-slate-200/60",
        className ?? "",
      ].join(" ")}
    >
      <div className="h-2 rounded-t-3xl bg-gradient-to-r from-sky-200 via-white to-orange-200" />
      {header && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-7 py-5">
          <div className="flex items-center gap-2">
            <h3 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900">
              {header}
            </h3>
            {badge && (
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">
                {badge}
              </span>
            )}
          </div>
          {headerRight}
        </div>
      )}
      {children}
    </section>
  );

  const CapacityCard: React.FC<{
    title: string;
    data?: Building;
    loading?: boolean;
    className?: string;
  }> = ({ title, data, loading, className }) => (
    <section
      className={[
        "rounded-3xl bg-white shadow-sm ring-1 ring-slate-200/60",
        "px-7 py-7",
        className ?? "",
      ].join(" ")}
    >
      <div className="text-center">
        <div className="mb-3 text-lg font-extrabold text-slate-900">{title}</div>

        {loading ? (
          <div className="py-10 text-base text-slate-500">불러오는 중…</div>
        ) : data ? (
          <div className="space-y-2">
            <div className="text-4xl font-extrabold text-slate-900">
              {data.used}{" "}
              <span className="text-xl font-semibold text-slate-500">/ {data.capacity}</span>
            </div>
            <div className="text-base text-slate-600">남은자리 : {data.remaining}</div>
          </div>
        ) : (
          <div className="py-10 text-base text-slate-400">데이터 없음</div>
        )}
      </div>
    </section>
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
          className="rounded-full bg-sky-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
          title="게시판으로 이동"
          type="button"
        >
          더보기
        </button>
      }
    >
      <ul className="max-h-52 divide-y divide-slate-100 overflow-y-auto no-scrollbar">
        {loading && <li className="px-7 py-4 text-base text-slate-500">불러오는 중…</li>}
        {!loading && items.length === 0 && (
          <li className="px-7 py-10 text-center text-base text-slate-400">게시글이 없습니다.</li>
        )}
        {!loading &&
          items.map((p) => (
            <li key={p.no}>
              <button
                onClick={() => navigate(`/board/${p.no}`)}
                className="block w-full px-7 py-3 text-left hover:bg-slate-50"
                title={p.title}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-slate-900">{p.title}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      작성자 {p.author_name} · {new Date(p.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-sky-50 px-3 py-1.5 text-sm text-sky-700 ring-1 ring-sky-200">
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
    const hasStatus = Object.keys(group.status_counts ?? {}).length > 0;
    const hasModel = modelEntries.length > 0;

    return (
      <div className="rounded-2xl bg-slate-50 px-5 py-4 ring-1 ring-slate-200/60">
        <div className="text-base font-extrabold text-slate-900">{group.name}</div>

        <div className="mt-3 space-y-2 text-base text-slate-700">
          {(["waiting", "processing", "done"] as const).map((key) => {
            const value = group.status_counts?.[key] ?? 0;
            if (!value) return null;
            return (
              <div key={key} className="flex items-center justify-between">
                <span className="text-slate-600">{STATUS_LABELS[key]}</span>
                <span className="font-extrabold text-slate-900">{value}대</span>
              </div>
            );
          })}
        </div>

        {hasModel && (
          <div className="mt-4 border-t border-slate-200/60 pt-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-slate-700">
              {modelEntries.map(([model, count]) => (
                <div key={model} className="flex items-center justify-between gap-2">
                  <span className="truncate text-slate-600">{model}</span>
                  <span className="shrink-0 font-extrabold text-slate-900">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!hasStatus && !hasModel && (
          <div className="mt-3 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-500 ring-1 ring-slate-200/60">
            장비 데이터 없음
          </div>
        )}
      </div>
    );
  };

  /* =========================
     좌측 사이드바(트리) 상태
     ========================= */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    return { status: true, logs: true, attendance: true };
  });

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ✅ 사이드바: "페이지 이동 기능 + auth 가드"
  const Sidebar: React.FC = () => {
    const initial = displayName.slice(0, 1);
    const activePath = location.pathname;

    return (
      <aside className="h-full">
        <div className="px-5 pb-4 pt-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-400 text-sm font-extrabold text-white ring-1 ring-white/10">
              {initial}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold tracking-wide text-slate-300">시스템 생산실</div>
              <div className="truncate text-sm font-bold text-white">{displayName} 님</div>
            </div>
          </div>
        </div>

        <div className="h-px bg-slate-700/60" />

        <div className="px-4 pb-4 pt-4">
          <div className="mb-3 text-xs font-semibold text-slate-300">
            페이지 이동 <span className="ml-2 font-normal text-slate-400">카테고리를 열어 선택하세요.</span>
          </div>

          <div className="space-y-2">
            {NAV_GROUPS.map((g) => {
              const isOpen = !!openGroups[g.key];
              return (
                <div
                  key={g.key}
                  className="overflow-hidden rounded-2xl bg-slate-800/60 ring-1 ring-white/5"
                >
                  <button
                    onClick={() => toggleGroup(g.key)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                    type="button"
                  >
                    <span className="text-sm font-extrabold text-slate-100">{g.label}</span>
                    <span className="text-lg font-bold text-slate-300">{isOpen ? "−" : "+"}</span>
                  </button>

                  {isOpen && (
                    <div className="space-y-1 px-2 pb-2">
                      {g.items.map((it) => {
                        const active = activePath === it.to;
                        return (
                          <button
                            key={it.to}
                            onClick={() => guardedNavigate(it.to)} // ✅ 여기서 권한 체크 후 이동
                            type="button"
                            className={[
                              "w-full rounded-xl px-3 py-2 text-left transition",
                              active
                                ? "bg-sky-600 text-white shadow-sm"
                                : "bg-transparent text-slate-200 hover:bg-slate-700/60",
                            ].join(" ")}
                          >
                            <div className="text-sm font-bold">{it.label}</div>
                            <div className={active ? "text-xs text-sky-100" : "text-xs text-slate-400"}>
                              {it.desc}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3 rounded-2xl bg-slate-800/40 px-3 py-2 text-xs text-slate-300 ring-1 ring-slate-700">
            메뉴는 NAV_GROUPS에 추가하면 됩니다.
          </div>
        </div>

        <div className="h-10 bg-gradient-to-r from-teal-500/20 via-sky-500/20 to-purple-500/20" />
      </aside>
    );
  };

  /* =========================
     렌더
     ========================= */
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-slate-50 to-sky-50 px-3 py-4 text-sm">
      <div className="mx-auto w-full max-w-[1480px] 2xl:max-w-[1680px]">
        <div className="overflow-hidden rounded-3xl bg-white/70 shadow-xl ring-1 ring-slate-200/70 backdrop-blur lg:h-[calc(100vh-32px)]">
          <div className="h-2 bg-gradient-to-r from-teal-400 via-sky-500 to-fuchsia-500" />

          <div className="grid h-full grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
            {/* 좌측 */}
            <div className="bg-slate-900 lg:border-r lg:border-white/10 lg:overflow-y-auto no-scrollbar">
              <Sidebar />
            </div>

            {/* 우측 */}
            <main className="bg-white/35 p-4 md:p-6 lg:overflow-y-auto no-scrollbar space-y-6">
              <section className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-500">MES</div>
                  <div className="text-2xl font-extrabold tracking-tight text-slate-900">
                    메인 대시보드
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {displayName} · 생산 현황 요약
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      setAttErrMsg(null);
                      setAttOpen(true);
                    }}
                    className="rounded-full bg-gradient-to-r from-sky-600 to-teal-600 px-4 py-2 text-xs font-extrabold text-white shadow-sm hover:from-sky-700 hover:to-teal-700"
                    type="button"
                  >
                    출근 체크
                  </button>

                  <button
                    onClick={() => navigate(ROUTE_ATTENDANCE)}
                    className="rounded-full bg-white/80 px-4 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200/70 hover:bg-white"
                    type="button"
                  >
                    출근 기록
                  </button>

                  <button
                    onClick={() => navigate(ROUTE_ACCOUNT_EDIT)}
                    className="rounded-full bg-white/80 px-4 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200/70 hover:bg-white"
                    type="button"
                  >
                    회원정보 수정
                  </button>

                  <button
                    onClick={handleLogout}
                    className="rounded-full bg-white/80 px-4 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200/70 hover:bg-white"
                    type="button"
                  >
                    로그아웃
                  </button>
                </div>
              </section>

              {attOkMsg && (
                <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-100">
                  {attOkMsg}
                </div>
              )}

              {capErr && (
                <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
                  {capErr}
                </div>
              )}
              {equipErr && (
                <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
                  {equipErr}
                </div>
              )}
              {brdErr && (
                <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
                  {brdErr}
                </div>
              )}

              <Shell header="자리 요약 (본사 / 진우리)" badge="Capacity">
                <div className="px-7 pb-7 pt-5">
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 px-6 py-5 ring-1 ring-slate-200/60">
                      <div className="text-lg font-extrabold text-slate-900">본사</div>
                      {capLoading ? (
                        <div className="mt-4 h-10 w-52 animate-pulse rounded bg-slate-200/60" />
                      ) : !capHead ? (
                        <div className="mt-3 text-base text-slate-500">데이터 없음</div>
                      ) : (
                        <>
                          <div className="mt-3 flex items-baseline gap-2">
                            <span className="text-3xl font-extrabold text-slate-900">
                              {headTotals.used}
                            </span>
                            <span className="text-xl font-semibold text-slate-500">
                              / {headTotals.totalCapacity}
                            </span>
                            <span className="text-base text-slate-600">대 사용</span>
                          </div>
                          <div className="mt-1.5 text-base text-slate-500">
                            남은 자리 {headTotals.remaining}개
                          </div>
                        </>
                      )}
                    </div>

                    <div className="rounded-2xl bg-slate-50 px-6 py-5 ring-1 ring-slate-200/60">
                      <div className="text-lg font-extrabold text-slate-900">진우리</div>
                      {capLoading ? (
                        <div className="mt-4 h-10 w-52 animate-pulse rounded bg-slate-200/60" />
                      ) : (
                        <>
                          <div className="mt-3 flex items-baseline gap-2">
                            <span className="text-3xl font-extrabold text-slate-900">
                              {jinTotals.used}
                            </span>
                            <span className="text-xl font-semibold text-slate-500">
                              / {jinTotals.totalCapacity}
                            </span>
                            <span className="text-base text-slate-600">대 사용</span>
                          </div>
                          <div className="mt-1.5 text-base text-slate-500">
                            남은 자리 {jinTotals.remaining}개
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Shell>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <BoardCard title="공지사항" items={notices} loading={brdLoading} />
                <BoardCard title="적용사항" items={changes} loading={brdLoading} />
              </div>

              <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_520px] items-stretch">
                <Shell
                  header="동 / 사이트별 생산 상태 · 모델 현황"
                  badge="Summary"
                  className="h-full"
                >
                  <div className="px-7 pb-7 pt-5">
                    {equipLoading ? (
                      <div className="py-6 text-base text-slate-500">불러오는 중…</div>
                    ) : !equipSummary ? (
                      <div className="py-6 text-base text-slate-500">데이터 없음</div>
                    ) : (
                      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        <div className="space-y-4">
                          <div className="text-sm font-extrabold text-slate-800">
                            동별 현황 (A동 / B동 / I라인)
                          </div>
                          {equipSummary.buildings.map((g) => (
                            <EquipGroupCard key={g.name} group={g} />
                          ))}
                        </div>

                        <div className="space-y-4">
                          <div className="text-sm font-extrabold text-slate-800">
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

                <div className="grid h-full grid-cols-1 gap-6 md:grid-cols-3 2xl:grid-cols-1 auto-rows-fr">
                  <CapacityCard className="h-full" title="본사 A동" data={capHead?.A} loading={capLoading} />
                  <CapacityCard className="h-full" title="본사 B동" data={capHead?.B} loading={capLoading} />
                  <CapacityCard className="h-full" title="본사 I동" data={capHead?.I} loading={capLoading} />
                </div>
              </div>

              {/* 스크롤바 숨김용 CSS */}
              <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
              `}</style>
            </main>
          </div>
        </div>
      </div>

      {/* 출근 체크 모달 */}
      {attOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-slate-200/70">
            <div className="bg-gradient-to-r from-sky-50 to-white px-6 py-5">
              <div className="text-base font-semibold text-slate-900">출근 체크</div>
              <div className="mt-1 text-xs text-slate-600">아래 옵션 중 하나를 선택해 기록하세요.</div>
            </div>

            <div className="space-y-3 px-6 py-6">
              <button
                disabled={attSaving}
                onClick={() => saveAttendance(1)}
                className="w-full rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
              >
                출근 (1)
              </button>

              <button
                disabled={attSaving}
                onClick={() => saveAttendance(2)}
                className="w-full rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-60"
              >
                오전 출근 (2)
              </button>

              <button
                disabled={attSaving}
                onClick={() => saveAttendance(3)}
                className="w-full rounded-2xl bg-sky-400 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
              >
                오후 출근 (3)
              </button>

              <div className="pt-1">
                <button
                  disabled={attSaving}
                  onClick={() => setAttOpen(false)}
                  className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200/70 hover:bg-slate-50 disabled:opacity-60"
                >
                  닫기
                </button>
              </div>

              {attErrMsg && (
                <div className="rounded-2xl bg-red-50 px-4 py-2 text-xs text-red-700 ring-1 ring-red-100">
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
