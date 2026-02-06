// src/pages/DefectCatalogPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

/** API 기본 경로 */
const API_BASE =
  process.env.NODE_ENV === "production" ? "/api" : "http://localhost:8000/api";

const authHeaders = (): Record<string, string> => {
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
};

/** ---------- 스타일 토큰 (MainPage 결) ---------- */
const PAGE_BG =
  "min-h-screen bg-gradient-to-br from-amber-50 via-slate-50 to-sky-50 px-3 py-4 text-sm";
const FRAME = "mx-auto w-full max-w-[1480px] 2xl:max-w-[1680px]";
const PANEL =
  "overflow-hidden rounded-3xl bg-white/70 shadow-xl ring-1 ring-slate-200/70 backdrop-blur " +
  "flex flex-col lg:h-[calc(100vh-32px)]";

const CONTENT =
  "bg-white/35 p-4 md:p-6 flex-1 min-h-0 overflow-y-auto space-y-6";

const inputBase =
  "h-11 w-full rounded-2xl border border-slate-200/70 bg-white/80 px-4 text-[15px] text-slate-800 shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-sky-200/70";
const textareaBase =
  "w-full rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-2 text-[15px] leading-6 text-slate-800 shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-sky-200/70 resize-y min-h-[44px]";

const softPanel = "rounded-2xl bg-slate-50/80 ring-1 ring-slate-200/60";

/** ---------- UI 컴포넌트 ---------- */
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

const Field: React.FC<{
  label: string;
  children: React.ReactNode;
  hint?: string;
}> = ({ label, children, hint }) => (
  <div className="space-y-1.5">
    <div className="flex items-baseline justify-between gap-2">
      <div className="text-xs font-extrabold tracking-wide text-slate-600">
        {label}
      </div>
      {hint && <div className="text-[11px] text-slate-400">{hint}</div>}
    </div>
    {children}
  </div>
);

/** ---------- 타입 ---------- */
type DefectCatalogItem = {
  id: number;
  defect: string;
  defect_types: string[]; // 서버에서 배열로 내려준다고 가정(아래 백엔드 코드 제공)
};

type UiItem = DefectCatalogItem & {
  typesText: string; // textarea 편집용 (쉼표 csv)
  saving?: boolean;
  deleting?: boolean;
};

const parseTypes = (csv: string) =>
  csv
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

const toCsv = (arr: string[]) => (arr ?? []).join(", ");

export default function DefectCatalogPage() {
  const navigate = useNavigate();

  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [items, setItems] = useState<UiItem[]>([]);

  // 신규 추가 폼
  const [newDefect, setNewDefect] = useState("");
  const [newTypes, setNewTypes] = useState("");

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await axios.get(`${API_BASE}/defect-catalog`, {
        headers: { ...authHeaders() },
      });
      const list: DefectCatalogItem[] = Array.isArray(res.data) ? res.data : [];
      setItems(
        list.map((x) => ({
          ...x,
          typesText: toCsv(x.defect_types),
        }))
      );
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? "목록 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return items;
    return items.filter((x) => {
      const a = x.defect.toLowerCase().includes(kw);
      const b = x.typesText.toLowerCase().includes(kw);
      return a || b;
    });
  }, [items, q]);

  const createOne = async () => {
    const d = newDefect.trim();
    const types = parseTypes(newTypes);
    if (!d) return alert("불량명을 입력해주세요.");
    if (types.length === 0) return alert("불량유형을 1개 이상 입력해주세요.");

    try {
      setLoading(true);
      const res = await axios.post(
        `${API_BASE}/defect-catalog`,
        { defect: d, defect_types: types },
        { headers: { ...authHeaders() } }
      );
      const created: DefectCatalogItem = res.data;
      setItems((p) => [
        {
          ...created,
          typesText: toCsv(created.defect_types),
        },
        ...p,
      ]);
      setNewDefect("");
      setNewTypes("");
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? "추가 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const saveOne = async (id: number) => {
    const target = items.find((x) => x.id === id);
    if (!target) return;

    const d = target.defect.trim();
    const types = parseTypes(target.typesText);

    if (!d) return alert("불량명은 비울 수 없습니다.");
    if (types.length === 0) return alert("불량유형을 1개 이상 입력해주세요.");

    setItems((p) =>
      p.map((x) => (x.id === id ? { ...x, saving: true } : x))
    );

    try {
      const res = await axios.put(
        `${API_BASE}/defect-catalog/${id}`,
        { defect: d, defect_types: types },
        { headers: { ...authHeaders() } }
      );
      const saved: DefectCatalogItem = res.data;
      setItems((p) =>
        p.map((x) =>
          x.id === id
            ? {
                ...saved,
                typesText: toCsv(saved.defect_types),
                saving: false,
              }
            : x
        )
      );
    } catch (e: any) {
      setItems((p) =>
        p.map((x) => (x.id === id ? { ...x, saving: false } : x))
      );
      alert(e?.response?.data?.detail ?? "저장 중 오류가 발생했습니다.");
    }
  };

  const deleteOne = async (id: number) => {
    const ok = window.confirm("정말 삭제할까요?");
    if (!ok) return;

    setItems((p) =>
      p.map((x) => (x.id === id ? { ...x, deleting: true } : x))
    );

    try {
      await axios.delete(`${API_BASE}/defect-catalog/${id}`, {
        headers: { ...authHeaders() },
      });
      setItems((p) => p.filter((x) => x.id !== id));
    } catch (e: any) {
      setItems((p) =>
        p.map((x) => (x.id === id ? { ...x, deleting: false } : x))
      );
      alert(e?.response?.data?.detail ?? "삭제 중 오류가 발생했습니다.");
    }
  };

  const updateItem = (id: number, patch: Partial<UiItem>) => {
    setItems((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  return (
    <div className={PAGE_BG}>
      <div className={FRAME}>
        <div className={PANEL}>
          <div className="h-2 bg-gradient-to-r from-teal-400 via-sky-500 to-fuchsia-500" />

          <main className={CONTENT}>
            {/* 헤더 */}
            <section className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-500">MES</div>
                <div className="text-2xl font-extrabold tracking-tight text-slate-900">
                  불량 항목 관리
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  RawData에서 쓰는 <b>불량/불량유형</b> 목록을 관리합니다.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="rounded-full bg-white/80 px-4 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200/70 hover:bg-white"
                >
                  뒤로가기
                </button>
                <button
                  type="button"
                  onClick={load}
                  className="rounded-full bg-white/80 px-4 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200/70 hover:bg-white"
                >
                  새로고침
                </button>
              </div>
            </section>

            {/* 검색 */}
            <Shell
              header="검색"
              badge="Filter"
              headerRight={
                <div className="text-xs text-slate-500">
                  {loading ? "불러오는 중..." : `총 ${items.length}개`}
                </div>
              }
            >
              <div className="px-7 pb-7 pt-5">
                <input
                  className={inputBase}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="불량명 / 불량유형 검색"
                />
                {err && (
                  <div className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
                    {err}
                  </div>
                )}
              </div>
            </Shell>

            {/* 신규 추가 */}
            <Shell header="신규 추가" badge="Create">
              <div className="px-7 pb-7 pt-5 space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="불량" hint="예: Cover">
                    <input
                      className={inputBase}
                      value={newDefect}
                      onChange={(e) => setNewDefect(e.target.value)}
                      placeholder="불량명"
                    />
                  </Field>

                  <Field label="불량유형" hint="쉼표(,)로 구분 / 예: 도장불량, 스크래치">
                    <textarea
                      className={textareaBase}
                      value={newTypes}
                      onChange={(e) => setNewTypes(e.target.value)}
                      placeholder="예: 도장불량, 스크래치, 파손"
                    />
                  </Field>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={createOne}
                    disabled={loading}
                    className="rounded-full bg-gradient-to-r from-sky-600 to-teal-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-sm hover:from-sky-700 hover:to-teal-700 disabled:opacity-60"
                  >
                    추가
                  </button>
                  <div className={["px-4 py-3 text-sm text-slate-600", softPanel].join(" ")}>
                    불량유형은 <b>쉼표(,)</b>로 나눠서 입력하면 됩니다.
                  </div>
                </div>
              </div>
            </Shell>

            {/* 목록 */}
            <Shell header="목록" badge="List">
              <div className="px-7 pb-7 pt-5">
                <div className="space-y-3">
                  {filtered.map((x) => {
                    const chips = parseTypes(x.typesText);
                    return (
                      <div
                        key={x.id}
                        className="rounded-3xl bg-white/80 ring-1 ring-slate-200/60 p-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-700 ring-1 ring-slate-200/70">
                              #{x.id}
                            </span>
                            <div className="text-sm font-semibold text-slate-500">
                              수정 후 저장을 눌러 적용
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => saveOne(x.id)}
                              disabled={x.saving || x.deleting}
                              className="rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-xs font-extrabold text-white shadow-sm hover:from-orange-600 hover:to-amber-600 disabled:opacity-60"
                            >
                              {x.saving ? "저장중..." : "저장"}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteOne(x.id)}
                              disabled={x.saving || x.deleting}
                              className="rounded-full bg-red-500 px-4 py-2 text-xs font-extrabold text-white shadow-sm hover:bg-red-600 disabled:opacity-60"
                            >
                              {x.deleting ? "삭제중..." : "삭제"}
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                          <Field label="불량">
                            <input
                              className={inputBase}
                              value={x.defect}
                              onChange={(e) =>
                                updateItem(x.id, { defect: e.target.value })
                              }
                            />
                          </Field>

                          <Field label="불량유형" hint="쉼표(,)로 구분 / textarea 세로 조절 가능">
                            <textarea
                              className={textareaBase}
                              value={x.typesText}
                              onChange={(e) =>
                                updateItem(x.id, { typesText: e.target.value })
                              }
                            />
                          </Field>
                        </div>

                        {chips.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {chips.map((c, i) => (
                              <span
                                key={i}
                                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200/70"
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {filtered.length === 0 && (
                    <div className={["p-4 text-sm text-slate-600", softPanel].join(" ")}>
                      검색 결과가 없습니다.
                    </div>
                  )}
                </div>
              </div>
            </Shell>
          </main>
        </div>
      </div>
    </div>
  );
}
