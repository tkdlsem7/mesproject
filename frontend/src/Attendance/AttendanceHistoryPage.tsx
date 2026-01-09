// src/Attendance/AttendanceHistoryPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export const API_BASE =
  process.env.NODE_ENV === "production" ? "/api" : "http://localhost:8000/api";

/* ------------------ 타입 ------------------ */
type AttendanceRow = {
  no: number;
  user_id: string;
  user_name?: string | null;
  dept?: string | null;
  record_type: number; // 1=출근, 2=오전, 3=오후 (표시에는 사용 안 함)
  record_label?: string | null;
  checked_at: string;
};

type LogsResponse = { items: AttendanceRow[] };

type RosterUser = {
  user_id: string;
  user_name?: string | null;
  dept?: string | null;
};

type RosterResponse = { items: RosterUser[] };

/* ------------------ 팀 목록 ------------------ */
const TEAMS = [
  "시스템생산1팀",
  "시스템생산2팀",
  "시스템생산3팀",
  "생산품질혁신팀",
  "생산솔루션팀",
  "생산물류팀",
  "파트생산팀",
] as const;

type Team = (typeof TEAMS)[number];

/* ------------------ 유틸 ------------------ */
const toYMD = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const weekdayKo = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString("ko-KR", { weekday: "short" }); // 예: "수"
};

const rowBgClass = (isPresent: boolean) =>
  isPresent ? "bg-emerald-100" : "bg-slate-100/70";

type PersonRow = {
  user_id: string;
  user_name: string;
  dept: Team;
  record_type: number; // 0=미출근, 1/2/3=출근유형
  checked_at?: string;
  level: number; // 임시 1
  is_present: boolean;
};

export default function AttendanceHistoryPage() {
  const nav = useNavigate();

  const [day, setDay] = useState<string>(() => toYMD(new Date()));

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterErr, setRosterErr] = useState<string>("");
  const [roster, setRoster] = useState<RosterUser[]>([]);

  const [rawLogs, setRawLogs] = useState<AttendanceRow[]>([]);

  const dayWk = useMemo(() => weekdayKo(day), [day]);

  /* ------------------ API ------------------ */
  const fetchRoster = async () => {
    setRosterLoading(true);
    setRosterErr("");
    try {
      const res = await axios.get<RosterResponse>(`${API_BASE}/attendance/roster`, {
        timeout: 8000,
      });
      setRoster(res.data.items || []);
    } catch (e: any) {
      setRosterErr(e?.response?.data || "팀 인원(로스터) 조회 실패");
      setRoster([]);
    } finally {
      setRosterLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    setErr("");
    try {
      try {
        const res = await axios.get<LogsResponse>(`${API_BASE}/attendance/logs`, {
          params: {
            from_date: day,
            to_date: day,
            sort: "time_desc",
            limit: 2000,
          },
          timeout: 8000,
        });
        setRawLogs(res.data.items || []);
      } catch {
        const res2 = await axios.get<LogsResponse>(`${API_BASE}/attendance/logs`, {
          params: { day, limit: 2000 },
          timeout: 8000,
        });
        setRawLogs(res2.data.items || []);
      }
    } catch (e: any) {
      setErr(e?.response?.data || "조회 중 오류가 발생했습니다.");
      setRawLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  /* ------------------ 데이터 가공 ------------------ */
  const rosterByTeam = useMemo(() => {
    const map = Object.fromEntries(TEAMS.map((t) => [t, [] as RosterUser[]])) as Record<
      Team,
      RosterUser[]
    >;

    for (const u of roster) {
      const dept = (u.dept || "").trim() as Team;
      if (!TEAMS.includes(dept)) continue;
      map[dept].push(u);
    }

    for (const t of TEAMS) {
      map[t].sort((a, b) =>
        (a.user_name || a.user_id || "").localeCompare(b.user_name || b.user_id || "", "ko")
      );
    }

    return map;
  }, [roster]);

  const latestLogByUser = useMemo(() => {
    const m = new Map<string, AttendanceRow>();
    for (const r of rawLogs) {
      const prev = m.get(r.user_id);
      if (!prev) {
        m.set(r.user_id, r);
        continue;
      }
      if (new Date(r.checked_at).getTime() > new Date(prev.checked_at).getTime()) {
        m.set(r.user_id, r);
      }
    }
    return m;
  }, [rawLogs]);

  const boardData = useMemo(() => {
    const byTeam = Object.fromEntries(TEAMS.map((t) => [t, [] as PersonRow[]])) as Record<
      Team,
      PersonRow[]
    >;

    for (const team of TEAMS) {
      const users = rosterByTeam[team] || [];

      const rows: PersonRow[] = users.map((u) => {
        const name = (u.user_name || "").trim() || u.user_id || "-";
        const log = latestLogByUser.get(u.user_id);

        if (!log) {
          return {
            user_id: u.user_id,
            user_name: name,
            dept: team,
            record_type: 0,
            level: 1,
            is_present: false,
          };
        }

        return {
          user_id: log.user_id,
          user_name: (log.user_name || name).toString(),
          dept: team,
          record_type: log.record_type,
          checked_at: log.checked_at,
          level: 1,
          is_present: true,
        };
      });

      rows.sort((a, b) => {
        if (a.is_present !== b.is_present) return a.is_present ? -1 : 1;

        if (a.is_present && b.is_present) {
          const ta = a.checked_at ? new Date(a.checked_at).getTime() : 0;
          const tb = b.checked_at ? new Date(b.checked_at).getTime() : 0;
          if (tb !== ta) return tb - ta;
        }
        return a.user_name.localeCompare(b.user_name, "ko");
      });

      byTeam[team] = rows;
    }

    const presentCount = Object.fromEntries(
      TEAMS.map((t) => [t, byTeam[t].filter((x) => x.is_present).length])
    ) as Record<Team, number>;

    return { byTeam, presentCount };
  }, [rosterByTeam, latestLogByUser]);

  /* ------------------ UI: 팀 카드 ------------------ */
  const TeamCard: React.FC<{ team: Team }> = ({ team }) => {
    const list = boardData.byTeam[team] || [];
    const present = boardData.presentCount[team] || 0;
    const total = rosterByTeam[team]?.length || 0;

    return (
      <div className="w-full rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
        {/* ✅ 카드 내부 '기준일' 날짜 제거 */}
        <div className="px-4 py-3 bg-gradient-to-r from-sky-50 via-cyan-50 to-white border-b border-slate-200">
          <div className="flex items-center justify-between gap-2">
            <div className="text-base font-extrabold text-slate-800">{team}</div>
            <span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-1 text-sm font-extrabold text-orange-700 ring-1 ring-orange-200">
              {present}/{total}
            </span>
          </div>
        </div>

        <div className="p-3">
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden">
            <div className="grid grid-cols-[1fr_68px] px-3 py-2.5 text-xs font-bold text-slate-500 bg-white border-b border-slate-200">
              <div>이름</div>
              <div className="text-center">레벨</div>
            </div>

            {list.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-slate-500">
                {rosterLoading ? "로스터 불러오는 중..." : "표시할 인원이 없습니다."}
              </div>
            ) : (
              <div>
                {list.map((p) => (
                  <div
                    key={`${p.dept}-${p.user_id}`}
                    className={[
                      "grid grid-cols-[1fr_68px] items-center px-3 py-2.5 border-b border-slate-200 last:border-b-0",
                      rowBgClass(p.is_present),
                      "transition hover:brightness-[0.99]",
                    ].join(" ")}
                  >
                    <div className="min-w-0">
                      <div
                        className={[
                          "text-sm font-extrabold whitespace-normal break-keep",
                          p.is_present ? "text-slate-800" : "text-slate-400",
                        ].join(" ")}
                      >
                        {p.user_name}
                      </div>
                    </div>

                    <div className="text-center">
                      <span
                        className={[
                          "inline-flex items-center justify-center w-10 h-10 rounded-2xl font-extrabold ring-1 text-base",
                          p.is_present
                            ? "bg-white text-slate-800 ring-slate-200"
                            : "bg-slate-100 text-slate-400 ring-slate-200",
                        ].join(" ")}
                      >
                        {p.level}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {rosterErr && (
            <div className="mt-2 rounded-2xl bg-sky-50 p-3 text-sm text-slate-700 ring-1 ring-sky-200">
              {String(rosterErr)}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[2400px] px-2 py-4">
        {/* 상단 바 */}
        <div className="mb-4 rounded-[28px] bg-white shadow-sm ring-1 ring-slate-200">
          <div className="px-6 py-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[auto_1fr_auto] lg:items-center">
              {/* ✅ LEFT: 날짜(유일한 날짜 표시) */}
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="date"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  className="h-14 rounded-2xl border border-slate-200 bg-white px-5 text-xl font-extrabold text-slate-700 outline-none focus:ring-2 focus:ring-sky-200"
                />
                <div className="h-14 px-4 rounded-2xl bg-slate-50 ring-1 ring-slate-200 flex items-center">
                  <span className="text-lg font-extrabold text-slate-700">{dayWk}요일</span>
                </div>
              </div>

              {/* ✅ CENTER: 타이틀 (중복 날짜 제거 → 날짜/부제 없음) */}
              <div className="text-center">
                <div className="text-4xl font-extrabold text-slate-800">
                  생산본부 자격 인증 현황
                </div>
              </div>

              {/* ✅ RIGHT: 오늘/새로고침 삭제, 메인만 유지 */}
              <div className="flex items-center justify-end">
                <button
                  onClick={() => nav("/main")}
                  className="h-14 rounded-2xl bg-white px-6 text-lg font-extrabold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                >
                  메인
                </button>
              </div>
            </div>

            {/* 에러만 표시 */}
            {err && (
              <div className="mt-4 rounded-2xl bg-sky-50 p-4 text-base text-slate-700 ring-1 ring-sky-200">
                {String(err)}
              </div>
            )}

            {/* 로딩은 텍스트로만 아주 작게(원치 않으면 이 줄도 삭제 가능) */}
            {(loading || rosterLoading) && (
              <div className="mt-2 text-center text-sm font-semibold text-slate-500">
                불러오는 중...
              </div>
            )}
          </div>
        </div>

        {/* ✅ 팀 카드: 1줄(한 행) 고정 */}
        <div className="overflow-x-auto pb-3">
          {/* auto-cols 로 각 카드 폭을 줄이고, 한 줄로만 흐르게 */}
          <div className="grid grid-flow-col auto-cols-[300px] gap-3 min-w-max">
            {TEAMS.map((t) => (
              <TeamCard key={t} team={t} />
            ))}
          </div>
        </div>

        <div className="h-6" />
      </div>
    </div>
  );
}
