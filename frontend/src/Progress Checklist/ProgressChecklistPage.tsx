// src/Progress Checklist/ProgressChecklistPage.tsx
import React from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export const API_BASE =
  process.env.NODE_ENV === "production"
    ? "/api"
    : "http://localhost:8000/api";

const toYMD = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

type ChecklistItem = {
  no: number;
  step: number;
  item: string;
  hours: number;
  percent: number;
};
type ChecklistPage = {
  option: string;
  total_hours: number;
  item_count: number;
  items: ChecklistItem[];
  checked_steps?: number[];
};
type ChecklistResponse = {
  machine_id: string;
  options: string[];
  pages: ChecklistPage[];
};

/* 공용 카드 래퍼: 얇은 하늘색~청록 그라데이션 바 + 큰 라운드 + 소프트 섀도우 */
const Shell: React.FC<{ children: React.ReactNode; header?: string; right?: React.ReactNode; className?: string }> = ({
  children,
  header,
  right,
  className,
}) => (
  <section className={`rounded-2xl bg-white shadow-md ring-1 ring-gray-100 ${className ?? ""}`}>
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

const ProgressChecklistPage: React.FC = () => {
  const navigate = useNavigate();
  const search = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const qpId = search.get("machine_id") ?? "";
  const lsId = typeof window !== "undefined" ? localStorage.getItem("selected_machine_id") ?? "" : "";
  const machineId = qpId || lsId;

  const [data, setData] = React.useState<ChecklistResponse | null>(null);

  // ✅ 추가: 로그 날짜(기본=오늘)
  const [logDate, setLogDate] = React.useState<string>(() => toYMD(new Date()));

  // 옵션별 체크 맵: { hot: { 1:true, 3:true }, "5825": {...} }
  const [checkedByOption, setCheckedByOption] = React.useState<Record<string, Record<number, boolean>>>({});

  // 로딩 상태(간단 표시)
  const [loading, setLoading] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (!machineId) return;
    (async () => {
      try {
        setLoading(true);
        const res = await axios.get<ChecklistResponse>(
          `${API_BASE}/progress/checklist/${encodeURIComponent(machineId)}`
        );
        setData(res.data);

        // 옵션별 초기 체크 맵 구성
        const init: Record<string, Record<number, boolean>> = {};
        for (const p of res.data.pages) {
          const set = new Set(p.checked_steps ?? []);
          const map: Record<number, boolean> = {};
          for (const it of p.items) {
            if (set.has(it.no)) map[it.no] = true;
          }
          init[p.option] = map;
        }
        setCheckedByOption(init);
      } catch (e) {
        console.error(e);
        alert("체크리스트를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, [machineId]);

  // ===== 진척도 계산 (전체) =====
  const grandTotalHours = React.useMemo(() => {
    return (data?.pages ?? []).reduce((sum, p) => sum + (p.total_hours || 0), 0);
  }, [data]);

  const doneHours = React.useMemo(() => {
    if (!data) return 0;
    let acc = 0;
    for (const p of data.pages) {
      const map = checkedByOption[p.option] || {};
      for (const it of p.items) {
        if (map[it.no]) acc += it.hours;
      }
    }
    return acc;
  }, [data, checkedByOption]);

  const percent = grandTotalHours > 0 ? Math.round((doneHours / grandTotalHours) * 100) : 0;

  // ===== 체크 토글 =====
  const toggleOne = (opt: string, no: number) =>
    setCheckedByOption((prev) => ({ ...prev, [opt]: { ...prev[opt], [no]: !prev[opt]?.[no] } }));

  const toggleAllInOption = (opt: string, on: boolean, nos: number[]) =>
    setCheckedByOption((prev) => ({
      ...prev,
      [opt]: nos.reduce<Record<number, boolean>>((m, n) => ((m[n] = on), m), {}),
    }));

  // ===== 저장 (옵션별 upsert 루프) =====
  const handleSave = async () => {
    if (!data) return;

    const items = data.pages.map((p) => {
      const validNos = new Set(p.items.map((it) => it.no));
      const checkedNos = Object.entries(checkedByOption[p.option] || {})
        .filter(([, v]) => v)
        .map(([k]) => Number(k))
        .filter((no) => validNos.has(no));
      return { option: p.option, checked_steps: checkedNos };
    });

    // ✅ 기존 payload는 그대로 두고, log_date만 옵션으로 추가
    const payload: any = { machine_id: machineId, items };
    if (logDate) payload.log_date = logDate; // "YYYY-MM-DD"

    try {
      await axios.post(
        `${API_BASE}/progress/checklist/result/batch`,
        payload,
        { headers: { "Content-Type": "application/json" } }
      );
      alert("진척도 저장 완료.");
      navigate(-1);
    } catch (e) {
      console.error(e);
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        {/* 상단: 제목/머신ID/전체 진척도 */}
        <Shell header="진척도 체크리스트">
          <div className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* ✅ Machine + 날짜 입력 (요청하신 위치: 장비 번호 옆) */}
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <div>
                  Machine&nbsp;
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-800">
                    {machineId || "미지정"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-slate-500">날짜</span>
                  <input
                    type="date"
                    value={logDate}
                    onChange={(e) => setLogDate(e.currentTarget.value)}
                    className="rounded-full bg-white px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-300"
                  />
                </div>
              </div>

              {/* 요약 칩들 */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-sky-50 px-2.5 py-1 font-medium text-sky-700 ring-1 ring-sky-200">
                  완료 {doneHours.toFixed(1)}h
                </span>
                <span className="rounded-full bg-sky-50 px-2.5 py-1 font-medium text-sky-700 ring-1 ring-sky-200">
                  총 {grandTotalHours.toFixed(1)}h
                </span>
                <span className="rounded-full bg-orange-50 px-2.5 py-1 font-semibold text-orange-700 ring-1 ring-orange-200">
                  {percent}%
                </span>
              </div>
            </div>

            {/* 전체 진척도 바 */}
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-slate-600">전체 진척도</span>
                <span className="font-semibold">
                  {percent}% ({doneHours.toFixed(1)}h / {grandTotalHours.toFixed(1)}h)
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-3 bg-sky-600 transition-[width] duration-300" style={{ width: `${percent}%` }} />
              </div>
            </div>
          </div>
        </Shell>

        {/* 표: 옵션별 항목 (헤더 고정 + 내부 스크롤) */}
        <Shell header="옵션별 작업 항목">
          <div className="max-h-[560px] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-sky-50 text-sky-900">
                <tr className="text-left">
                  <th className="w-10 px-3 py-2"></th>
                  <th className="px-3 py-2">Step</th>
                  <th className="px-3 py-2">항목</th>
                  <th className="px-3 py-2 text-right">표준작업공수시간</th>
                  <th className="px-3 py-2 text-right">퍼센트</th>
                </tr>
              </thead>

              {/* 옵션별 그룹 */}
              {(data?.pages ?? []).map((p) => {
                const map = checkedByOption[p.option] || {};
                const nos = p.items.map((it) => it.no);
                const allOn = nos.length > 0 && nos.every((n) => !!map[n]);

                return (
                  <tbody key={p.option} className="divide-y">
                    {/* 그룹 헤더 */}
                    <tr className="bg-gradient-to-r from-sky-50 to-cyan-50">
                      <td className="px-3 py-2 align-middle">
                        <input
                          type="checkbox"
                          checked={allOn}
                          onChange={(e) => toggleAllInOption(p.option, e.currentTarget.checked, nos)}
                          aria-label={`${p.option}-all`}
                          className="h-4 w-4 accent-sky-600"
                        />
                      </td>
                      <td colSpan={4} className="px-3 py-2">
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-800 px-2 py-[2px] text-xs text-white">{p.option}</span>
                          <span className="text-xs text-slate-500">Step ({p.item_count}개)</span>
                          <span className="ml-2 text-xs text-slate-400">합계 {p.total_hours}h</span>
                          <span className="text-xs text-slate-400">· 전체 선택/해제</span>
                        </span>
                      </td>
                    </tr>

                    {/* 항목들 */}
                    {p.items.map((it) => (
                      <tr key={it.no} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={!!map[it.no]}
                            onChange={() => toggleOne(p.option, it.no)}
                            aria-label={`${p.option}-${it.no}`}
                            className="h-4 w-4 accent-sky-600"
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-700">Step {it.step}</td>
                        <td className="px-3 py-2 text-slate-800">{it.item}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{it.hours}h</td>
                        <td className="px-3 py-2 text-right text-slate-700">{it.percent}%</td>
                      </tr>
                    ))}
                  </tbody>
                );
              })}

              {/* 전체 합계 */}
              <tbody>
                <tr className="bg-slate-50 font-semibold">
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2">합계</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right">{grandTotalHours.toFixed(1)}h</td>
                  <td className="px-3 py-2 text-right">100%</td>
                </tr>
              </tbody>
            </table>

            {/* 로딩 메시지 (간단) */}
            {loading && (
              <div className="px-4 py-6 text-center text-sm text-gray-500">
                데이터를 불러오는 중입니다…
              </div>
            )}
          </div>
        </Shell>

        {/* 하단 버튼 */}
        <div className="flex items-center justify-center gap-3">
          <button
            className="rounded-full bg-gray-200 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300"
            onClick={() => navigate(-1)}
          >
            ← 뒤로가기
          </button>
          <button
            className="rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-orange-600"
            onClick={handleSave}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProgressChecklistPage;
