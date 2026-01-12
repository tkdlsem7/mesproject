// 📁 frontend/src/features/Auth/Login_function.tsx
import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { handleLoginSubmit } from "./Login_handler";
import { useAuth } from "../lib/AuthContext";

function LoginForm() {
  const [id, setId] = useState<string>("");
  const [pw, setPw] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // ✅ AuthContext: auth까지 추가한 버전 기준
  const { setUserNo, setManager, setAuth } = useAuth();

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;

    const _id = id.trim();
    const _pw = pw.trim();
    if (!_id || !_pw) return;

    try {
      setLoading(true);

      // ✅ 로그인 성공 시: 토큰/이름/user_no/auth 저장 + 전역 상태 업데이트까지 수행됨
      const ok = await handleLoginSubmit(_id, _pw, setManager, setUserNo, setAuth);

      if (ok) {
        // ✅ "받아온 그대로" 출력: 핸들러가 저장한 localStorage 값을 그대로 사용
        const name = localStorage.getItem("user_name") ?? _id;
        const authLabel = localStorage.getItem("user_auth") ?? "null";

        alert(`로그인 성공!\n이름: ${name}\n권한: ${authLabel}`);

        // ✅ 이동 경로 결정: ?redirect 우선, 없으면 /main
        const redirect = searchParams.get("redirect");
        navigate(redirect && redirect.startsWith("/") ? redirect : "/main", { replace: true });
      } else {
        alert("아이디 또는 비밀번호가 올바르지 않습니다.");
      }
    } catch {
      alert("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-100">
      <form
        onSubmit={onSubmit}
        className="w-[28rem] max-w-full rounded-2xl bg-white p-10 shadow-xl"
      >
        <h2 className="mb-8 text-center text-3xl font-extrabold tracking-tight text-gray-900 md:text-4xl">
          로그인
        </h2>

        <label className="mb-2 block text-base font-medium text-gray-700">아이디</label>
        <input
          type="text"
          placeholder="아이디를 입력하세요"
          className="mb-6 w-full rounded-lg border border-gray-300 px-4 py-3 text-base outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          value={id}
          onChange={(e) => setId(e.target.value)}
          autoComplete="username"
          required
        />

        <label className="mb-2 block text-base font-medium text-gray-700">비밀번호</label>
        <input
          type="password"
          placeholder="비밀번호를 입력하세요"
          className="mb-8 w-full rounded-lg border border-gray-300 px-4 py-3 text-base outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="current-password"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className={`w-full rounded-lg py-3 text-base font-semibold text-white ${
            loading ? "cursor-not-allowed bg-blue-300" : "bg-blue-600 hover:bg-blue-700"
          } transition`}
        >
          {loading ? "로그인 중..." : "로그인"}
        </button>

        <div className="mt-6 text-center text-sm text-gray-600">
          <Link to="/register" className="font-semibold text-blue-600 hover:text-blue-700">
            회원가입
          </Link>
        </div>
      </form>
    </div>
  );
}

export default LoginForm;
