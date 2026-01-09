// 📁 frontend/src/features/Auth/LoginForm.tsx
// ─────────────────────────────────────────────────────────────
// 로그인 폼 (디자인 확대판)
//  - 타이틀/입력/버튼 사이즈 상향
//  - 여백(padding)과 라운드, 그림자 강화
//  - 나머지 로직/흐름은 그대로 유지
// ─────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { handleLoginSubmit } from './Login_handler';
import { useAuth } from '../lib/AuthContext'; // 경로는 기존 그대로 유지 (기능 수정 없음)

/** JWT payload에서 이름 추출 (base64url → JSON) */
function pickNameFromJwt(token: string | null, fallback: string): string {
  if (!token) return fallback;
  try {
    const payload = token.split('.')[1]; // header.payload.signature
    if (!payload) return fallback;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/'); // base64url→base64
    const jsonStr = atob(base64);
    const data = JSON.parse(jsonStr);

    const name =
      data?.name ??
      data?.user_name ??
      data?.username ??
      data?.manager ??
      data?.id ??
      data?.sub;

    const s = (name ?? '').toString().trim();
    return s || fallback;
  } catch {
    return fallback;
  }
}

function LoginForm() {
  /** ----------------------------- state ----------------------------- */
  const [id, setId] = useState<string>('');        // 아이디
  const [pw, setPw] = useState<string>('');        // 비밀번호
  const [loading, setLoading] = useState(false);   // 전송 중 여부

  /** ----------------------------- hooks ----------------------------- */
  const { setUserNo, setManager } = useAuth();     // 전역 사용자 상태 세터
  const navigate = useNavigate();                  // 페이지 이동
  const [searchParams] = useSearchParams();        // ?redirect=/xxx 지원

  /** --------------------------- handlers ---------------------------- */
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;                  // 중복 제출 방지
    if (!id.trim() || !pw.trim()) return; // 간단 검증

    try {
      setLoading(true);

      // ✅ 로그인 요청 (내부에서 access_token 저장 가정)
      const ok = await handleLoginSubmit(id, pw, setManager, setUserNo);

      if (ok) {
        // ✅ JWT에서 이름 추출 → localStorage.user_name 저장
        const token = localStorage.getItem('access_token');
        const name = pickNameFromJwt(token, id); // 이름 없으면 아이디로 폴백
        localStorage.setItem('user_name', name);

        // ✅ 이동 경로 결정: ?redirect 우선, 없으면 /main
        const redirect = searchParams.get('redirect');
        navigate(redirect && redirect.startsWith('/') ? redirect : '/main', {
          replace: true,
        });
      } else {
        alert('아이디 또는 비밀번호가 올바르지 않습니다.');
      }
    } catch {
      alert('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  /** --------------------------- render ------------------------------ */
  return (
    <div className="flex h-screen items-center justify-center bg-gray-100">
      {/* 🔎 폼 박스 크기/여백/그림자/라운드 모두 키움 */}
      <form
        onSubmit={onSubmit}
        className="w-[28rem] max-w-full rounded-2xl bg-white p-10 shadow-xl"
      >
        {/* 타이틀 사이즈 업 */}
        <h2 className="mb-8 text-center text-3xl font-extrabold tracking-tight text-gray-900 md:text-4xl">
          로그인
        </h2>

        {/* 아이디 입력: 폰트/패딩/포커스 링 업그레이드 */}
        <label className="mb-2 block text-base font-medium text-gray-700">
          아이디
        </label>
        <input
          type="text"
          placeholder="아이디를 입력하세요"
          className="mb-6 w-full rounded-lg border border-gray-300 px-4 py-3 text-base outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          value={id}
          onChange={(e) => setId(e.target.value)}
          autoComplete="username"
          required
        />

        {/* 비밀번호 입력 */}
        <label className="mb-2 block text-base font-medium text-gray-700">
          비밀번호
        </label>
        <input
          type="password"
          placeholder="비밀번호를 입력하세요"
          className="mb-8 w-full rounded-lg border border-gray-300 px-4 py-3 text-base outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="current-password"
          required
        />

        {/* 로그인 버튼: 높이/폰트 키움 */}
        <button
          type="submit"
          disabled={loading}
          className={`w-full rounded-lg py-3 text-base font-semibold text-white ${
            loading
              ? 'cursor-not-allowed bg-blue-300'
              : 'bg-blue-600 hover:bg-blue-700'
          } transition`}
        >
          {loading ? '로그인 중...' : '로그인'}
        </button>

        {/* 회원가입 링크: 상단 여백 키움 */}
        <div className="mt-6 text-center text-sm text-gray-600">

        </div>
      </form>
    </div>
  );
}

export default LoginForm;
