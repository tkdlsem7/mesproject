// src/Options/ModifyOptionsPage.tsx
// - 버튼만 주황 포인트, 나머지 중립/하늘톤
// - 상단 고정 헤더 + 넓은 레이아웃(max-w-7xl)
// - 스티키 테이블 헤더, 스켈레톤 로딩
// - 합계(행 수/시간) 표시
// - 인라인 편집 단축키: Enter=저장, Esc=취소
// - 새 행 추가 단축키: Ctrl/⌘+Enter

import React, { useEffect, useMemo, useState } from "react";
import {
  useNavigate,
  useParams,
  useSearchParams,
  type NavigateFunction,
} from "react-router-dom";

/** ======================= 환경/유틸 ======================= */

export const API_BASE =
  process.env.NODE_ENV === "production"
    ? "/api"
    : "http://localhost:8000/api";
const CHECKLIST_URL = `${API_BASE}/checklist`;

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/** 타입 */
type ChecklistRow = {
  no: number;     // PK
  option: string; // 옵션명
  step: number;
  item: string;
  hours: number;
};

/** ---------- 스타일 토큰 (Neutral/Sky) ---------- */
const UI = {
  shell: "min-h-screen bg-slate-50",
  headerWrap: "sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur",
  headerInner: "mx-auto flex max-w-7xl items-center justify-between px-6 py-4",
  title: "text-lg font-semibold text-slate-900",
  subtitle: "text-xs text-slate-500",
  badge: "ml-2 rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700",
  pageInner: "mx-auto w-full max-w-7xl px-6 py-8",
  panel: "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm",
  sectionTitle: "mb-3 text-[15px] font-semibold text-slate-700",
  input:
    "rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[15px] outline-none " +
    "focus:border-sky-300 focus:ring-2 focus:ring-sky-200",
  inputSm:
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none " +
    "focus:border-sky-300 focus:ring-2 focus:ring-sky-200",
  // 버튼: 주황 포인트
  btnPrimary:
    "rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600",
  btnSave:
    "rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600",
  btnDanger:
    "rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-600",
  btnNeutral:
    "rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-300",
  tableWrap: "mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm",
  th: "px-4 py-3 text-left text-[13px] font-semibold text-slate-700",
  td: "px-4 py-3 align-top",
  row: "bg-white hover:bg-slate-50",
};

const ModifyOptionsPage: React.FC = () => {
  const routerNavigate: NavigateFunction = useNavigate();
  const params = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();

  /** ----------------------------- state ----------------------------- */
  const optionFromQS = searchParams.get("name") ?? "";
  const optionFromLS = localStorage.getItem("selected_option_name") ?? "";
  const optionName = (optionFromQS || optionFromLS).trim();

  const [list, setList] = useState<ChecklistRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [q, setQ] = useState("");

  const [editNo, setEditNo] = useState<number | null>(null);
  const [editStep, setEditStep] = useState<string>("");
  const [editItem, setEditItem] = useState<string>("");
  const [editHours, setEditHours] = useState<string>("");

  const [newStep, setNewStep] = useState<string>("");
  const [newItem, setNewItem] = useState<string>("");
  const [newHours, setNewHours] = useState<string>("");

  /** ----------------------------- helpers --------------------------- */
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (r) =>
        r.item.toLowerCase().includes(s) ||
        String(r.step).includes(s) ||
        String(r.hours).includes(s)
    );
  }, [q, list]);

  const totalHours = useMemo(
    () => filtered.reduce((sum, r) => sum + (Number.isFinite(r.hours) ? r.hours : 0), 0),
    [filtered]
  );

  const parseIntSafe = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : NaN;
  };
  const parseFloatSafe = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  };

  /** ----------------------------- API ------------------------------- */
  const fetchChecklist = async (optName: string) => {
    if (!optName) {
      setErrorMsg("옵션명이 비어 있습니다. 이전 화면에서 다시 선택해주세요.");
      setList([]);
      return;
    }
    try {
      setLoading(true);
      setErrorMsg("");
      const url = `${CHECKLIST_URL}?option=${encodeURIComponent(optName)}`;
      const res = await fetch(url, {
        headers: { ...authHeaders() },
      });
      if (!res.ok) throw new Error(`조회 실패: ${res.status}`);
      const data: ChecklistRow[] = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "네트워크 오류");
    } finally {
      setLoading(false);
    }
  };

  const createRow = async (payload: {
    option: string;
    step: number;
    item: string;
    hours: number;
  }): Promise<ChecklistRow> => {
    const res = await fetch(CHECKLIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`추가 실패: ${res.status}`);
    return (await res.json()) as ChecklistRow;
  };

  const updateRow = async (
    no: number,
    payload: { step: number; item: string; hours: number }
  ): Promise<ChecklistRow> => {
    const res = await fetch(`${CHECKLIST_URL}/${no}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`수정 실패: ${res.status}`);
    return (await res.json()) as ChecklistRow;
  };

  const deleteRow = async (no: number): Promise<void> => {
    const res = await fetch(`${CHECKLIST_URL}/${no}`, {
      method: "DELETE",
      headers: { ...authHeaders() },
    });
    if (!res.ok) throw new Error(`삭제 실패: ${res.status}`);
  };

  /** --------------------------- lifecycle --------------------------- */
  useEffect(() => {
    void fetchChecklist(optionName);
  }, [optionName]);

  /** ----------------------------- handlers -------------------------- */
  const onEdit = (row: ChecklistRow) => {
    setEditNo(row.no);
    setEditStep(String(row.step));
    setEditItem(row.item);
    setEditHours(String(row.hours));
  };

  const onCancel = () => {
    setEditNo(null);
    setEditStep("");
    setEditItem("");
    setEditHours("");
  };

  const onSave = async () => {
    if (editNo == null) return;

    const stepNum = parseIntSafe(editStep);
    const hoursNum = parseFloatSafe(editHours);

    if (!editItem.trim()) return alert("Item 을 입력해주세요.");
    if (!Number.isFinite(stepNum) || stepNum <= 0) return alert("Step 은 1 이상의 정수로 입력해주세요.");
    if (!Number.isFinite(hoursNum) || hoursNum < 0) return alert("Hours 는 0 이상의 숫자입니다.");

    try {
      setLoading(true);
      const updated = await updateRow(editNo, {
        step: stepNum,
        item: editItem.trim(),
        hours: hoursNum,
      });
      setList((prev) => prev.map((r) => (r.no === editNo ? updated : r)));
      onCancel();
    } catch (e: any) {
      alert(e?.message ?? "수정 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async (row: ChecklistRow) => {
    if (!window.confirm(`Step ${row.step} - "${row.item}" 을 삭제할까요?`)) return;
    try {
      setLoading(true);
      await deleteRow(row.no);
      setList((prev) => prev.filter((r) => r.no !== row.no));
    } catch (e: any) {
      alert(e?.message ?? "삭제 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const onAdd = async () => {
    const stepNum = parseIntSafe(newStep);
    const hoursNum = parseFloatSafe(newHours);

    if (!newItem.trim()) return alert("Item 을 입력해주세요.");
    if (!Number.isFinite(stepNum) || stepNum <= 0) return alert("Step 은 1 이상의 정수로 입력해주세요.");
    if (!Number.isFinite(hoursNum) || hoursNum < 0) return alert("Hours 는 0 이상의 숫자입니다.");

    try {
      setLoading(true);
      const created = await createRow({
        option: optionName,
        step: stepNum,
        item: newItem.trim(),
        hours: hoursNum,
      });
      setList((prev) =>
        [...prev, created].sort((a, b) => a.step - b.step || a.no - b.no)
      );
      setNewStep("");
      setNewItem("");
      setNewHours("");
    } catch (e: any) {
      alert(e?.message ?? "추가 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  /** 단축키: 새행(Ctrl/⌘+Enter) */
  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void onAdd();
    }
  };

  /** 단축키: 편집(Enter 저장, Esc 취소) */
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void onSave();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  /** ----------------------------- render ---------------------------- */
  return (
    <div className={UI.shell}>
      {/* 상단 고정 헤더 */}
      <div className={UI.headerWrap}>
        <div className={UI.headerInner}>
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => routerNavigate("/options")}
              className="shrink-0 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              title="옵션 목록으로"
            >
              ← 뒤로가기
            </button>
            <div className="min-w-0">
              <div className="truncate">
                <span className={UI.title}>Modify Options</span>
                {optionName && <span className={UI.badge}>{optionName}</span>}
                {params.id && <span className="ml-2 text-xs text-slate-400">#{params.id}</span>}
              </div>
              <div className={UI.subtitle}>
                총 <span className="font-semibold text-slate-700">{filtered.length}</span>건 • 합계{" "}
                <span className="font-semibold text-slate-700">{totalHours.toFixed(1)}h</span>
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="항목/단계/시간 검색…"
              className={`${UI.inputSm} w-64`}
            />
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div className={UI.pageInner}>
        {/* 에러 메시지 */}
        {errorMsg && (
          <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600 ring-1 ring-rose-100">
            {errorMsg}
          </div>
        )}

        {/* 새 행 추가 */}
        <div className={UI.panel} onKeyDown={handleAddKeyDown}>
          <div className={UI.sectionTitle}>
            새 Step 추가 <span className="text-slate-500">(Ctrl/⌘+Enter)</span>
          </div>
          <div className="grid grid-cols-12 gap-3">
            <input
              value={newStep}
              onChange={(e) => setNewStep(e.target.value)}
              placeholder="Step"
              className={`${UI.input} col-span-12 sm:col-span-2`}
              inputMode="numeric"
            />
            <input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Item"
              className={`${UI.input} col-span-12 sm:col-span-7`}
            />
            <input
              value={newHours}
              onChange={(e) => setNewHours(e.target.value)}
              placeholder="Hours"
              className={`${UI.input} col-span-8 sm:col-span-2`}
              inputMode="decimal"
            />
            <button
              onClick={onAdd}
              disabled={loading || !optionName}
              className={`${UI.btnPrimary} col-span-4 sm:col-span-1 disabled:opacity-60`}
              title={!optionName ? "옵션명이 없습니다" : "추가"}
            >
              추가
            </button>
          </div>
        </div>

        {/* 테이블 */}
        <div className={UI.tableWrap}>
          <div className="max-h-[60vh] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100">
                <tr>
                  <th className={`${UI.th} w-24`}>Step</th>
                  <th className={UI.th}>Item</th>
                  <th className={`${UI.th} w-32`}>Hours</th>
                  <th className={`${UI.th} w-44`}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {/* 로딩 스켈레톤 */}
                {loading && list.length === 0 &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={`sk-${i}`} className="bg-white">
                      <td className={UI.td}><div className="h-4 w-10 animate-pulse rounded bg-slate-100" /></td>
                      <td className={UI.td}><div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" /></td>
                      <td className={UI.td}><div className="h-4 w-16 animate-pulse rounded bg-slate-100" /></td>
                      <td className={UI.td}><div className="h-8 w-40 animate-pulse rounded bg-slate-100" /></td>
                    </tr>
                  ))}

                {/* 비어있음 */}
                {!loading && filtered.length === 0 && (
                  <tr className="bg-white">
                    <td className="px-4 py-10 text-center text-slate-400" colSpan={4}>
                      표시할 데이터가 없습니다. 상단에서 조건을 바꾸거나 새 항목을 추가하세요.
                    </td>
                  </tr>
                )}

                {/* 데이터 */}
                {filtered
                  .slice()
                  .sort((a, b) => a.step - b.step || a.no - b.no)
                  .map((r) => {
                    const isEdit = editNo === r.no;
                    return (
                      <tr key={r.no} className={UI.row}>
                        {/* Step */}
                        <td className={UI.td}>
                          {!isEdit ? (
                            <span className="font-medium text-slate-800">{r.step}</span>
                          ) : (
                            <input
                              value={editStep}
                              onChange={(e) => setEditStep(e.target.value)}
                              onKeyDown={handleEditKeyDown}
                              className={`${UI.inputSm} w-24`}
                              inputMode="numeric"
                            />
                          )}
                        </td>

                        {/* Item */}
                        <td className={UI.td}>
                          {!isEdit ? (
                            <span className="text-slate-800">{r.item}</span>
                          ) : (
                            <input
                              value={editItem}
                              onChange={(e) => setEditItem(e.target.value)}
                              onKeyDown={handleEditKeyDown}
                              className={`${UI.inputSm} w-full`}
                            />
                          )}
                        </td>

                        {/* Hours */}
                        <td className={UI.td}>
                          {!isEdit ? (
                            <span className="text-slate-800">{r.hours}</span>
                          ) : (
                            <input
                              value={editHours}
                              onChange={(e) => setEditHours(e.target.value)}
                              onKeyDown={handleEditKeyDown}
                              className={`${UI.inputSm} w-28 text-right`}
                              inputMode="decimal"
                            />
                          )}
                        </td>

                        {/* Actions */}
                        <td className={UI.td}>
                          {!isEdit ? (
                            <div className="flex gap-2">
                              <button onClick={() => onEdit(r)} className={UI.btnPrimary}>수정</button>
                              <button onClick={() => onDelete(r)} className={UI.btnDanger}>삭제</button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button onClick={onSave} disabled={loading} className={`${UI.btnSave} disabled:opacity-60`}>저장(Enter)</button>
                              <button onClick={onCancel} className={UI.btnNeutral}>취소(Esc)</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* 하단 요약 바 */}
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
            <span>총 {filtered.length}건</span>
            <span>합계 {totalHours.toFixed(1)}h</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModifyOptionsPage;
