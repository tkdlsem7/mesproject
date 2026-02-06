// src/Board/Boardpage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

// ✅ 전역 권한 가져오기
import { useAuth } from "../lib/AuthContext"; // 경로 맞게 수정

// CRA/Vite 공용: 환경변수 → 없으면 '/api'
export const API_BASE =
  process.env.NODE_ENV === "production" ? "/api" : "http://localhost:8000/api";

type BoardPost = {
  no: number;
  title: string;
  content: string;
  author_name: string;
  created_at: string; // ISO
  category: string;
};

const Boardpage: React.FC = () => {
  const navigate = useNavigate();

  // ✅ auth 가져오기 (컨텍스트 우선, 필요 시 localStorage fallback)
  const { auth: ctxAuth } = useAuth();
  const authValue = useMemo(() => {
    if (typeof ctxAuth === "number") return ctxAuth;
    const s = localStorage.getItem("user_auth");
    const n = s ? Number(s) : 0;
    return Number.isFinite(n) ? n : 0;
  }, [ctxAuth]);

  const canDelete = authValue >= 1; // ✅ 삭제 권한

  // UI 상태
  const [q, setQ] = useState("");
  const [selectedCat, setSelectedCat] = useState<string>("전체");

  // 데이터 상태
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // 목록 불러오기
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await axios.get<BoardPost[]>(`${API_BASE}/board`, {
          signal: controller.signal,
          timeout: 8000,
          headers: { Accept: "application/json" },
        });
        if (!alive) return;
        setPosts(Array.isArray(res.data) ? res.data : []);
      } catch (e: any) {
        const isCanceled =
          e?.code === "ERR_CANCELED" ||
          e?.name === "CanceledError" ||
          e?.message === "canceled" ||
          (axios.isCancel ? axios.isCancel(e) : false);
        if (!isCanceled) {
          console.error("GET /board failed:", e?.message || e);
          if (alive) setErr("목록을 불러오지 못했습니다.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  // 카테고리 목록(“전체” 포함)
  const categories = useMemo(() => {
    const set = new Set<string>();
    posts.forEach((p) => set.add(p.category || "일반"));
    return ["전체", ...Array.from(set).sort()];
  }, [posts]);

  // 검색/필터
  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    const cat = selectedCat;
    return posts.filter((p) => {
      const okCat = cat === "전체" ? true : (p.category || "일반") === cat;
      if (!okCat) return false;
      if (!k) return true;
      return (
        p.title.toLowerCase().includes(k) ||
        p.content.toLowerCase().includes(k) ||
        p.author_name.toLowerCase().includes(k) ||
        (p.category || "").toLowerCase().includes(k)
      );
    });
  }, [q, selectedCat, posts]);

  // 최신순
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => b.no - a.no);
    return arr;
  }, [filtered]);

  // 표시용 No
  const rows = useMemo(() => {
    let no = sorted.length;
    return sorted.map((p) => ({ ...p, displayNo: String(no--) }));
  }, [sorted]);

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  };

  // ✅ 삭제 핸들러 (권한 체크 포함)
  const handleDelete = async (postNo: number) => {
    if (!canDelete) {
      alert(`권한이 부족합니다.\n삭제는 auth 1 이상만 가능합니다.\n(현재 auth: ${authValue})`);
      return;
    }

    const ok = window.confirm("삭제하시겠습니까?");
    if (!ok) return;

    try {
      // (선택) 토큰이 필요하다면 Authorization도 넣어주세요.
      const token = localStorage.getItem("access_token");
      await axios.delete(`${API_BASE}/board/${postNo}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setPosts((prev) => prev.filter((x) => x.no !== postNo));
    } catch (err) {
      console.error(err);
      alert("삭제에 실패했습니다.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 상단바 */}
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-6 py-4">
          <button
            onClick={() => navigate(-1)}
            className="rounded-xl border border-slate-300 bg-white px-6 py-2 text-sm text-slate-800 hover:bg-slate-50"
            title="이전 페이지로 이동"
          >
            ← 뒤로가기
          </button>

          <div className="relative w-full">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="제목·내용·작성자·분류 검색"
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 pr-10 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              ⌘K
            </span>
          </div>

          <button
            onClick={() => navigate("/board/new")}
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-sky-700"
          >
            새 글쓰기
          </button>
        </div>

        {/* 카테고리 필터 */}
        <div className="mx-auto max-w-[1600px] px-6 pb-3">
          <div className="flex snap-x items-center gap-2 overflow-x-auto pb-1">
            {categories.map((c) => {
              const active = selectedCat === c;
              return (
                <button
                  key={c}
                  onClick={() => setSelectedCat(c)}
                  className={`snap-start rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "border-sky-600 bg-sky-600 text-white shadow-sm"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div className="mx-auto max-w-[1600px] px-6 py-6">
        {err && (
          <div className="mb-4 flex items-center justify-between rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">
            <span>{err}</span>
            <button
              className="rounded border border-rose-200 bg-white px-2 py-1 text-rose-700 hover:bg-rose-50"
              onClick={() => window.location.reload()}
            >
              다시 시도
            </button>
          </div>
        )}

        <div className="mb-3 flex items-center justify-between text-sm text-slate-600">
          <span>{loading ? "불러오는 중…" : `총 ${rows.length}건`}</span>
          {!loading && (
            <span className="text-slate-400">
              마지막 업데이트: {fmtDate(new Date().toISOString())}
            </span>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-[1000px] w-full table-fixed">
            <thead className="bg-slate-100">
              <tr className="text-left text-[13px] font-medium text-slate-600">
                <th className="w-20 px-4 py-3">No</th>
                <th className="w-36 px-4 py-3">분류</th>
                <th className="px-4 py-3">제목</th>
                <th className="w-44 px-4 py-3">글쓴이</th>
                <th className="w-48 px-4 py-3">작성시간</th>
                <th className="w-40 px-4 py-3">관리</th>
              </tr>
            </thead>

            <tbody>
              {loading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!loading &&
                rows.map((p) => (
                  <tr
                    key={p.no}
                    className="group cursor-pointer border-t transition hover:bg-slate-50"
                    onClick={() => navigate(`/board/${p.no}`)}
                    title="상세 보기"
                  >
                    <td className="px-4 py-3 text-sm text-slate-700">{p.displayNo}</td>

                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full border border-slate-300 bg-white px-2.5 py-0.5 text-xs text-slate-700 group-hover:border-sky-300 group-hover:text-sky-700">
                        {p.category || "일반"}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="truncate text-[15px] font-semibold text-slate-900">
                        {p.title}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-slate-500">
                        {p.content?.replace(/\s+/g, " ").slice(0, 80)}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-sm text-slate-700">{p.author_name}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{fmtDate(p.created_at)}</td>

                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/board/${p.no}/edit`);
                          }}
                          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1 text-sm text-amber-700 hover:bg-amber-100"
                        >
                          수정
                        </button>

                        {/* ✅ 삭제: auth 1 이상만 동작 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(p.no);
                          }}
                          disabled={!canDelete}
                          title={
                            canDelete
                              ? "삭제"
                              : `권한이 부족합니다. (현재 auth: ${authValue})`
                          }
                          className={`rounded-md px-3 py-1 text-sm ${
                            canDelete
                              ? "border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                              : "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                          }`}
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    검색/필터 결과가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Boardpage;
