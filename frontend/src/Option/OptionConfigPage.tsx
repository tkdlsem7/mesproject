// src/Options/OptionConfigPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, type NavigateFunction } from "react-router-dom";

/** ======================= 환경/유틸 ======================= */
export const API_BASE =
  process.env.NODE_ENV === "production"
    ? "/api"
    : "http://localhost:8000/api";
const OPTIONS_URL = `${API_BASE}/task-options`;

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const askConfirm = (message: string): boolean => {
  if (typeof window !== "undefined" && typeof window.confirm === "function") {
    return window.confirm(message);
  }
  return false;
};

/** ======================= 타입 ======================= */
type OptionRow = { id: number; name: string };

/** ======================= 컴포넌트 ======================= */
const OptionConfigPage: React.FC = () => {
  const routerNavigate: NavigateFunction = useNavigate();

  /** state */
  const [list, setList] = useState<OptionRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [newName, setNewName] = useState<string>("");
  const [q, setQ] = useState<string>("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState<string>("");

  /** utils */
  const hasDup = (name: string, exceptId?: number): boolean => {
    const norm = name.trim().toLowerCase();
    return list.some((o) => o.id !== exceptId && o.name.trim().toLowerCase() === norm);
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((o) => o.name.toLowerCase().includes(s));
  }, [q, list]);

  /** API */
  const fetchList = async (keyword = ""): Promise<void> => {
    try {
      setLoading(true);
      setErrorMsg("");
      const res = await fetch(`${OPTIONS_URL}?q=${encodeURIComponent(keyword)}`, {
        headers: { ...authHeaders() },
      });
      if (!res.ok) throw new Error(`목록 조회 실패: ${res.status}`);
      const data: OptionRow[] = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "네트워크 오류");
    } finally {
      setLoading(false);
    }
  };

  const createOption = async (name: string): Promise<OptionRow> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...authHeaders(),
    };
    const res = await fetch(OPTIONS_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!res.ok) {
      throw new Error(res.status === 409 ? "이미 존재하는 옵션명입니다." : `추가 실패: ${res.status}`);
    }
    return (await res.json()) as OptionRow;
  };

  const updateOption = async (id: number, name: string): Promise<OptionRow> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...authHeaders(),
    };
    const res = await fetch(`${OPTIONS_URL}/${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!res.ok) {
      throw new Error(res.status === 409 ? "이미 존재하는 옵션명입니다." : `수정 실패: ${res.status}`);
    }
    return (await res.json()) as OptionRow;
  };

  const deleteOption = async (id: number): Promise<void> => {
    const res = await fetch(`${OPTIONS_URL}/${id}`, {
      method: "DELETE",
      headers: { ...authHeaders() },
    });
    if (!res.ok) throw new Error(`삭제 실패: ${res.status}`);
  };

  /** lifecycle */
  useEffect(() => {
    void fetchList("");
  }, []);

  /** handlers */
  const onAdd = async (): Promise<void> => {
    const name = newName.trim();
    if (!name) return;
    if (hasDup(name)) return void alert("이미 존재하는 옵션명입니다.");
    try {
      setLoading(true);
      const created = await createOption(name);
      setList((prev) => [created, ...prev]);
      setNewName("");
    } catch (e: any) {
      alert(e?.message ?? "추가 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const goModifyPage = (row: OptionRow): void => {
    localStorage.setItem("selected_option_id", String(row.id));
    localStorage.setItem("selected_option_name", row.name);
    localStorage.setItem("selected_option_saved_at", new Date().toISOString());
    routerNavigate(`/options/modify/${row.id}?name=${encodeURIComponent(row.name)}`);
  };

  const onDelete = async (row: OptionRow): Promise<void> => {
    if (!askConfirm(`"${row.name}" 옵션을 삭제하시겠습니까?`)) return;
    try {
      setLoading(true);
      await deleteOption(row.id);
      setList((prev) => prev.filter((x) => x.id !== row.id));
    } catch (e: any) {
      alert(e?.message ?? "삭제 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const onSelect = (row: OptionRow): void => {
    setEditingId(row.id);
    setEditingName(row.name);
  };

  const onSave = async (): Promise<void> => {
    if (editingId == null) return;
    const name = editingName.trim();
    if (!name) return void alert("옵션명을 입력해주세요.");
    if (hasDup(name, editingId)) return void alert("이미 존재하는 옵션명입니다.");
    try {
      setLoading(true);
      const updated = await updateOption(editingId, name);
      setList((prev) => prev.map((x) => (x.id === editingId ? updated : x)));
      setEditingId(null);
      setEditingName("");
    } catch (e: any) {
      alert(e?.message ?? "수정 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const onCancel = (): void => {
    setEditingId(null);
    setEditingName("");
  };

  const onSearch = (): void => {
    void fetchList(q);
  };

  const onBack = (): void => {
    routerNavigate("/main");
  };

  /** 키보드 단축키: Enter=검색, Ctrl/Cmd+Enter=추가, Esc=편집취소 */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (e.key === "Enter" && !e.shiftKey && target.id === "search-input") {
      e.preventDefault();
      onSearch();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      onAdd();
    }
    if (e.key === "Escape" && editingId != null) {
      e.preventDefault();
      onCancel();
    }
  };

  /** render */
  return (
    <div className="min-h-screen bg-slate-50">
      {/* 상단 헤더 */}
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="shrink-0 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              ← 뒤로가기
            </button>
            <h1 className="text-lg font-semibold text-slate-900">Option 설정</h1>
          </div>
          <div className="text-sm text-slate-500">총 {filtered.length}건</div>
        </div>
      </div>

      {/* 본문 */}
      <div className="mx-auto max-w-[1200px] px-6 py-6" onKeyDown={handleKeyDown}>
        {/* 컨트롤 카드 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="mb-4 text-sm text-slate-500">
            옵션을 검색/추가하고, 행에서 바로 이름을 수정하거나 삭제할 수 있습니다. (Enter: 검색, Ctrl/⌘+Enter: 추가)
          </p>

          {/* 검색/추가 */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="md:col-span-2 flex gap-2">
              <input
                id="search-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="옵션 검색…"
                className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-200"
              />
              <button
                onClick={onSearch}
                className="shrink-0 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
              >
                검색
              </button>
            </div>

            <div className="flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="새 옵션명 (예: hot, cold…)"
                className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-200"
              />
              <button
                onClick={onAdd}
                disabled={loading || !newName.trim()}
                className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold text-white ${
                  loading || !newName.trim()
                    ? "bg-slate-400 cursor-not-allowed"
                    : "bg-orange-500 hover:bg-orange-600"
                }`}
                title="Ctrl/⌘+Enter 로도 추가"
              >
                + 추가
              </button>
            </div>
          </div>

          {/* 오류 */}
          {errorMsg && (
            <div className="mt-4 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{errorMsg}</div>
          )}
        </div>

        {/* 목록 테이블 */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="max-h-[60vh] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100">
                <tr className="text-left text-slate-700">
                  <th className="w-[70%] px-4 py-3">옵션명</th>
                  <th className="w-[30%] px-4 py-3 text-center">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading && list.length === 0 &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="bg-white">
                      <td className="px-4 py-3">
                        <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="mx-auto h-8 w-48 animate-pulse rounded bg-slate-100" />
                      </td>
                    </tr>
                  ))}

                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-14 text-center text-slate-400">
                      표시할 옵션이 없습니다. 상단에서 검색을 변경하거나 새 옵션을 추가하세요.
                    </td>
                  </tr>
                )}

                {filtered.map((row) => {
                  const isEditing = editingId === row.id;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 align-middle">
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-200"
                            placeholder="옵션명"
                          />
                        ) : (
                          <span className="inline-block w-full rounded-lg border border-slate-200 bg-white px-3 py-2">
                            {row.name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          {!isEditing ? (
                            <>
                              <button
                                onClick={() => onSelect(row)}
                                className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
                                aria-label="인라인 편집"
                              >
                                편집
                              </button>
                              <button
                                onClick={() => goModifyPage(row)}
                                className="rounded-lg border border-orange-300 bg-white px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50"
                                aria-label="상세 수정 페이지"
                              >
                                상세수정
                              </button>
                              <button
                                onClick={() => onDelete(row)}
                                className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600"
                              >
                                삭제
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={onSave}
                                disabled={loading}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${
                                  loading ? "bg-slate-400" : "bg-orange-500 hover:bg-orange-600"
                                }`}
                              >
                                저장
                              </button>
                              <button
                                onClick={onCancel}
                                className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-300"
                              >
                                취소
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 하단 바 */}
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            <span>총 {filtered.length}건</span>
            <span>Esc: 편집 취소 • Ctrl/⌘+Enter: 추가</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OptionConfigPage;
