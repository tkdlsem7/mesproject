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
  record_type: number; // 1=출근, 2=오전, 3=오후
  record_label?: string | null;
  checked_at: string;
};

type LogsResponse = {
  items: AttendanceRow[];
};

type RosterUser = {
  user_id: string;
  user_name?: string | null;
  dept?: string | null;
};

type RosterResponse = {
  items: RosterUser[];
};

/* ------------------ 팀/정원 ------------------ */
const TEAMS = ["시스템생산실", "통합생산실", "생산물류팀", "파트생산팀"] as const;

const TEAM_TOTAL: Record<(typeof TEAMS)[number], number> = {
  시스템생산실: 20,
  통합생산실: 10,
  생산물류팀: 7,
  파트생산팀: 7,
};

/* ------------------ 유틸 ------------------ */
const toYMD = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const addDays = (ymd: string, delta: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + delta);
  return toYMD(dt);
};

const fmtTime = (iso: string) => {
  const dt = new Date(iso);
  return dt.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const recordLabel = (rt: number, fallback?: string | null) => {
  if (fallback) return fallback;
  if (rt === 1) return "출근";
  if (rt === 2) return "오전 출근";
  if (rt === 3) return "오후 출근";
  return "미출근";
};

const pillClass = (rt: number) => {
  // pill(상태칩) 색
  if (rt === 1) return "bg-sky-100 text-sky-800 ring-1 ring-sky-200";
  if (rt === 2) return "bg-blue-100 text-blue-800 ring-1 ring-blue-200";
  if (rt === 3) return "bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200";
  return "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
};

const rowBgClass = (rt: number) => {
  if (rt === 1) return "bg-emerald-100"; // 출근
  if (rt === 2) return "bg-amber-100";   // 오전
  if (rt === 3) return "bg-violet-100";  // 오후
  return "bg-slate-100";                 // 미출근
};

type PersonRow = {
  user_id: string;
  user_name: string;
  dept: (typeof TEAMS)[number];
  record_type: number; // 0=미출근, 1/2/3=출근유형
  record_label: string;
  checked_at?: string;
  time: string; // 없으면 "-"
  level: number; // 요청: 전부 1
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

  // 1) 로스터(팀 인원) 로드: 최초 1회
  // ✅ 백엔드에 /api/attendance/roster 가 있어야 “미출근 회색 + 전원 표시” 가능
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

  // 2) 당일 로그 로드: day 변경 시
  const fetchLogs = async () => {
    setLoading(true);
    setErr("");
    try {
      // from_date/to_date 방식(현재 서버 로그상 OK)
      try {
        const res = await axios.get<LogsResponse>(`${API_BASE}/attendance/logs`, {
          params: {
            from_date: day,
            to_date: day,
            sort: "time_desc",
            limit: 2000, // ✅ 백엔드 상한에 맞춤
          },
          timeout: 8000,
        });
        setRawLogs(res.data.items || []);
      } catch (e1: any) {
        // fallback(day 파라미터 방식이 남아있는 환경일 경우)
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

  // 로스터를 팀별로 정리
  const rosterByTeam = useMemo(() => {
    const map: Record<(typeof TEAMS)[number], RosterUser[]> = {
      시스템생산실: [],
      통합생산실: [],
      생산물류팀: [],
      파트생산팀: [],
    };

    for (const u of roster) {
      const dept = (u.dept || "").trim() as (typeof TEAMS)[number];
      if (!TEAMS.includes(dept)) continue;
      map[dept].push(u);
    }

    // 이름순 정렬
    for (const t of TEAMS) {
      map[t].sort((a, b) =>
        (a.user_name || a.user_id || "").localeCompare(b.user_name || b.user_id || "", "ko")
      );
    }

    return map;
  }, [roster]);

  // 로그를 "유저별 최신 1건"으로 정리
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

  // 최종 보드 데이터: 로스터 전체를 기본으로 깔고, 출근한 사람만 값 채움
  const boardData = useMemo(() => {
    const byTeam: Record<(typeof TEAMS)[number], PersonRow[]> = {
      시스템생산실: [],
      통합생산실: [],
      생산물류팀: [],
      파트생산팀: [],
    };

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
            record_label: "미출근",
            time: "-",
            level: 1,
            is_present: false,
          };
        }

        return {
          user_id: log.user_id,
          user_name: (log.user_name || name).toString(),
          dept: team,
          record_type: log.record_type,
          record_label: recordLabel(log.record_type, log.record_label),
          checked_at: log.checked_at,
          time: fmtTime(log.checked_at),
          level: 1,
          is_present: true,
        };
      });

      // 정렬: 출근자 먼저(최신시간 우선), 그 다음 미출근(이름순)
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

    const presentCount: Record<(typeof TEAMS)[number], number> = {
      시스템생산실: byTeam.시스템생산실.filter((x) => x.is_present).length,
      통합생산실: byTeam.통합생산실.filter((x) => x.is_present).length,
      생산물류팀: byTeam.생산물류팀.filter((x) => x.is_present).length,
      파트생산팀: byTeam.파트생산팀.filter((x) => x.is_present).length,
    };

    return { byTeam, presentCount };
  }, [rosterByTeam, latestLogByUser]);

  const presentAll = useMemo(
    () => TEAMS.reduce((sum, t) => sum + (boardData.presentCount[t] || 0), 0),
    [boardData.presentCount]
  );

  const totalAll = useMemo(
    () => TEAMS.reduce((sum, t) => sum + (rosterByTeam[t]?.length || TEAM_TOTAL[t]), 0),
    [rosterByTeam]
  );

  /* ------------------ UI: 카드 ------------------ */
  const TeamCard: React.FC<{ team: (typeof TEAMS)[number] }> = ({ team }) => {
    const list = boardData.byTeam[team] || [];
    const present = boardData.presentCount[team] || 0;
    const total = (rosterByTeam[team]?.length || 0) || TEAM_TOTAL[team];

    return (
      <div className="w-[440px] shrink-0 rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
        {/* 헤더 */}
        <div className="px-5 py-4 bg-gradient-to-r from-sky-50 via-cyan-50 to-white border-b border-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-lg font-extrabold text-slate-800">{team}</div>
              <div className="mt-1 text-xs text-slate-500">
                기준일 {day} · 레벨은 임시로 전부 1
              </div>
            </div>

            <span className="shrink-0 rounded-full bg-orange-50 px-3 py-1 text-sm font-extrabold text-orange-700 ring-1 ring-orange-200">
              {present}/{total}
            </span>
          </div>

          {/* 범례 */}
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-600 ring-1 ring-slate-200">
              미출근(회색)
            </span>
            <span className="rounded-full bg-sky-100 px-2.5 py-1 font-bold text-sky-800 ring-1 ring-sky-200">
              출근
            </span>
            <span className="rounded-full bg-blue-100 px-2.5 py-1 font-bold text-blue-800 ring-1 ring-blue-200">
              오전
            </span>
            <span className="rounded-full bg-cyan-100 px-2.5 py-1 font-bold text-cyan-800 ring-1 ring-cyan-200">
              오후
            </span>
          </div>
        </div>

        {/* 리스트: 내부 스크롤 없음(페이지 전체 스크롤) */}
        <div className="p-4">
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden">
            <div className="grid grid-cols-[1fr_120px_80px] px-4 py-3 text-xs font-bold text-slate-500 bg-white border-b border-slate-200">
              <div>이름 / 상태</div>
              <div className="text-center">시간</div>
              <div className="text-center">레벨</div>
            </div>

            {list.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">
                {rosterLoading ? "로스터 불러오는 중..." : "표시할 인원이 없습니다."}
              </div>
            ) : (
              <div>
                {list.map((p) => (
                  <div
                    key={`${p.dept}-${p.user_id}`}
                    className={[
                      "grid grid-cols-[1fr_120px_80px] items-center px-4 py-3 border-b border-slate-200 last:border-b-0",
                      rowBgClass(p.record_type), // ✅ 행 전체 색상
                      "transition hover:brightness-[0.99]",
                    ].join(" ")}
                  >
                    <div className="min-w-0">
                      <div
                        className={[
                          "text-base font-extrabold whitespace-normal break-keep",
                          p.is_present ? "text-slate-800" : "text-slate-500",
                        ].join(" ")}
                      >
                        {p.user_name}
                      </div>

                      <div className="mt-1">
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold",
                            pillClass(p.record_type),
                          ].join(" ")}
                        >
                          {p.record_label}
                        </span>
                      </div>
                    </div>

                    <div
                      className={[
                        "text-center text-base font-extrabold",
                        p.is_present ? "text-slate-800" : "text-slate-400",
                      ].join(" ")}
                    >
                      {p.time}
                    </div>

                    <div className="text-center">
                      <span
                        className={[
                          "inline-flex items-center justify-center w-11 h-11 rounded-2xl font-extrabold ring-1",
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
            <div className="mt-3 rounded-2xl bg-sky-50 p-3 text-sm text-slate-700 ring-1 ring-sky-200">
              {String(rosterErr)}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[2000px] px-4 py-6">
        {/* 상단 바 */}
        <div className="mb-5 rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="px-6 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-2xl font-extrabold text-slate-800">
                  생산본부 라인 출입 여부
                </div>
                <div className="text-sm text-slate-500">
                  전원 표시(미출근 회색) + 상태별 “행 전체” 색상
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-slate-700 ring-1 ring-slate-200">
                    전체 {presentAll}/{totalAll}
                  </span>

                  {loading || rosterLoading ? (
                    <span className="rounded-full bg-sky-50 px-3 py-1 text-sm font-bold text-sky-700 ring-1 ring-sky-200">
                      불러오는 중...
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700 ring-1 ring-emerald-200">
                      업데이트 완료
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDay((d) => addDays(d, -1))}
                    className="h-10 w-10 rounded-2xl bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                    title="전날"
                  >
                    ‹
                  </button>

                  <input
                    type="date"
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                    className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-sky-200"
                  />

                  <button
                    onClick={() => setDay((d) => addDays(d, 1))}
                    className="h-10 w-10 rounded-2xl bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                    title="다음날"
                  >
                    ›
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDay(toYMD(new Date()))}
                    className="h-10 rounded-2xl bg-sky-600 px-5 text-sm font-extrabold text-white hover:bg-sky-700"
                  >
                    오늘
                  </button>

                  <button
                    onClick={() => {
                      fetchRoster();
                      fetchLogs();
                    }}
                    className="h-10 rounded-2xl bg-white px-5 text-sm font-extrabold text-slate-700 ring-1 ring-slate-200 hover:bg-sky-50"
                  >
                    새로고침
                  </button>

                  <button
                    onClick={() => nav("/main")}
                    className="h-10 rounded-2xl bg-white px-5 text-sm font-extrabold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                  >
                    메인
                  </button>
                </div>
              </div>
            </div>

            {err && (
              <div className="mt-4 rounded-2xl bg-sky-50 p-3 text-sm text-slate-700 ring-1 ring-sky-200">
                {String(err)}
              </div>
            )}
          </div>
        </div>

        {/* 보드: 가로 스크롤로 4팀 한 줄 유지 */}
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-5 min-w-[1850px]">
            <TeamCard team="시스템생산실" />
            <TeamCard team="통합생산실" />
            <TeamCard team="생산물류팀" />
            <TeamCard team="파트생산팀" />
          </div>
        </div>

        <div className="h-8" />
      </div>
    </div>
  );
}
