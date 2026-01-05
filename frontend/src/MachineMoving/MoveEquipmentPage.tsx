// src/MachineMoving/MoveEquipmentPage.tsx
import React from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

type EquipmentRow = {
  machine_id: string;
  site: string;
  slot: string;
  manager?: string | null;
  progress?: number | null;
};

// 프로젝트 설정에 따라 /api 프리픽스를 사용하지 않으면 "" 로 변경
export const API_BASE =
  process.env.NODE_ENV === "production"
    ? "/api"
    : "http://localhost:8000/api";

// 요구: 사이트는 3개 고정
const SITES = ["본사", "진우리", "라인대기"] as const;

/* 토큰 → Authorization 헤더 (있는 경우만) */
const authHeaders = (): Record<string, string> => {
  try {
    const t = localStorage.getItem("access_token");
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
};

/* 공용 카드 래퍼: 얇은 하늘색~청록 그라데이션 바 + 큰 라운드 + 소프트 섀도우 */
const Shell: React.FC<{
  children: React.ReactNode;
  header?: string;
  right?: React.ReactNode;
  className?: string;
}> = ({ children, header, right, className }) => (
  <section
    className={`rounded-2xl bg-white shadow-md ring-1 ring-gray-100 ${
      className ?? ""
    }`}
  >
    <div className="h-2 rounded-t-2xl bg-gradient-to-r from-sky-200 via-cyan-200 to-sky-200" />
    {(header || right) && (
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <h3 className="text-base font-semibold text-gray-800">{header}</h3>
        {right}
      </div>
    )}
    {children}
  </section>
);

const MoveEquipmentPage: React.FC = () => {
  const nav = useNavigate();
  const url = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  const initialSelected = url.get("machine_id") ?? "";

  // 선택된 사이트
  const [site, setSite] = React.useState<string>("본사");

  // 좌측 리스트 데이터/상태
  const [rows, setRows] = React.useState<EquipmentRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // 검색어
  const [q, setQ] = React.useState("");

  // 선택된 장비 & 이동 계획
  const [checked, setChecked] = React.useState<Record<string, boolean>>(
    initialSelected ? { [initialSelected]: true } : {}
  );
  const [movePlan, setMovePlan] = React.useState<
    Record<string, { site?: string; slot?: string }>
  >({});
  const [saving, setSaving] = React.useState(false);

  // --- 붙여넣기 UI(디자인만; 기능 잠금) ---
  const [pasteText, setPasteText] = React.useState("");

  // 사이트 변경 시 목록 로드
  React.useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const { data } = await axios.get<{
          site: string;
          items: EquipmentRow[];
        }>(`${API_BASE}/move/equipments`, {
          params: { site },
          withCredentials: true,
          headers: { ...authHeaders() },
        });
        setRows(data.items ?? []);

        // url로 온 machine_id가 있으면 기본 체크/계획 세팅
        if (
          initialSelected &&
          (data.items ?? []).some((r) => r.machine_id === initialSelected)
        ) {
          setChecked((m) => ({ ...m, [initialSelected]: true }));
          setMovePlan((p) => ({
            ...p,
            [initialSelected]: { site, slot: "" },
          }));
        }
      } catch {
        setErr("장비 목록을 불러오지 못했습니다.");
        setRows([]); // ✅ 실패 시 이전 데이터 제거
      } finally {
        setLoading(false);
      }
    })();
  }, [site, initialSelected]);

  // 좌측 검색 필터
  const filteredRows = React.useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter(
      (r) =>
        (r.machine_id || "").toLowerCase().includes(kw) ||
        (r.slot || "").toLowerCase().includes(kw) ||
        (r.manager || "").toLowerCase().includes(kw)
    );
  }, [q, rows]);

  const selectedRows = React.useMemo(
    () => rows.filter((r) => checked[r.machine_id]),
    [rows, checked]
  );

  const allVisibleChecked =
    filteredRows.length > 0 &&
    filteredRows.every((r) => !!checked[r.machine_id]);

  const toggleCheckAllVisible = (on: boolean) => {
    setChecked((m) => {
      const next: Record<string, boolean> = { ...m };
      filteredRows.forEach((r) => {
        next[r.machine_id] = on;
      });
      return next;
    });
    if (on) {
      setMovePlan((p) => {
        const cp = { ...p };
        filteredRows.forEach((r) => {
          cp[r.machine_id] = cp[r.machine_id] || { site, slot: "" };
        });
        return cp;
      });
    }
  };

  const toggleCheck = (mid: string) => {
    setChecked((m) => {
      const next = !m[mid];
      const out = { ...m, [mid]: next };
      if (next) {
        setMovePlan((p) => ({ ...p, [mid]: p[mid] || { site, slot: "" } }));
      }
      return out;
    });
  };

  const setPlanSite = (mid: string, v: string) =>
    setMovePlan((p) => ({ ...p, [mid]: { ...p[mid], site: v } }));

  const setPlanSlot = (mid: string, v: string) =>
    setMovePlan((p) => ({ ...p, [mid]: { ...p[mid], slot: v.toUpperCase() } }));

  // ✅ /move/apply 사용 (장비별 목적지 지정)
  const applyMove = async () => {
    const targets = rows
      .filter((r) => checked[r.machine_id])
      .map((r) => ({ id: r.machine_id, plan: movePlan[r.machine_id] || {} }));

    if (targets.length === 0) {
      alert("이동할 장비를 선택하세요.");
      return;
    }
    for (const t of targets) {
      if (!t.plan.site || !t.plan.slot) {
        alert(`장비 ${t.id}: 이동 Site/Slot을 선택하세요.`);
        return;
      }
    }

    const payload = {
      items: targets.map((t) => ({
        machine_id: t.id,
        to_site: String(t.plan.site).trim(),
        to_slot: String(t.plan.slot).trim(),
      })),
    };

    try {
      setSaving(true);
      console.log("[/move/apply] payload", payload);

      await axios.post(`${API_BASE}/move/apply`, payload, {
        headers: { "Content-Type": "application/json", ...authHeaders() },
        withCredentials: true,
      });

      // 정상 200 응답일 때
      alert("장비 이동이 적용되었습니다.");

      const { data } = await axios.get<{
        site: string;
        items: EquipmentRow[];
      }>(`${API_BASE}/move/equipments`, {
        params: { site },
        withCredentials: true,
        headers: { ...authHeaders() },
      });
      setRows(data.items ?? []);
      setChecked({});
      setMovePlan({});
    } catch (e: any) {
      const resp = e?.response;

        // ★ 409 응답 전체를 로그로 확인
      if (resp?.status === 409) {
        console.log("[409 /move/apply] resp.data =", resp.data);
      }

      // 422 상세 메시지 보이기 (유효성 에러 즉시 확인)
      if (resp?.status === 422) {
        console.warn("[422 detail]", resp.data);
        alert(JSON.stringify(resp.data?.detail ?? resp.data, null, 2));
        return;
      }

      // 409 (슬롯 점유) 처리
      if (resp?.status === 409 && Array.isArray(resp?.data?.conflicts)) {
        const allConflicts: any[] = resp.data.conflicts;

        // 진우리 이외의 충돌
        const nonJinuri = allConflicts.filter(
          (c) => String(c.site) !== "진우리"
        );

        // 1) 본사/부항리 등 실제로 막아야 하는 충돌이 있으면 → 기존처럼 에러
        if (nonJinuri.length > 0) {
          const lines = nonJinuri.map(
            (c: any) =>
              `- ${c.site} / ${c.slot} 슬롯은 이미 ${c.current_machine_id} 점유 중`
          );
          alert(`이동 불가 슬롯이 있습니다:\n${lines.join("\n")}`);
          return;
        }

        // 2) 여기까지 왔으면 "진우리 관련 충돌만 있는 409" → 성공 플로우로 간주
        try {
          alert("장비 이동이 적용되었습니다. (진우리 슬롯 중복 허용)");

          const { data } = await axios.get<{
            site: string;
            items: EquipmentRow[];
          }>(`${API_BASE}/move/equipments`, {
            params: { site },
            withCredentials: true,
            headers: { ...authHeaders() },
          });
          setRows(data.items ?? []);
          setChecked({});
          setMovePlan({});
        } catch (reloadErr) {
          console.error(reloadErr);
          alert(
            "이동은 처리된 것으로 간주했지만, 목록 재조회 중 오류가 발생했습니다."
          );
        }
        return;
      }

      console.error(e);
      alert("이동 적용 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  // ──────────────────────────────────────────────
  // 붙여넣기 UI는 디자인만 남김 (버튼 비활성/알림)
  // ──────────────────────────────────────────────
  const warnNotImplemented = (what: string) =>
    alert(`${what} 기능은 추후 제공될 예정입니다.`);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        {/* 상단 헤더 카드 */}
        <Shell
          header="장비 이동 관리"
          right={
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Site</label>
              <select
                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
                value={site}
                onChange={(e) => setSite(e.target.value)}
              >
                {SITES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                onClick={() => nav(-1)}
                className="rounded-full bg-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-300"
              >
                ← 뒤로가기
              </button>
            </div>
          }
        >
          <div className="px-5 pb-4 pt-2">
            <div className="text-sm text-gray-600">
              선택된 장비{" "}
              <span className="rounded-full bg-sky-50 px-2.5 py-1 font-semibold text-sky-700 ring-1 ring-sky-200">
                {selectedRows.length}대
              </span>
            </div>
          </div>
        </Shell>

        {/* 본문: 2컬럼 */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* 좌측: 장비 목록 */}
          <Shell
            header="장비 목록"
            right={
              <div className="flex items-center gap-2">
                <div className="relative">
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="검색: 호기 / 슬롯 / 담당자"
                    className="w-56 rounded-full border border-gray-200 px-3 py-1.5 pl-3 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
                  />
                </div>
                {q && (
                  <button
                    onClick={() => setQ("")}
                    className="rounded-full bg-gray-100 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-200"
                  >
                    초기화
                  </button>
                )}
              </div>
            }
          >
            {loading && (
              <div className="px-5 py-4 text-sm text-gray-500">로딩 중…</div>
            )}
            {err && (
              <div className="px-5 py-3 text-sm text-red-600">{err}</div>
            )}

            <div className="max-h-[520px] overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10 bg-sky-50 text-sky-900">
                  <tr>
                    <th className="w-12 px-3 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-sky-600"
                        checked={allVisibleChecked}
                        onChange={(e) =>
                          toggleCheckAllVisible(e.currentTarget.checked)
                        }
                        aria-label="전체 선택"
                      />
                    </th>
                    <th className="px-3 py-2 text-left">호기</th>
                    <th className="px-3 py-2 text-left">Site</th>
                    <th className="px-3 py-2 text-left">Slot</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-8 text-center text-gray-500"
                      >
                        표시할 장비가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((r) => (
                      <tr key={r.machine_id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-sky-600"
                            checked={!!checked[r.machine_id]}
                            onChange={() => toggleCheck(r.machine_id)}
                            aria-label={`${r.machine_id} 선택`}
                          />
                        </td>
                        <td className="px-3 py-2 text-slate-800">
                          {r.machine_id}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{r.site}</td>
                        <td className="px-3 py-2 text-slate-700">{r.slot}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Shell>

          {/* 우측: 이동 설정 */}
          <Shell header="이동 설정">
            <div className="max-h-[520px] overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10 bg-sky-50 text-sky-900">
                  <tr>
                    <th className="px-3 py-2 text-left">장비 ID</th>
                    <th className="px-3 py-2 text-left">현재 Site</th>
                    <th className="px-3 py-2 text-left">현재 Slot</th>
                    <th className="px-3 py-2 text-left">이동 Site</th>
                    <th className="px-3 py-2 text-left">이동 Slot</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-8 text-center text-gray-500"
                      >
                        좌측에서 이동할 장비를 선택하세요.
                      </td>
                    </tr>
                  ) : (
                    selectedRows.map((r) => {
                      const plan = movePlan[r.machine_id] || {};
                      return (
                        <tr key={r.machine_id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-slate-800">
                            {r.machine_id}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {r.site}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {r.slot}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              className="rounded-full border border-gray-200 px-3 py-1.5 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
                              value={plan.site ?? ""}
                              onChange={(e) =>
                                setPlanSite(r.machine_id, e.target.value)
                              }
                            >
                              <option value="">선택</option>
                              {SITES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              className="w-32 rounded-full border border-gray-200 px-3 py-1.5 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
                              placeholder="새 Slot"
                              value={plan.slot ?? ""}
                              onChange={(e) =>
                                setPlanSlot(r.machine_id, e.target.value)
                              }
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-5 pb-5 pt-4">
              <span className="text-xs text-gray-500">
                선택:{" "}
                <span className="rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-700 ring-1 ring-sky-200">
                  {selectedRows.length}대
                </span>
              </span>
              <button
                onClick={applyMove}
                disabled={selectedRows.length === 0 || saving}
                className={`rounded-full px-6 py-2 text-sm font-semibold text-white ${
                  selectedRows.length === 0 || saving
                    ? "bg-gray-400"
                    : "bg-orange-500 hover:bg-orange-600"
                }`}
              >
                {saving ? "적용 중…" : "장비 이동 적용"}
              </button>
            </div>
          </Shell>
        </div>

        {/* 붙여넣기(디자인만) */}
        <Shell header="메신저 붙여넣기(빠른 이동)">
          <div className="space-y-3 px-5 pt-4">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={`예)\n2025.10.14 라인이동 현황 공유드립니다.\n\n진우리 -> 본사라인\n\nD(e)-11-06  G-01\nD(e)-11-07  G-04\nH(e)-09-03  B-06\n...`}
              className="w-full h-44 rounded-xl border border-slate-200 p-3 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => warnNotImplemented("미리보기")}
                className="rounded-full px-4 py-1.5 text-sm font-semibold bg-gray-300 text-gray-600 cursor-not-allowed"
                title="추후 제공 예정"
              >
                미리보기
              </button>
              <button
                onClick={() => warnNotImplemented("적용")}
                className="rounded-full px-4 py-1.5 text-sm font-semibold bg-gray-300 text-gray-600 cursor-not-allowed"
                title="추후 제공 예정"
              >
                적용
              </button>
            </div>
          </div>
          <ul className="text-xs text-slate-500 space-y-1 px-5 pb-5">
            <li>
              • 방향 줄은 반드시 포함: 예) <b>진우리 -&gt; 본사(라인)</b>
            </li>
            <li>
              • 본문은 <code>D(e)-11-06&nbsp;&nbsp;G-01</code> 형식,{" "}
              <code>(e)</code>는 자동 제거됩니다.
            </li>
            <li>• 이 영역은 현재 디자인만 제공됩니다.</li>
          </ul>
        </Shell>
      </div>
    </div>
  );
};

export default MoveEquipmentPage;
