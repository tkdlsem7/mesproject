// src/LineAccess/LineAccessCurrentPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

// CRA/Vite 공용: 환경변수 → 없으면 '/api'
export const API_BASE =
  process.env.NODE_ENV === "production" ? "/api" : "http://localhost:8000/api";

type LineAccessRow = {
  id: number;
  person_type: "EMP" | "VISITOR";
  person_key: string;
  name: string;
  dept_or_company: string;
  site: string;
  building: string;
  memo?: string | null;
  entered_at: string; // ISO
};

type UpsertPayload = {
  person_type: "EMP" | "VISITOR";
  person_key: string; // EMP: users.id / VISITOR: uuid(or 임의)
  name: string;
  dept_or_company: string; // EMP: dept / VISITOR: 업체명
  site: string;
  building: string;
  memo?: string;
};

type Employee = {
  id: string;
  name: string;
  dept?: string | null;
};

function makeUuid() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = (window as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const SITES = ["본사", "진우리"] as const;
const BUILDINGS_BY_SITE: Record<(typeof SITES)[number], string[]> = {
  본사: ["A동", "B동"],
  진우리: ["진우리"],
};

const EMP_DEPTS = ["시스템생산팀", "통합생산실", "생산물류팀", "파트생산팀"] as const;

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

const LineAccessCurrentPage: React.FC = () => {
  const navigate = useNavigate();

  const [rows, setRows] = useState<LineAccessRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // (선택) 필터 (서버 조회용)
  const [filterSite, setFilterSite] = useState("");
  const [filterBuilding, setFilterBuilding] = useState("");

  // ✅ 이름 필터(화면 표시용)
  const [filterName, setFilterName] = useState("");

  // 직원 선택용 (EMP)
  const [empDept, setEmpDept] = useState<(typeof EMP_DEPTS)[number] | "">("");
  const [empQuery, setEmpQuery] = useState(""); // 직원 목록 검색(입실 등록 영역)
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmp, setLoadingEmp] = useState(false);

  // 등록 폼
  const [form, setForm] = useState<UpsertPayload>({
    person_type: "EMP",
    person_key: "",
    name: "",
    dept_or_company: "",
    site: "본사",
    building: "A동",
    memo: "",
  });

  const canSubmit = useMemo(() => {
    return (
      form.person_key.trim() &&
      form.name.trim() &&
      form.dept_or_company.trim() &&
      form.site.trim() &&
      form.building.trim()
    );
  }, [form]);

  const load = async () => {
    setErr(null);
    try {
      setLoading(true);
      const { data } = await axios.get<LineAccessRow[]>(`${API_BASE}/main/line-access/current`, {
        params: {
          site: filterSite || undefined,
          building: filterBuilding || undefined,
        },
        timeout: 8000,
      });
      setRows(data ?? []);
    } catch (e) {
      console.error(e);
      setErr("현재 출입 현황을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 최초/서버필터 변경 시 조회 (이름 필터는 화면필터라서 load 트리거 안 함)
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSite, filterBuilding]);

  // site 변경 시 building 자동 보정
  useEffect(() => {
    const site = form.site as (typeof SITES)[number];
    const buildings = BUILDINGS_BY_SITE[site] ?? [];
    if (!buildings.includes(form.building)) {
      setForm((p) => ({ ...p, building: buildings[0] || "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.site]);

  // person_type 전환 시 폼 보정
  useEffect(() => {
    setErr(null);

    if (form.person_type === "VISITOR") {
      setEmpDept("");
      setEmpQuery("");
      setEmployees([]);
      setForm((p) => ({
        ...p,
        person_key: makeUuid(),
        name: "",
        dept_or_company: "",
      }));
    } else {
      // EMP
      setForm((p) => ({
        ...p,
        person_key: "",
        name: "",
        dept_or_company: "",
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.person_type]);

  // EMP: 부서/검색어 변경 시 직원 목록 로드 (간단 디바운스)
  useEffect(() => {
    if (form.person_type !== "EMP") return;

    if (!empDept) {
      setEmployees([]);
      setForm((p) => ({ ...p, dept_or_company: "", person_key: "", name: "" }));
      return;
    }

    const t = setTimeout(async () => {
      setErr(null);
      setLoadingEmp(true);
      try {
        const { data } = await axios.get<Employee[]>(`${API_BASE}/main/line-access/employees`, {
          params: {
            dept: empDept,
            q: empQuery.trim() ? empQuery.trim() : undefined,
            limit: 80,
          },
          timeout: 8000,
        });

        setEmployees(data ?? []);
        setForm((p) => ({
          ...p,
          dept_or_company: empDept,
          person_key: "",
          name: "",
        }));
      } catch (e) {
        console.error(e);
        setEmployees([]);
        setErr("직원 목록을 불러오지 못했습니다.");
      } finally {
        setLoadingEmp(false);
      }
    }, 250);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empDept, empQuery, form.person_type]);

  const onSelectEmployee = (empId: string) => {
    const emp = employees.find((x) => x.id === empId);
    if (!emp) {
      setForm((p) => ({ ...p, person_key: "", name: "" }));
      return;
    }
    setForm((p) => ({
      ...p,
      person_key: emp.id,
      name: emp.name,
      dept_or_company: empDept || p.dept_or_company,
    }));
  };

  const onEnter = async () => {
    if (!canSubmit) return;
    setErr(null);
    try {
      await axios.post(`${API_BASE}/main/line-access/enter`, form, { timeout: 8000 });

      if (form.person_type === "VISITOR") {
        setForm((p) => ({
          ...p,
          person_key: makeUuid(),
          name: "",
          dept_or_company: "",
          memo: "",
        }));
      } else {
        setForm((p) => ({
          ...p,
          person_key: "",
          name: "",
          dept_or_company: empDept || p.dept_or_company,
          memo: "",
        }));
      }

      await load();
    } catch (e) {
      console.error(e);
      setErr("입실 등록에 실패했습니다.");
    }
  };

  const onExit = async (r: LineAccessRow) => {
    setErr(null);
    try {
      await axios.post(
        `${API_BASE}/main/line-access/exit`,
        { person_type: r.person_type, person_key: r.person_key },
        { timeout: 8000 }
      );
      await load();
    } catch (e) {
      console.error(e);
      setErr("퇴실 처리에 실패했습니다.");
    }
  };

  // ✅ 화면 표시용 이름 필터 적용
  const viewRows = useMemo(() => {
    const q = filterName.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (r.name || "").toLowerCase().includes(q));
  }, [rows, filterName]);

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-5 text-sm">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <Shell header="라인 출입 현황 (현재)">
          <div className="px-5 py-5 space-y-4">
            {/* ✅ 상단 액션 버튼 */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-500">
                현재 출입자 등록/퇴실 및 조회 화면입니다.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => navigate("/main")}
                  className="rounded-xl bg-slate-100 px-4 py-2 font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200"
                >
                  뒤로가기(메인)
                </button>
                <button
                  onClick={() => navigate("/line-access/logs")}
                  className="rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"
                >
                  출입/퇴실 로그 보기
                </button>
              </div>
            </div>

            {/* 상단 필터 */}
            <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
              <input
                value={filterSite}
                onChange={(e) => setFilterSite(e.target.value)}
                placeholder="site 필터(예: 본사)"
                className="rounded-xl border border-slate-200 px-3 py-2 md:col-span-1"
              />
              <input
                value={filterBuilding}
                onChange={(e) => setFilterBuilding(e.target.value)}
                placeholder="building 필터(예: A동)"
                className="rounded-xl border border-slate-200 px-3 py-2 md:col-span-1"
              />

              {/* 이름 검색(현황 목록 화면 필터) */}
              <input
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                placeholder="이름 검색"
                className="rounded-xl border border-slate-200 px-3 py-2 md:col-span-2"
              />

              <div className="md:col-span-2 flex gap-2 items-center">
                <button
                  onClick={load}
                  className="rounded-xl bg-sky-600 px-4 py-2 font-semibold text-white hover:bg-sky-700"
                >
                  새로고침
                </button>
                {loading && <div className="px-2 py-2 text-slate-500">불러오는 중…</div>}
              </div>
            </div>

            {/* 등록 폼 */}
            <div className="rounded-2xl bg-sky-50 ring-1 ring-sky-100 p-4">
              <div className="mb-3 text-sm font-semibold text-slate-900">입실 등록</div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                {/* person_type */}
                <select
                  value={form.person_type}
                  onChange={(e) => {
                    const t = e.target.value as "EMP" | "VISITOR";
                    setForm((p) => ({
                      ...p,
                      person_type: t,
                    }));
                  }}
                  className="rounded-xl border border-slate-200 px-3 py-2 bg-white"
                >
                  <option value="EMP">EMP(직원)</option>
                  <option value="VISITOR">VISITOR(외부)</option>
                </select>

                {/* site 콤보 */}
                <select
                  value={form.site}
                  onChange={(e) => setForm((p) => ({ ...p, site: e.target.value }))}
                  className="rounded-xl border border-slate-200 px-3 py-2 bg-white"
                >
                  {SITES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                {/* building 콤보 */}
                <select
                  value={form.building}
                  onChange={(e) => setForm((p) => ({ ...p, building: e.target.value }))}
                  className="rounded-xl border border-slate-200 px-3 py-2 bg-white"
                >
                  {(BUILDINGS_BY_SITE[form.site as (typeof SITES)[number]] ?? []).map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>

                {/* EMP 입력 영역 */}
                {form.person_type === "EMP" ? (
                  <>
                    <select
                      value={empDept}
                      onChange={(e) => setEmpDept(e.target.value as any)}
                      className="rounded-xl border border-slate-200 px-3 py-2 bg-white"
                    >
                      <option value="">부서 선택</option>
                      {EMP_DEPTS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>

                    <select
                      value={form.person_key}
                      onChange={(e) => onSelectEmployee(e.target.value)}
                      className="rounded-xl border border-slate-200 px-3 py-2 bg-white"
                      disabled={!empDept || loadingEmp}
                    >
                      <option value="">
                        {loadingEmp ? "불러오는 중..." : employees.length ? "이름 선택" : "검색 결과 없음"}
                      </option>
                      {employees.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>

                    <input
                      value={form.person_key}
                      readOnly
                      placeholder="id 자동 입력"
                      className="rounded-xl border border-slate-200 px-3 py-2 bg-slate-100 text-slate-600"
                    />
                    <input
                      value={form.name}
                      readOnly
                      placeholder="이름 자동 입력"
                      className="rounded-xl border border-slate-200 px-3 py-2 bg-slate-100 text-slate-600"
                    />
                    <input
                      value={form.dept_or_company}
                      readOnly
                      placeholder="부서 자동 입력"
                      className="rounded-xl border border-slate-200 px-3 py-2 bg-slate-100 text-slate-600"
                    />
                  </>
                ) : (
                  <>
                    <input
                      value={form.person_key}
                      onChange={(e) => setForm((p) => ({ ...p, person_key: e.target.value }))}
                      placeholder="외부 key(기본 uuid, 수정 가능)"
                      className="rounded-xl border border-slate-200 px-3 py-2"
                    />
                    <input
                      value={form.name}
                      onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="이름"
                      className="rounded-xl border border-slate-200 px-3 py-2"
                    />
                    <input
                      value={form.dept_or_company}
                      onChange={(e) => setForm((p) => ({ ...p, dept_or_company: e.target.value }))}
                      placeholder="업체명"
                      className="rounded-xl border border-slate-200 px-3 py-2"
                    />
                  </>
                )}

                <textarea
                  value={form.memo || ""}
                  onChange={(e) => setForm((p) => ({ ...p, memo: e.target.value }))}
                  placeholder="비고(선택) — 아래로 늘려서 입력 가능"
                  rows={2}
                  className="rounded-xl border border-slate-200 px-3 py-2 md:col-span-3 resize-y"
                />
              </div>

              <div className="mt-3 flex items-center gap-3">
                <button
                  disabled={!canSubmit}
                  onClick={onEnter}
                  className="rounded-xl bg-orange-500 px-4 py-2 font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  입실 등록
                </button>

                {!canSubmit && (
                  <div className="text-xs text-slate-500">
                    {form.person_type === "EMP"
                      ? "부서 → 이름 선택을 완료하세요."
                      : "이름/업체명을 입력하세요."}
                  </div>
                )}
              </div>
            </div>

            {err && (
              <div className="rounded-xl bg-red-50 px-4 py-2 text-xs text-red-700 ring-1 ring-red-100">
                {err}
              </div>
            )}

            {/* 목록 */}
            <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-100">
              <table className="min-w-[950px] w-full bg-white">
                <thead className="bg-sky-50 text-xs text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">이름</th>
                    <th className="px-3 py-2 text-left">부서/업체</th>
                    <th className="px-3 py-2 text-left">site</th>
                    <th className="px-3 py-2 text-left">building</th>
                    <th className="px-3 py-2 text-left">입실시간</th>
                    <th className="px-3 py-2 text-left">비고</th>
                    <th className="px-3 py-2 text-left">처리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {viewRows.length === 0 && !loading && (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                        현재 출입자가 없습니다.
                      </td>
                    </tr>
                  )}
                  {viewRows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 font-semibold text-slate-900">{r.name}</td>
                      <td className="px-3 py-2 text-slate-700">{r.dept_or_company}</td>
                      <td className="px-3 py-2 text-slate-700">{r.site}</td>
                      <td className="px-3 py-2 text-slate-700">{r.building}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {new Date(r.entered_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-slate-600 whitespace-pre-wrap">{r.memo || "-"}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => onExit(r)}
                          className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-100 hover:bg-red-100"
                        >
                          퇴실
                        </button>
                      </td>
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

export default LineAccessCurrentPage;
