// src/Board/BoardNewPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

// ✅ 전역 auth 컨텍스트
import { useAuth } from "../lib/AuthContext";

// CRA/Vite 공용: 환경변수 → 없으면 '/api'
export const API_BASE =
  process.env.NODE_ENV === "production" ? "/api" : "http://localhost:8000/api";

type Category = "공지사항" | "적용사항";
const CATEGORIES: Category[] = ["공지사항", "적용사항"];

const LS_AUTH = "user_auth";
const LS_NAME = "user_name";

const BoardNewPage: React.FC = () => {
  const navigate = useNavigate();
  const { manager, auth: ctxAuth } = useAuth();

  // ✅ auth 값: 컨텍스트 우선, 없으면 localStorage fallback
  const authValue = useMemo(() => {
    if (typeof ctxAuth === "number") return ctxAuth;
    const s = localStorage.getItem(LS_AUTH);
    const n = s ? Number(s) : 0;
    return Number.isFinite(n) ? n : 0;
  }, [ctxAuth]);

  // ✅ 작성자명: 컨텍스트(manager) 우선, 없으면 localStorage fallback
  const authorName = useMemo(() => {
    const fromCtx = (manager ?? "").trim();
    if (fromCtx) return fromCtx;
    return (localStorage.getItem(LS_NAME) || "미등록").trim();
  }, [manager]);

  // ✅ 한글 안전하게 변환
  const authorHeader = useMemo(() => encodeURIComponent(authorName), [authorName]);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<Category>("공지사항");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ✅ 권한 가드 (auth < 1이면 등록 페이지 진입 불가)
  // - StrictMode에서 effect 2번 실행되는 경우가 있어서 ref로 1회만 alert 처리
  const blockedOnceRef = useRef(false);
  useEffect(() => {
    if (authValue >= 1) return;

    if (blockedOnceRef.current) return;
    blockedOnceRef.current = true;

    alert("권한이 없습니다. (게시글 등록은 auth 1 이상만 가능)");
    navigate("/board", { replace: true });
  }, [authValue, navigate]);

  // Ctrl/⌘ + Enter 로 제출
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        (document.getElementById("board-submit-btn") as HTMLButtonElement | null)?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // ✅ 저장 시점에서도 한 번 더 방어
    if (authValue < 1) {
      alert("권한이 없습니다. (게시글 등록은 auth 1 이상만 가능)");
      return;
    }

    if (!title.trim()) return setError("제목을 입력해 주세요.");
    if (!content.trim()) return setError("내용을 입력해 주세요.");

    try {
      setSubmitting(true);
      const token = localStorage.getItem("access_token");

      await axios.post(
        `${API_BASE}/board`,
        {
          title: title.trim(),
          content: content.trim(),
          category,
        },
        {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            "X-User-Name": authorHeader,
          },
        }
      );

      navigate("/board", { replace: true });
    } catch (err: any) {
      console.error(err);
      if (err?.response?.status === 401) {
        setError("로그인이 필요합니다. 다시 로그인해 주세요.");
      } else if (err?.response?.data?.detail) {
        setError(String(err.response.data.detail));
      } else {
        setError("등록 중 오류가 발생했습니다.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // 공통 인풋 스타일
  const baseInput =
    "w-full rounded-xl border border-slate-300 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 상단바 */}
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1000px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="shrink-0 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              title="뒤로가기"
            >
              ← 뒤로가기
            </button>
            <h1 className="text-lg font-semibold text-slate-900">글 쓰기</h1>
          </div>
          <div className="text-sm text-slate-500">
            작성자: <span className="font-medium text-slate-700">{authorName}</span>
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div className="mx-auto max-w-[1000px] px-6 py-6">
        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          {/* 카테고리 */}
          <section>
            <label className="mb-2 block text-sm font-medium text-slate-800">분류</label>
            <div className="inline-flex gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1">
              {CATEGORIES.map((c) => {
                const active = category === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                      active
                        ? "bg-sky-600 text-white shadow"
                        : "bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 제목 */}
          <section>
            <label className="mb-2 block text-sm font-medium text-slate-800">제목</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`${baseInput} px-4 py-3 text-[15px]`}
              placeholder="제목을 입력하세요"
              maxLength={200}
            />
            <div className="mt-1 text-right text-xs text-slate-400">{title.length}/200</div>
          </section>

          {/* 내용 */}
          <section>
            <div className="mb-2 flex items-end justify-between">
              <label className="block text-sm font-medium text-slate-800">내용</label>
              <span className="text-xs text-slate-400">Ctrl/⌘ + Enter 로 등록</span>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className={`${baseInput} h-[420px] resize-y p-4 text-[15px] leading-7`}
              placeholder="내용을 입력하세요"
            />
            <div className="mt-1 text-right text-xs text-slate-400">
              {content.length.toLocaleString()} chars
            </div>
          </section>

          {/* 에러 */}
          {error && (
            <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>
          )}

          {/* 버튼 */}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => navigate("/board")}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              취소
            </button>
            <button
              id="board-submit-btn"
              type="submit"
              disabled={submitting}
              className={`rounded-xl px-5 py-2 text-sm font-semibold text-white shadow ${
                submitting ? "cursor-not-allowed bg-slate-400" : "bg-sky-600 hover:bg-sky-700"
              }`}
            >
              {submitting ? "등록 중…" : "등록"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BoardNewPage;
