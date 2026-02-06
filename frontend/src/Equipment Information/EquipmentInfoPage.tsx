// src/pages/EquipmentInfoPage.tsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

/* ----------------------------------------------------------------------------- */
export const API_BASE =
  process.env.NODE_ENV === "production" ? "/api" : "http://localhost:8000/api";

const authHeaders = (): Record<string, string> => {
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
};

async function fetchEquipmentOptionCodes(machineId: string): Promise<string[]> {
  if (!machineId.trim()) return [];
  const url = `${API_BASE}/dashboard/equipment/options/${encodeURIComponent(
    machineId.trim()
  )}`;
  const res = await fetch(url, {
    credentials: "include",
    headers: { ...authHeaders() },
  });
  if (!res.ok) return [];
  const data = await res.json(); // { option_codes: string[] }
  return Array.isArray(data?.option_codes) ? (data.option_codes as string[]) : [];
}

type OptionRow = { id: number; name: string };

async function fetchAllTaskOptions(): Promise<OptionRow[]> {
  const res = await fetch(`${API_BASE}/task-options?q=&limit=1000`, {
    credentials: "include",
    headers: { ...authHeaders() },
  });
  if (!res.ok) return [];
  const list = (await res.json()) as OptionRow[];
  return Array.isArray(list) ? list : [];
}

async function tryFetchReceiptDate(machineId: string): Promise<string | null> {
  const mid = machineId.trim();
  if (!mid) return null;

  const tryUrls = [
    `${API_BASE}/dashboard/equipment/receipt-date/${encodeURIComponent(mid)}`,
    `${API_BASE}/dashboard/equipment/receipt-date?machine_no=${encodeURIComponent(mid)}`,
  ];

  for (const url of tryUrls) {
    try {
      const res = await fetch(url, {
        credentials: "include",
        headers: { ...authHeaders() },
      });
      if (!res.ok) continue;

      const data = await res.json();
      const v =
        typeof data === "string"
          ? data
          : (data?.receive_date ?? data?.receiveDate ?? data?.date ?? null);

      if (typeof v === "string" && v.trim()) return v.slice(0, 10);
    } catch {}
  }
  return null;
}

/** ✅ 추가: 슬롯+사이트로 equip_progress 상세 불러오기 */
type EquipDetailRes = {
  row_no: number;
  machine_id?: string | null;
  shipping_date?: string | null;
  manager?: string | null;
  customer?: string | null;
  slot_code?: string;
  site?: string | null;

  serial_number?: string | null;
  chiller_serial_number?: string | null;

  status?: "가능" | "불가능" | null;
  note?: string | null;

  // (선택) 백엔드가 같이 내려주면 사용
  receive_date?: string | null;
};

async function fetchEquipmentDetailBySlot(
  site: string,
  slotCode: string
): Promise<EquipDetailRes | null> {
  const slot = (slotCode || "").trim().toUpperCase(); // ✅ 대문자
  if (!slot) return null;

  const url = `${API_BASE}/dashboard/equipment/detail?site=${encodeURIComponent(
    (site || "").trim()
  )}&slot_code=${encodeURIComponent(slot)}`;

  try {
    const res = await fetch(url, {
      credentials: "include",
      headers: { ...authHeaders() },
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("[detail] FAIL", res.status, url, txt); // ✅ 원인 확인 가능
      return null;
    }

    const data = (await res.json()) as EquipDetailRes;
    return data;
  } catch (e) {
    console.error("[detail] ERROR", url, e);
    return null;
  }
}

const safeGet = (k: string) => {
  try {
    const v = localStorage.getItem(k);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
};

const useQuery = () => {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
};

type InfoIntentLite = {
  machineId?: string;
  values?: {
    shipDate?: string | null;
    receiveDate?: string | null;
    manager?: string | null;
    customer?: string | null;
    status?: "가능" | "불가능" | string | null;
    serialNumber?: string | null;
    // ✅ 추가
    chillerSerialNumber?: string | null;
    note?: string | null;
  };
};

const Shell: React.FC<{
  children: React.ReactNode;
  className?: string;
  header?: string;
  right?: React.ReactNode;
}> = ({ children, className, header, right }) => (
  <section className={`rounded-2xl bg-white shadow-md ring-1 ring-gray-100 ${className ?? ""}`}>
    <div className="h-2 rounded-t-2xl bg-gradient-to-r from-sky-200 via-cyan-200 to-sky-200" />
    {(header || right) && (
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <h3 className="text-base font-semibold text-gray-800">{header}</h3>
        {right}
      </div>
    )}
    {children}
  </section>
);

/* 옵션 선택 모달(생략: 기존 그대로) */
const OptionSelectModal: React.FC<{
  open: boolean;
  initialSelected: OptionRow[];
  onClose: () => void;
  onConfirm: (rows: OptionRow[]) => void;
}> = ({ open, initialSelected, onClose, onConfirm }) => {
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<OptionRow[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Map<number, OptionRow>>(new Map());

  useEffect(() => {
    if (!open) return;
    const m = new Map<number, OptionRow>();
    initialSelected.forEach((r) => m.set(r.id, r));
    setPicked(m);
  }, [open, initialSelected]);

  const fetchList = async (keyword = "") => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch(
        `${API_BASE}/task-options?q=${encodeURIComponent(keyword)}&limit=200`,
        { credentials: "include", headers: { ...authHeaders() } }
      );
      if (!res.ok) throw new Error(`옵션 조회 실패: ${res.status}`);
      const data: OptionRow[] = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message ?? "네트워크 오류");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchList("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => fetchList(q), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open]);

  const togglePick = (row: OptionRow) =>
    setPicked((prev) => {
      const m = new Map(prev);
      m.has(row.id) ? m.delete(row.id) : m.set(row.id, row);
      return m;
    });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <div className="text-base font-semibold text-gray-900">장비 옵션 선택</div>
            <div className="mt-1 text-xs text-gray-500">검색 후 체크박스로 선택하세요.</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
          >
            닫기
          </button>
        </div>

        <div className="px-5 py-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="옵션 검색..."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
          />

          <div className="mt-4 max-h-[380px] overflow-auto rounded-xl border border-gray-100">
            {loading ? (
              <div className="py-12 text-center text-sm text-gray-500">불러오는 중...</div>
            ) : error ? (
              <div className="py-12 text-center text-sm text-red-600">{error}</div>
            ) : list.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">표시할 옵션이 없습니다.</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {list.map((row) => {
                  const checked = picked.has(row.id);
                  return (
                    <li key={row.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePick(row)}
                          className="h-4 w-4 accent-sky-600"
                        />
                        <span className="text-sm text-slate-800">{row.name}</span>
                      </div>
                      {checked && (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">
                          선택됨
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between px-5 pb-5">
          <span className="text-xs text-gray-500">선택: {picked.size}건</span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-full bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300"
            >
              취소
            </button>
            <button
              onClick={() => onConfirm(Array.from(picked.values()))}
              className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
            >
              완료
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const EquipmentInfoPage: React.FC = () => {
  const query = useQuery();
  const navigate = useNavigate();

  const { auth } = useAuth();
  const canEdit = (auth ?? 0) >= 1;

  const site = query.get("site") ?? safeGet("selected_site") ?? "본사";
  const line = query.get("line") ?? safeGet("selected_line") ?? "A동";
  const slot = query.get("slot") ?? safeGet("selected_slot") ?? "-";

  const emptyFlag = safeGet("selected_machine_is_empty");
  const machineFromQuery = query.get("machine");
  const machineFromStorage = emptyFlag === "1" ? "" : safeGet("selected_machine_id") ?? "";
  const machineInit = emptyFlag === "1" ? "" : ((machineFromQuery ?? machineFromStorage) || "").trim();

  const [machineId, setMachineId] = useState<string>(machineInit);
  const [shippingDate, setShippingDate] = useState<string>("");
  const [receiveDate, setReceiveDate] = useState<string>("");
  const [manager, setManager] = useState<string>("");
  const [customer, setCustomer] = useState<string>("");
  const [status, setStatus] = useState<"가능" | "불가능">("불가능");
  const [serialNumber, setSerialNumber] = useState<string>("");

  // ✅ 칠러 시리얼
  const [chillerSerialNumber, setChillerSerialNumber] = useState<string>("");

  const [note, setNote] = useState<string>("");

  const [saving, setSaving] = useState(false);

  const [selectedOptions, setSelectedOptions] = useState<OptionRow[]>([]);
  const [optOpen, setOptOpen] = useState(false);

  const optionsDirtyRef = useRef(false);
  const receiveDirtyRef = useRef(false);

  /** ✅ 상세 1회만 로드 */
  const detailLoadedRef = useRef(false);

  const announcedRef = useRef(false);
  useEffect(() => {
    if (announcedRef.current) return;
    announcedRef.current = true;
    alert(`${site} > ${line} > ${slot} / ${machineId || "-"} 호기를 선택하셨습니다.`);
  }, [site, line, slot, machineId]);

  useEffect(() => {
    const isEmpty = emptyFlag === "1" || !machineInit;
    if (isEmpty) {
      setMachineId("");
      setShippingDate("");
      setReceiveDate("");
      setManager("");
      setCustomer("");
      setStatus("불가능");
      setSerialNumber("");
      setChillerSerialNumber("");
      setNote("");

      try {
        localStorage.removeItem("selected_machine_is_empty");
        localStorage.removeItem("selected_machine_id");
        localStorage.removeItem("machine_info_intent");
        (window as any).__MACHINE_INFO_INTENT__ = undefined;
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 기존 intent(로컬) 우선 채우기 */
  useEffect(() => {
    const isEmpty = emptyFlag === "1" || !machineInit;
    if (isEmpty) return;

    try {
      const raw = localStorage.getItem("machine_info_intent");
      if (!raw) return;

      const intent = JSON.parse(raw) as InfoIntentLite | any;
      const v = intent?.values ?? {};

      const toDateInput = (s: any) => {
        if (!s) return null;
        if (typeof s !== "string") return null;
        return s.length >= 10 ? s.slice(0, 10) : s;
      };

      if (typeof intent?.machineId === "string") setMachineId(intent.machineId);

      if ("shipDate" in v) {
        const ds = toDateInput(v.shipDate);
        if (ds !== null) setShippingDate(ds);
      }

      if ("receiveDate" in v) {
        const rd = toDateInput(v.receiveDate);
        if (rd !== null) setReceiveDate(rd);
      }

      if ("manager" in v && typeof v.manager === "string") setManager(v.manager ?? "");
      if ("customer" in v && typeof v.customer === "string") setCustomer(v.customer ?? "");
      if ("serialNumber" in v && typeof v.serialNumber === "string") setSerialNumber(v.serialNumber ?? "");

      if ("chillerSerialNumber" in v && typeof v.chillerSerialNumber === "string") {
        setChillerSerialNumber(v.chillerSerialNumber ?? "");
      }

      if ("note" in v && typeof v.note === "string") setNote(v.note ?? "");
      if ("status" in v && (v.status === "가능" || v.status === "불가능")) setStatus(v.status);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ✅ DB 최신값(특히 chiller_serial_number) 로드해서 덮어쓰기 */
  useEffect(() => {
    const isEmpty = emptyFlag === "1";
    const slotNorm = (slot || "").trim().toUpperCase();
    const siteNorm = (site || "").trim();

    if (isEmpty) return;
    if (!slotNorm || slotNorm === "-") return;

    if (detailLoadedRef.current) return;

    let aborted = false;

    (async () => {
      const d = await fetchEquipmentDetailBySlot(siteNorm, slotNorm);
      if (aborted) return;

      if (!d) {
        // ✅ 실패면 다음에도 다시 시도할 수 있게 ref를 true로 만들지 않음
        return;
      }

      // ✅ 성공했을 때만 true
      detailLoadedRef.current = true;

      // 서버 값으로 state 갱신
      if (typeof d.machine_id === "string") setMachineId(d.machine_id ?? "");
      if (typeof d.shipping_date === "string")
        setShippingDate(d.shipping_date ? d.shipping_date.slice(0, 10) : "");

      if (typeof d.manager === "string") setManager(d.manager ?? "");
      if (typeof d.customer === "string") setCustomer(d.customer ?? "");

      if (typeof d.serial_number === "string") setSerialNumber(d.serial_number ?? "");

      // ✅ 키가 snake/camel 둘 다 대비 (백엔드/프론트 혼재 대비)
      const ch =
        typeof (d as any).chiller_serial_number === "string"
          ? (d as any).chiller_serial_number
          : typeof (d as any).chillerSerialNumber === "string"
            ? (d as any).chillerSerialNumber
            : "";

      setChillerSerialNumber(ch ?? "");

      if (typeof d.note === "string") setNote(d.note ?? "");
      if (d.status === "가능" || d.status === "불가능") setStatus(d.status);

      if (!receiveDirtyRef.current && !receiveDate) {
        const rd = (d as any).receive_date;
        if (typeof rd === "string" && rd.trim()) setReceiveDate(rd.slice(0, 10));
      }
    })();

    return () => {
      aborted = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 입고일은 receipt_log에서 자동 조회 */
  useEffect(() => {
    let aborted = false;

    const run = async () => {
      const mid = (machineId || "").trim();
      if (!mid) return;
      if (receiveDirtyRef.current) return;
      if (receiveDate) return;

      const rd = await tryFetchReceiptDate(mid);
      if (aborted) return;
      if (!rd) return;

      setReceiveDate(rd);
    };

    run();
    return () => {
      aborted = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineId]);

  /** 옵션은 machineId 기반으로 로드 */
  useEffect(() => {
    let aborted = false;
    const load = async () => {
      const mid = (machineId || "").trim();

      if (!mid) {
        if (!optionsDirtyRef.current) setSelectedOptions([]);
        return;
      }

      try {
        const codes = await fetchEquipmentOptionCodes(mid);
        if (aborted) return;

        if (optionsDirtyRef.current) return;
        if (codes.length === 0) return;

        const all = await fetchAllTaskOptions();
        if (aborted) return;

        const pickSet = new Set(codes.map((c) => c.toLowerCase()));
        const picked = all.filter((o) => pickSet.has((o.name || "").toLowerCase()));

        setSelectedOptions(picked);
        optionsDirtyRef.current = false;
      } catch {}
    };
    load();
    return () => {
      aborted = true;
    };
  }, [machineId]);

  const pageTitle = machineId ? `${machineId} 장비 정보 수정` : "장비 정보 입력";

  const handleOptionConfirm = (rows: OptionRow[]) => {
    if (!canEdit) return;
    const map = new Map<number, OptionRow>();
    rows.forEach((r) => map.set(r.id, r));
    setSelectedOptions(Array.from(map.values()));
    optionsDirtyRef.current = true;
    setOptOpen(false);
  };

  const removeOne = (id: number) => {
    if (!canEdit) return;
    setSelectedOptions((prev) => prev.filter((r) => r.id !== id));
    optionsDirtyRef.current = true;
  };

  const handleSave = async () => {
    if (!canEdit) {
      alert("권한이 부족하여 수정/입력할 수 없습니다.");
      return;
    }

    try {
      if (!machineId.trim()) return alert("Machine ID를 입력해주세요.");
      if (!slot.trim()) return alert("슬롯 정보가 없습니다. 대시보드에서 다시 시도해주세요.");

      setSaving(true);

      const optionCodesStr = selectedOptions
        .map((o) => (o.name || "").trim())
        .filter(Boolean)
        .join(", ");

      const body = {
        machine_id: machineId.trim(),
        shipping_date: shippingDate ? shippingDate : null,
        receive_date: receiveDate ? receiveDate : null,
        manager: manager || "",
        customer: customer || "",
        slot_code: slot,
        site: site || null,
        serial_number: serialNumber || null,

        chiller_serial_number: chillerSerialNumber || null,

        status,
        note: note || null,
        option_ids: selectedOptions.map((o) => o.id),
        replace_options: true,
        option_codes_str: optionCodesStr,
      };

      const res = await fetch(`${API_BASE}/dashboard/equipment/save`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        let detail = `저장 실패: ${res.status}`;
        try {
          const data = await res.json();
          if (data?.detail) detail = String(data.detail);
        } catch {
          try {
            const txt = await res.text();
            if (txt) detail = txt;
          } catch {}
        }

        if (res.status === 409) {
          throw new Error(
            `중복된 장비 호기입니다.\n${detail}\n\n기존 위치를 확인하거나 다른 호기를 입력해주세요.`
          );
        }
        throw new Error(detail);
      }

      // ✅ 저장 후 로컬 intent도 갱신(다음 진입 시 최소한 같은 값 보장)
      try {
        const intent: InfoIntentLite = {
          machineId: machineId.trim(),
          values: {
            shipDate: shippingDate || null,
            receiveDate: receiveDate || null,
            manager: manager || "",
            customer: customer || "",
            status,
            serialNumber: serialNumber || null,
            chillerSerialNumber: chillerSerialNumber || null,
            note: note || null,
          },
        };
        localStorage.setItem("machine_info_intent", JSON.stringify(intent));
      } catch {}

      try {
        localStorage.setItem("dashboard_should_refresh", "1");
      } catch {}

      alert("저장에 성공했습니다.");
      navigate(-1);
      return;
    } catch (e: any) {
      alert(e?.message ?? "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto w-full max-w-5xl">
        {!canEdit && (
          <div className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-100">
            현재 계정은 <b>조회만 가능</b>합니다. (수정/입력/저장 불가)
          </div>
        )}

        <div className="mb-6 flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{site}</span>
            <span>›</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{line}</span>
            <span>›</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{slot}</span>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="rounded-full bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300"
          >
            ← 뒤로가기
          </button>
        </div>

        <Shell
          header={pageTitle}
          right={
            <button
              onClick={() => canEdit && setOptOpen(true)}
              disabled={!canEdit}
              className={`rounded-full px-4 py-2 text-sm font-semibold text-white shadow ${
                canEdit ? "bg-sky-600 hover:bg-sky-700" : "bg-gray-400 cursor-not-allowed"
              }`}
              title={!canEdit ? "권한이 부족하여 옵션 수정 불가" : "장비 옵션 선택"}
            >
              장비 옵션 선택
            </button>
          }
        >
          <div className="p-6">
            <div className="mb-6">
              <div className="mb-1 text-sm font-medium text-gray-700">선택된 옵션</div>
              {selectedOptions.length === 0 ? (
                <div className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
                  아직 선택된 옵션이 없습니다.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selectedOptions.map((opt) => (
                    <span
                      key={opt.id}
                      className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs text-sky-700 ring-1 ring-sky-200"
                    >
                      {opt.name}
                      <button
                        onClick={() => removeOne(opt.id)}
                        disabled={!canEdit}
                        className={`rounded-full px-2 text-[10px] ${
                          canEdit
                            ? "bg-sky-100 text-sky-700 hover:bg-sky-200"
                            : "bg-gray-200 text-gray-500 cursor-not-allowed"
                        }`}
                        aria-label={`${opt.name} 제거`}
                        title={!canEdit ? "권한 부족" : `${opt.name} 제거`}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Machine ID <span className="text-rose-500">*</span>
                  </label>
                  <input
                    value={machineId}
                    onChange={(e) => setMachineId(e.target.value)}
                    placeholder="예) j-07-02"
                    disabled={!canEdit}
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200 ${
                      canEdit ? "border-gray-200" : "border-gray-200 bg-gray-100 cursor-not-allowed"
                    }`}
                  />
                  <p className="mt-1 text-xs text-gray-400">중복된 호기는 저장 시 차단됩니다.</p>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">출하일</label>
                    <input
                      type="date"
                      value={shippingDate}
                      onChange={(e) => setShippingDate(e.target.value)}
                      disabled={!canEdit}
                      className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200 ${
                        canEdit ? "border-gray-200" : "border-gray-200 bg-gray-100 cursor-not-allowed"
                      }`}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">입고일</label>
                    <input
                      type="date"
                      value={receiveDate}
                      onChange={(e) => {
                        if (!canEdit) return;
                        receiveDirtyRef.current = true;
                        setReceiveDate(e.target.value);
                      }}
                      disabled={!canEdit}
                      className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200 ${
                        canEdit ? "border-gray-200" : "border-gray-200 bg-gray-100 cursor-not-allowed"
                      }`}
                    />
                    <p className="mt-1 text-xs text-gray-400">입고일을 수정하면 receipt_log도 함께 갱신됩니다.</p>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">담당자</label>
                  <input
                    value={manager}
                    onChange={(e) => setManager(e.target.value)}
                    placeholder="담당자"
                    disabled={!canEdit}
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200 ${
                      canEdit ? "border-gray-200" : "border-gray-200 bg-gray-100 cursor-not-allowed"
                    }`}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">고객사</label>
                  <input
                    value={customer}
                    onChange={(e) => setCustomer(e.target.value)}
                    placeholder="고객사"
                    disabled={!canEdit}
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200 ${
                      canEdit ? "border-gray-200" : "border-gray-200 bg-gray-100 cursor-not-allowed"
                    }`}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">시리얼 번호</label>
                  <input
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    placeholder="Serial Number"
                    disabled={!canEdit}
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200 ${
                      canEdit ? "border-gray-200" : "border-gray-200 bg-gray-100 cursor-not-allowed"
                    }`}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">칠러 시리얼 넘버</label>
                  <input
                    value={chillerSerialNumber}
                    onChange={(e) => setChillerSerialNumber(e.target.value)}
                    placeholder="Chiller Serial Number"
                    disabled={!canEdit}
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200 ${
                      canEdit ? "border-gray-200" : "border-gray-200 bg-gray-100 cursor-not-allowed"
                    }`}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">출하 가능 여부</label>
                  <div className={`flex items-center gap-2 rounded-xl p-2 ${canEdit ? "bg-gray-50" : "bg-gray-100"}`}>
                    <button
                      type="button"
                      onClick={() => canEdit && setStatus("가능")}
                      disabled={!canEdit}
                      className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                        status === "가능" ? "bg-emerald-600 text-white" : "text-gray-700 hover:bg-white"
                      } ${!canEdit ? "opacity-60 cursor-not-allowed hover:bg-transparent" : ""}`}
                    >
                      출하 가능
                    </button>
                    <button
                      type="button"
                      onClick={() => canEdit && setStatus("불가능")}
                      disabled={!canEdit}
                      className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                        status === "불가능" ? "bg-rose-600 text-white" : "text-gray-700 hover:bg-white"
                      } ${!canEdit ? "opacity-60 cursor-not-allowed hover:bg-transparent" : ""}`}
                    >
                      출하 불가능
                    </button>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">비고</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="특이사항 메모"
                    disabled={!canEdit}
                    className={`h-28 w-full resize-none rounded-lg border px-3 py-2 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200 ${
                      canEdit ? "border-gray-200" : "border-gray-200 bg-gray-100 cursor-not-allowed"
                    }`}
                  />
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button
                onClick={() => navigate(-1)}
                className="rounded-full bg-gray-200 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !canEdit}
                className={`rounded-full px-5 py-2 text-sm font-semibold text-white ${
                  saving || !canEdit ? "bg-gray-400 cursor-not-allowed" : "bg-orange-500 hover:bg-orange-600"
                }`}
                title={!canEdit ? "권한 부족" : "저장"}
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </Shell>
      </div>

      <OptionSelectModal
        open={optOpen}
        initialSelected={selectedOptions}
        onClose={() => setOptOpen(false)}
        onConfirm={handleOptionConfirm}
      />
    </div>
  );
};

export default EquipmentInfoPage;
