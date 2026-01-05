type AnyEnv = Record<string, any>;

const getEnv = () => {
  // CRA 환경변수만 사용 (REACT_APP_... 형태)
  const craEnv: AnyEnv =
    (typeof process !== "undefined" ? (process as any).env : {}) || {};

  const nodeEnv = craEnv.NODE_ENV || process.env.NODE_ENV || "development";

  // 1) .env에 값이 있으면 그거 사용
  //    예: REACT_APP_API_BASE=http://backend:8000  (docker dev)
  //        REACT_APP_API_BASE=http://192.168.101.1:8000 (서버 직접)
  let API_BASE = String(craEnv.REACT_APP_API_BASE || "").replace(/\/+$/, "");

  // 2) 없으면 개발/운영에 따라 기본값
  if (!API_BASE) {
    if (nodeEnv === "development") {
      // 로컬 개발: 도커 dev 백엔드
      API_BASE = "http://localhost:8000";
    } else {
      // 운영: 동일 출처(/api 프록시) 사용 → BASE 비워두기
      API_BASE = "";
    }
  }

  // PREFIX: 기본은 '/api'
  // .env에 REACT_APP_API_PREFIX가 있으면 그걸로 덮어씀
  const rawPrefix = craEnv.REACT_APP_API_PREFIX ?? "/api";
  const API_PREFIX = rawPrefix
    ? `/${String(rawPrefix).replace(/^\/+/, "").replace(/\/+$/, "")}`
    : "";

  return { API_BASE, API_PREFIX };
};

const { API_BASE, API_PREFIX } = getEnv();

const buildUrl = (path: string) => {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${API_PREFIX}${p}`;
};

const authHeaders = (): Record<string, string> => {
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// -------------------- 타입 --------------------
export type SlotStatus = "가능" | "불가능" | null;

export type SlotRow = {
  id: string;
  slot_code: string;
  machine_id: string | null;
  progress: number;
  shipping_date: string | null;
  manager: string | null;
  site: string | null;

  // 프리필용 기타 필드
  customer: string | null;
  serial_number: string | null;
  note: string | null;
  status: SlotStatus;
};

// -------------------- 노멀라이저 --------------------
const toDateString = (v: any): string | null => {
  if (!v) return null;
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
};

const normalizeSlotRow = (raw: any): SlotRow => {
  const statusRaw = raw?.status;
  const status: SlotStatus =
    statusRaw === "가능" ? "가능" : statusRaw === "불가능" ? "불가능" : null;

  const progressNum = Number(raw?.progress);
  const progress = Number.isFinite(progressNum) ? progressNum : 0;

  return {
    id: raw?.id ?? raw?.slot_code ?? "",
    slot_code: String(raw?.slot_code ?? "").toUpperCase(),
    machine_id: raw?.machine_id ?? null,
    progress,
    shipping_date: toDateString(raw?.shipping_date),
    manager: raw?.manager ?? null,
    site: raw?.site ?? null,

    customer: raw?.customer ?? null,
    serial_number: raw?.serial_number ?? null,
    note: raw?.note ?? null,
    status,
  };
};

// -------------------- API --------------------
/** 슬롯 목록 조회 (/api 경로 우선 + 폴백) */
export async function fetchSlots(opts: { site: string; building: "A" | "B" | "I" }): Promise<SlotRow[]> {
  const qs = new URLSearchParams({ site: opts.site, building: opts.building }).toString();
  const path = `/dashboard/slots?${qs}`;

  const urls = Array.from(
    new Set([
      `/api${path}`,            // ✅ CRA 프록시(동일 출처) 1순위
      buildUrl(path),           // VITE/CRA ENV 조합 (API_BASE+API_PREFIX)
      `${API_BASE}${path}`,     // BASE만 설정된 경우
      path,                     // 최후 폴백(동일 출처/리버스 프록시)
    ])
  );

  for (let i = 0; i < urls.length; i += 1) {
    const url = urls[i];
    try {
      const res = await fetch(url, { credentials: "include", headers: { ...authHeaders() } });
      if (res.ok) {
        const rows = await res.json();
        return (Array.isArray(rows) ? rows : []).map(normalizeSlotRow);
      }
      if (res.status !== 404) {
        const text = await res.text().catch(() => "");
        throw new Error(`슬롯 조회 실패: ${res.status}${text ? ` - ${text}` : ""}`);
      }
    } catch (e) {
      if (i === urls.length - 1) throw e;
    }
  }
  throw new Error("슬롯 조회 실패: 모든 후보 URL 404");
}

/** 출하 처리 (/api 경로 우선 + 폴백) */
export async function shipEquipment(slotCode: string): Promise<void> {
  const path = `/dashboard/ship/${encodeURIComponent(slotCode)}`;
  const urls = Array.from(
    new Set([
      `/api${path}`,            // ✅ CRA 프록시 1순위
      buildUrl(path),
      `${API_BASE}${path}`,
      path,
    ])
  );

  let lastStatus = 0;
  let lastText = "";
  for (let i = 0; i < urls.length; i += 1) {
    const url = urls[i];
    try {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { ...authHeaders() },
      });
      if (res.ok) return;
      lastStatus = res.status;
      lastText = await res.text().catch(() => "");
      if (res.status !== 404) break;
    } catch (e) {
      if (i === urls.length - 1) throw e;
    }
  }
  throw new Error(`출하 처리 실패: ${lastStatus}${lastText ? ` - ${lastText}` : ""}`);
}
