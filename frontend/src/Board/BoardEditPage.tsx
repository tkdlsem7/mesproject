// src/Board/BoardEditPage.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';

export const API_BASE =
  process.env.NODE_ENV === "production" ? "/api" : "http://localhost:8000/api";

type Category = '공지사항' | '적용사항';
const CATEGORIES: Category[] = ['공지사항', '적용사항'];

type BoardPost = {
  no: number;
  title: string;
  content: string;
  category: string;
};

const BoardEditPage: React.FC = () => {
  const { no } = useParams<{ no: string }>();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<Category>('공지사항');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const baseInput =
    'w-full rounded-xl border border-slate-300 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200';

  // 작성자 표시(옵션)
  const authorName = useMemo(() => localStorage.getItem('user_name') || '미등록', []);

  // 초기 데이터 로드
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await axios.get<BoardPost>(`${API_BASE}/board/${no}`);
        if (!alive) return;
        setTitle(res.data.title || '');
        setContent(res.data.content || '');
        const cat = res.data.category as Category;
        setCategory(cat === '적용사항' ? '적용사항' : '공지사항');
      } catch (e: any) {
        console.error(e);
        if (alive) setErr('글을 불러오지 못했습니다.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [no]);

  // Ctrl/⌘ + S 저장
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        (document.getElementById('board-edit-save-btn') as HTMLButtonElement | null)?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!title.trim()) return setErr('제목을 입력해 주세요.');
    if (!content.trim()) return setErr('내용을 입력해 주세요.');

    try {
      setSaving(true);
      const token = localStorage.getItem('access_token');
      await axios.put(
        `${API_BASE}/board/${no}`,
        { title: title.trim(), content: content.trim(), category },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );
      navigate('/board', { replace: true });
    } catch (e: any) {
      console.error(e);
      setErr('수정에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

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
            <h1 className="text-lg font-semibold text-slate-900">글 수정</h1>
          </div>
          <div className="text-sm text-slate-500">
            작성자: <span className="font-medium text-slate-700">{authorName}</span>
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div className="mx-auto max-w-[1000px] px-6 py-6">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
            <div className="mt-4 h-10 w-full animate-pulse rounded bg-slate-100" />
            <div className="mt-3 h-72 w-full animate-pulse rounded bg-slate-100" />
          </div>
        ) : (
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
                          ? 'bg-sky-600 text-white shadow'
                          : 'bg-white text-slate-700 hover:bg-slate-100'
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
                <span className="text-xs text-slate-400">Ctrl/⌘ + S 로 저장</span>
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
            {err && (
              <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{err}</div>
            )}

            {/* 버튼 */}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => navigate('/board')}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                id="board-edit-save-btn"
                type="submit"
                disabled={saving}
                className={`rounded-xl px-5 py-2 text-sm font-semibold text-white shadow ${
                  saving ? 'cursor-not-allowed bg-slate-400' : 'bg-sky-600 hover:bg-sky-700'
                }`}
              >
                {saving ? '저장 중…' : '저장'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default BoardEditPage;
