// 📁 frontend/src/features/Auth/loginHandler.ts
// ─────────────────────────────────────────────────────────────
// 로그인 API 호출 유틸
//  - API_BASE: 사내 서버 FastAPI 주소 (고정)
//  - 성공 시: localStorage에 access_token / user_name 저장
// ─────────────────────────────────────────────────────────────

import axios from 'axios';

/**
 * [레거시 참고용] 과거 고정 IP.
 *  - 더 이상 사용하지 않지만, 히스토리용으로만 보존.
 */
const API_HOST = 'http://10.10.1.48:8000';

/** 사내 서버 FastAPI 고정 주소 */
export const API_BASE =
  process.env.NODE_ENV === "production"
    ? "/api"
    : "http://localhost:8000/api";

/** 서버 응답 타입(백엔드 스펙에 맞춤) */
type LoginResponse = {
  access_token: string;     // JWT
  token_type?: string;      // "bearer"
  name?: string;            // 사용자 표시명(없으면 username으로 대체)
  user_no?: number;         // (선택) 서버가 주면 사용
};

/**
 * 로그인 제출 핸들러
 */
export const handleLoginSubmit = async (
  username: string,
  password: string,
  setmanager: (name: string) => void,
  setUserNo: (no: number) => void
): Promise<boolean> => {
  try {
    const { data } = await axios.post<LoginResponse>(
      `${API_BASE}/auth/login`,
      {
        id: username,
        // ✅ 백엔드 스펙: 필드명은 pw
        pw: password,
      },
      {
        timeout: 20000,
      }
    );

    const { access_token, name, user_no } = data;

    if (!access_token) {
      throw new Error('서버 응답에 access_token이 없습니다.');
    }

    const displayName = name ?? username;

    // 토큰 저장
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('user_name', displayName);
    localStorage.setItem('token', access_token); // 레거시 호환

    // 전역 상태 업데이트
    setUserNo(user_no ?? 0);
    setmanager(displayName);

    return true;
  } catch (error) {
    console.error('로그인 실패:', error);
    alert('로그인에 실패했습니다. 아이디/비밀번호 또는 서버 상태를 확인해주세요.');
    return false;
  }
};
