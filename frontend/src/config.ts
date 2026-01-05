const raw = process.env.REACT_APP_API_BASE;

// 맨 뒤 / 제거 + 값 없으면 '/api' 기본값
export const API_BASE: string = (raw ? raw.replace(/\/$/, "") : "") || "/api";