import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

// API_BASE는 다른 페이지와 동일 규칙
export const API_BASE =
  process.env.NODE_ENV === "production" ? "/api" : "http://localhost:8000/api";

type AccessLogRow = {
  id: number;
  person_type: "EMP" | "VISITOR";
  person_key: string;
  name: string;
  dept_or_company: string;
  site: string;
  building: string;
  event_type: "ENTER" | "EXIT";
  occurred_at: string; // ISO
  memo?: string | null;
};

const Shell: React.FC<{ header?: string; children: React.ReactNode }> = ({ header, children }) => (
  <section className="rounded-2xl bg-white shadow-sm ring-1 ring-sky-100">
    <div className="h-2 rounded-t-2xl bg-gradient-to-r from-sky-200 via-sky-100 to-sky-200" />
    {header && (
      <div className="border-b border-sky-100 px-5 py-3">
        <h3 className="text-lg font-semibold text-slate-900">{header}</h3>
      </div>
    )}
    {children}
  </section>
);

function toYMD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const LineAccessLogsPage: React.FC = () => {
  const navigate = useNavigate();

  const [rows, setRows] = useState<AccessLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 필터
  const [from, setFrom] = useState<string>(toYMD(new Date(Date.now() - 7 * 86400000)));
  const [to, setTo] = useState<string>(toYMD(new Date()));
  const [site, setSite] = useState("");
  const [building, setBuilding] = useState("");
  const [eventType, setEventType] = useState<"" | "ENTER" | "EXIT">("");
  const [name, setName] = useState("");
  const [deptOrCompany, setDeptOrCompany] = useState("");
  const [memo, setMemo] = useState("");

  const load = async () => {
    setErr(null);
    setLoading(true);
    try {
      const { data } = await axios.get<AccessLogRow[]>(`${API_BASE}/main/line-access/logs`, {
        params: {
          from: from || undefined,
          to: to || undefined,
          site: site || undefined,
          building: building || undefined,
          event_type: eventType || undefined,
          name: name.trim() || undefined,
          dept_or_company: deptOrCompany.trim() || undefined,
          memo: memo.trim() || undefined,
          limit: 500,
          offset: 0,
        },
        timeout: 10000,
      });

      setRows(data ?? []);
    } catch (e) {
      console.error(e);
      setErr("로그를 불러오지 못했습니다.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  // 최초 1회 자동 로드
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const viewRows = useMemo(() => rows, [rows]);

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-5 text-sm">
      <div className="mx-auto w-full max-w-6xl space-y-5">
        <Shell header="라인 출입/퇴실 로그">
          <div className="px-5 py-5 space-y-4">
            {/* 상단 액션 */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-500">기간/이름/부서(업체)/메모로 로그를 조회합니다.</div>
              <div className="flex gap-2">
                <button
                  onClick={() => navigate("/line-access/current")}
                  className="rounded-xl bg-slate-100 px-4 py-2 font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200"
                >
                  뒤로가기(현황)
                </button>
                <button
                  onClick={load}
                  className="rounded-xl bg-sky-600 px-4 py-2 font-semibold text-white hover:bg-sky-700"
                >
                  {loading ? "불러오는 중..." : "새로고침"}
                </button>
              </div>
            </div>

            {/* 필터 */}
            <div className="rounded-2xl bg-sky-50 ring-1 ring-sky-100 p-4">
              <div className="mb-3 text-sm font-semibold text-slate-900">검색 필터</div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
                <div className="md:col-span-2 grid grid-cols-2 gap-2">
                  <div>
                    <div className="mb-1 text-[11px] text-slate-600">From</div>
                    <input
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] text-slate-600">To</div>
                    <input
                      type="date"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-[11px] text-slate-600">site</div>
                  <input
                    value={site}
                    onChange={(e) => setSite(e.target.value)}
                    placeholder="본사/진우리"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>

                <div>
                  <div className="mb-1 text-[11px] text-slate-600">building</div>
                  <input
                    value={building}
                    onChange={(e) => setBuilding(e.target.value)}
                    placeholder="A동/B동/진우리"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>

                <div>
                  <div className="mb-1 text-[11px] text-slate-600">event</div>
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                  >
                    <option value="">전체</option>
                    <option value="ENTER">ENTER(입실)</option>
                    <option value="EXIT">EXIT(퇴실)</option>
                  </select>
                </div>

                <div>
                  <div className="mb-1 text-[11px] text-slate-600">이름</div>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="이름 일부"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>

                <div className="md:col-span-3">
                  <div className="mb-1 text-[11px] text-slate-600">부서/업체</div>
                  <input
                    value={deptOrCompany}
                    onChange={(e) => setDeptOrCompany(e.target.value)}
                    placeholder="부서 또는 업체명 일부"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>

                <div className="md:col-span-3">
                  <div className="mb-1 text-[11px] text-slate-600">비고</div>
                  <input
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="비고 내용 일부"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <button
                  onClick={load}
                  className="rounded-xl bg-orange-500 px-4 py-2 font-semibold text-white hover:bg-orange-600"
                >
                  조회
                </button>

                <button
                  onClick={() => {
                    setSite("");
                    setBuilding("");
                    setEventType("");
                    setName("");
                    setDeptOrCompany("");
                    setMemo("");
                  }}
                  className="rounded-xl bg-white px-4 py-2 font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                >
                  필터 초기화
                </button>

                <div className="ml-auto text-xs text-slate-500">
                  표시 건수: <span className="ml-1 font-semibold text-slate-800">{viewRows.length}</span>
                </div>
              </div>
            </div>

            {err && (
              <div className="rounded-xl bg-red-50 px-4 py-2 text-xs text-red-700 ring-1 ring-red-100">
                {err}
              </div>
            )}

            {/* 테이블 */}
            <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-100">
              <table className="min-w-[1050px] w-full bg-white">
                <thead className="bg-sky-50 text-xs text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">시간</th>
                    <th className="px-3 py-2 text-left">이벤트</th>
                    <th className="px-3 py-2 text-left">이름</th>
                    <th className="px-3 py-2 text-left">부서/업체</th>
                    <th className="px-3 py-2 text-left">site</th>
                    <th className="px-3 py-2 text-left">building</th>
                    <th className="px-3 py-2 text-left">비고</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 text-sm">
                  {viewRows.length === 0 && !loading && (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                        로그가 없습니다.
                      </td>
                    </tr>
                  )}

                  {viewRows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 text-slate-600">
                        {new Date(r.occurred_at).toLocaleString()}
                      </td>

                      <td className="px-3 py-2">
                        <span
                          className={
                            r.event_type === "ENTER"
                              ? "inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100"
                              : "inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-100"
                          }
                        >
                          {r.event_type === "ENTER" ? "ENTER(입실)" : "EXIT(퇴실)"}
                        </span>
                      </td>

                      <td className="px-3 py-2 font-semibold text-slate-900">{r.name}</td>
                      <td className="px-3 py-2 text-slate-700">{r.dept_or_company}</td>
                      <td className="px-3 py-2 text-slate-700">{r.site}</td>
                      <td className="px-3 py-2 text-slate-700">{r.building}</td>
                      <td className="px-3 py-2 text-slate-600 whitespace-pre-wrap">{r.memo || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        </Shell>
      </div>
    </div>
  );
};

export default LineAccessLogsPage;
