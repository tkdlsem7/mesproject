// src/Board/BoardDetailPage.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';

export const API_BASE =
  process.env.NODE_ENV === "production" ? "/api" : "http://localhost:8000/api";

type Post = {
  no: number;
  title: string;
  content: string;
  author_name: string;
  created_at: string; // ISO
  category: string;
};

const BoardDetailPage: React.FC = () => {
  const { no } = useParams<{ no: string }>();
  const navigate = useNavigate();

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const authorName = useMemo(() => localStorage.getItem('user_name') || '미등록', []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await axios.get<Post>(`${API_BASE}/board/${no}`, { timeout: 8000 });
        if (!alive) return;
        setPost(res.data);
      } catch (e: any) {
        console.error(e);
        if (!alive) return;
        setErr('글을 불러오지 못했습니다.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [no]);

  const fmtDateTime = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert('링크가 복사되었습니다.');
    } catch {
      alert('복사에 실패했습니다.');
    }
  };

  const goEdit = () => {
    if (!post) return;
    navigate(`/board/${post.no}/edit`);
  };

  const handleDelete = async () => {
    if (!post) return;
    if (!window.confirm('정말 삭제하시겠습니까?')) return;

    try {
      setDeleting(true);
      const token = localStorage.getItem('access_token');
      await axios.delete(`${API_BASE}/board/${post.no}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      alert('삭제되었습니다.');
      navigate('/board', { replace: true });
    } catch (e) {
      console.error(e);
      alert('삭제에 실패했습니다. 권한/네트워크를 확인해 주세요.');
    } finally {
      setDeleting(false);
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
            >
              ← 뒤로가기
            </button>
            <h1 className="text-lg font-semibold text-slate-900">게시글</h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyLink}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              title="링크 복사"
            >
              링크 복사
            </button>
            {post && (
              <>
                <button
                  onClick={goEdit}
                  className="rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  수정
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold text-white ${
                    deleting ? 'bg-slate-400' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {deleting ? '삭제 중…' : '삭제'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div className="mx-auto max-w-[1000px] px-6 py-6">
        {loading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
            <div className="mt-4 h-9 w-3/4 animate-pulse rounded bg-slate-100" />
            <div className="mt-3 h-60 w-full animate-pulse rounded bg-slate-100" />
          </div>
        )}

        {err && (
          <div className="mb-3 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{err}</div>
        )}

        {post && (
          <article className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {/* 메타 */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-white">
                  {post.category || '일반'}
                </span>
                <time className="text-xs text-slate-500">{fmtDateTime(post.created_at)}</time>
              </div>
              <div className="text-sm text-slate-500">
                작성자:{' '}
                <span className="font-medium text-slate-700">{post.author_name || authorName}</span>
              </div>
            </div>

            {/* 제목 */}
            <h2 className="text-2xl font-bold text-slate-900">{post.title}</h2>

            {/* 내용 */}
            <div className="whitespace-pre-wrap text-[15px] leading-7 text-slate-800">
              {post.content}
            </div>

            {/* 하단 액션 */}
            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <button
                onClick={() => navigate('/board')}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                목록으로
              </button>
              <div className="text-xs text-slate-400">No. {post.no}</div>
            </div>
          </article>
        )}
      </div>
    </div>
  );
};

export default BoardDetailPage;
