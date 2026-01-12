// 📁 frontend/src/features/Auth/loginHandler.ts
// ─────────────────────────────────────────────────────────────
// 로그인 API 호출 유틸
//  - 성공 시: localStorage에 access_token / user_name / user_no / user_auth 저장
//  - 성공 시: AuthContext 전역 상태 setManager/setUserNo/setAuth 업데이트
// ─────────────────────────────────────────────────────────────

import axios from "axios";

/**
 * [레거시 참고용] 과거 고정 IP.
 *  - 더 이상 사용하지 않지만, 히스토리용으로만 보존.
 */
const API_HOST = "http://10.10.1.48:8000";

/** 사내 서버 FastAPI 고정 주소 */
export const API_BASE =
  process.env.NODE_ENV === "production" ? "/api" : "http://localhost:8000/api";

/** 서버 응답 타입(백엔드 스펙에 맞춤) */
type LoginResponse = {
  access_token: string; // JWT
  token_type?: string;  // "bearer" (있으면 받기만)
  name?: string;        // 사용자 표시명
  user_no?: number;     // (선택) 서버가 주면 사용
  auth?: number;        // ✅ 추가: 권한
};

const LS_TOKEN = "access_token";
const LS_NAME = "user_name";
const LS_USERNO = "user_no";
const LS_AUTH = "user_auth";

/**
 * 로그인 제출 핸들러
 */
export const handleLoginSubmit = async (
  username: string,
  password: string,
  setManager: (name: string | null) => void,
  setUserNo: (no: number | null) => void,
  setAuth: (auth: number | null) => void
): Promise<boolean> => {
  try {
    const { data } = await axios.post<LoginResponse>(
      `${API_BASE}/auth/login`,
      {
        id: username,
        // ✅ 백엔드 스펙: 필드명은 pw
        pw: password,
      },
      { timeout: 20000 }
    );

    const { access_token, name, user_no, auth } = data;

    if (!access_token) {
      throw new Error("서버 응답에 access_token이 없습니다.");
    }

    const displayName = (name ?? username).toString().trim() || username;

    // ✅ localStorage 저장 (AuthContext가 앱 시작 시 복구)
    localStorage.setItem(LS_TOKEN, access_token);
    localStorage.setItem(LS_NAME, displayName);
    localStorage.setItem("token", access_token); // 레거시 호환(있어도 무방)

    if (typeof user_no === "number") localStorage.setItem(LS_USERNO, String(user_no));
    else localStorage.removeItem(LS_USERNO);

    if (typeof auth === "number") localStorage.setItem(LS_AUTH, String(auth)); // ✅ 추가
    else localStorage.removeItem(LS_AUTH);

    // ✅ 전역 상태 업데이트
    setManager(displayName);
    setUserNo(typeof user_no === "number" ? user_no : null);
    setAuth(typeof auth === "number" ? auth : null);

    return true;
  } catch (error) {
    console.error("로그인 실패:", error);
    alert("로그인에 실패했습니다. 아이디/비밀번호 또는 서버 상태를 확인해주세요.");
    return false;
  }
};
