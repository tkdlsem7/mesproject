import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type AuthContextType = {
  userNo: number | null;
  manager: string | null;
  auth: number | null; // ✅ 추가(권한)

  setUserNo: (no: number | null) => void;
  setManager: (name: string | null) => void;
  setAuth: (auth: number | null) => void; // ✅ 추가

  isAuthed: boolean;

  // ✅ 기존 호출 호환: login(name, userNo?)는 그대로 동작
  // ✅ auth는 3번째 인자로 선택적으로 전달 가능
  login: (name: string, userNo?: number | null, auth?: number | null) => void;
  logout: () => void;
};

// 기본값(undefined로 두고 훅에서 가드)
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 로컬스토리지 키 상수(핸들러와 동일해야 함)
const LS_TOKEN = "access_token";
const LS_NAME = "user_name";
const LS_USERNO = "user_no";     // 선택사항: 필요 시 저장
const LS_AUTH = "user_auth";     // ✅ 추가: auth 저장 키

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  // 전역 상태
  const [userNo, setUserNo] = useState<number | null>(null);
  const [manager, setManager] = useState<string | null>(null);
  const [auth, setAuth] = useState<number | null>(null); // ✅ 추가

  // 앱 시작 시 localStorage 값을 읽어와 상태 복구
  useEffect(() => {
    try {
      const name = localStorage.getItem(LS_NAME);
      const noStr = localStorage.getItem(LS_USERNO);
      const authStr = localStorage.getItem(LS_AUTH); // ✅ 추가

      if (name) setManager(name);

      if (noStr) {
        const n = Number(noStr);
        if (!Number.isNaN(n)) setUserNo(n);
      }

      if (authStr) {
        const a = Number(authStr);
        if (!Number.isNaN(a)) setAuth(a);
      }
    } catch {
      // 스토리지 접근 실패 시 무시
    }
  }, []);

  // 파생 상태: 토큰이 있으면 로그인된 것으로 간주(간단 판정)
  const isAuthed = useMemo(() => {
    try {
      const token = localStorage.getItem(LS_TOKEN);
      return Boolean(token);
    } catch {
      return false;
    }
  }, [manager, userNo, auth]); // ✅ auth도 포함(값 변경 시 재계산)

  // 로그인 성공 시 호출(예: 로그인 폼에서 API 성공 후)
  const login = (name: string, no: number | null = null, a: number | null = null) => {
    setManager(name);
    setUserNo(no);
    setAuth(a); // ✅ 추가

    try {
      localStorage.setItem(LS_NAME, name);

      if (no !== null) localStorage.setItem(LS_USERNO, String(no));
      else localStorage.removeItem(LS_USERNO);

      if (a !== null) localStorage.setItem(LS_AUTH, String(a)); // ✅ 추가
      else localStorage.removeItem(LS_AUTH);
    } catch {
      /* noop */
    }
  };

  // 로그아웃 처리
  const logout = () => {
    setManager(null);
    setUserNo(null);
    setAuth(null); // ✅ 추가
    try {
      localStorage.removeItem(LS_TOKEN);
      localStorage.removeItem(LS_NAME);
      localStorage.removeItem(LS_USERNO);
      localStorage.removeItem(LS_AUTH); // ✅ 추가
    } catch {
      /* noop */
    }
  };

  const value = useMemo<AuthContextType>(
    () => ({
      userNo,
      manager,
      auth,       // ✅ 추가
      setUserNo,
      setManager,
      setAuth,    // ✅ 추가
      isAuthed,
      login,
      logout,
    }),
    [userNo, manager, auth, isAuthed]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// 훅으로 사용(컨텍스트 누락 방지 가드 포함)
export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth는 <AuthProvider> 내부에서만 사용할 수 있습니다.");
  return ctx;
};
