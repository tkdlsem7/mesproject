// src/pages/EquipmentInfoPage.tsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/* -----------------------------------------------------------------------------
  공통 유틸
----------------------------------------------------------------------------- */
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

// 전체 옵션 목록 조회(이름 매칭용)
async function fetchAllTaskOptions(): Promise<OptionRow[]> {
  const res = await fetch(`${API_BASE}/task-options?q=&limit=1000`, {
    credentials: "include",
    headers: { ...authHeaders() },
  });
  if (!res.ok) return [];
  const list = (await res.json()) as OptionRow[];
  return Array.isArray(list) ? list : [];
}

// (선택) 이미 저장된 입고일을 불러올 수 있도록 “있으면” 조회
// - 백엔드에 해당 엔드포인트가 없으면 조용히 무시됩니다.
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
    } catch {
      // ignore
    }
  }
  return null;
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

/* -----------------------------------------------------------------------------
  타입
----------------------------------------------------------------------------- */
type OptionRow = { id: number; name: string };

type InfoIntentLite = {
  machineId?: string;
  values?: {
    shipDate?: string | null;
    receiveDate?: string | null; // ✅ 추가
    manager?: string | null;
    customer?: string | null;
    status?: "가능" | "불가능" | string | null;
    serialNumber?: string | null;
    note?: string | null;
  };
};

/* -----------------------------------------------------------------------------
  공용 카드 래퍼 (Shell)
----------------------------------------------------------------------------- */
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

/* -----------------------------------------------------------------------------
  옵션 선택 모달
----------------------------------------------------------------------------- */
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
          <button onClick={onClose} className="rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200">
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
                      {checked && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">선택됨</span>}
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
            <button onClick={onClose} className="rounded-full bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300">
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

/* -----------------------------------------------------------------------------
  메인 페이지
----------------------------------------------------------------------------- */
const EquipmentInfoPage: React.FC = () => {
  const query = useQuery();
  const navigate = useNavigate();

  // 진입정보
  const site = query.get("site") ?? safeGet("selected_site") ?? "본사";
  const line = query.get("line") ?? safeGet("selected_line") ?? "A동";
  const slot = query.get("slot") ?? safeGet("selected_slot") ?? "-";

  const emptyFlag = safeGet("selected_machine_is_empty"); // "1" | "0" | null
  const machineFromQuery = query.get("machine");
  const machineFromStorage = emptyFlag === "1" ? "" : safeGet("selected_machine_id") ?? "";
  const machineInit = emptyFlag === "1" ? "" : ((machineFromQuery ?? machineFromStorage) || "").trim();

  // 폼 상태
  const [machineId, setMachineId] = useState<string>(machineInit);
  const [shippingDate, setShippingDate] = useState<string>("");
  const [receiveDate, setReceiveDate] = useState<string>(""); // ✅ 추가
  const [manager, setManager] = useState<string>("");
  const [customer, setCustomer] = useState<string>("");
  const [status, setStatus] = useState<"가능" | "불가능">("불가능");
  const [serialNumber, setSerialNumber] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const [saving, setSaving] = useState(false);

  const [selectedOptions, setSelectedOptions] = useState<OptionRow[]>([]);
  const [optOpen, setOptOpen] = useState(false);

  // ✅ 사용자가 옵션/입고일을 수동으로 만졌는지 추적 (자동 덮어쓰기 방지)
  const optionsDirtyRef = useRef(false);
  const receiveDirtyRef = useRef(false);

  // 최초 안내 1회
  const announcedRef = useRef(false);
  useEffect(() => {
    if (announcedRef.current) return;
    announcedRef.current = true;
    alert(`${site} > ${line} > ${slot} / ${machineId || "-"} 호기를 선택하셨습니다.`);
  }, [site, line, slot, machineId]);

  // 빈 슬롯이면 초기화
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

  // 프리필: 빈 슬롯 아니면 intent 반영
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
      if ("note" in v && typeof v.note === "string") setNote(v.note ?? "");
      if ("status" in v && (v.status === "가능" || v.status === "불가능")) setStatus(v.status);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ (선택) 기존 입고일 자동 조회: receiveDate가 비어있고, 사용자가 아직 안 건드렸을 때만 채움
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

  // 장비의 기존 옵션 불러오기 → 선택 반영 (자동 동기화)
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
      } catch {
        // ignore
      }
    };
    load();
    return () => {
      aborted = true;
    };
  }, [machineId]);

  const pageTitle = machineId ? `${machineId} 장비 정보 수정` : "장비 정보 입력";

  // 옵션 모달 콜백
  const handleOptionConfirm = (rows: OptionRow[]) => {
    const map = new Map<number, OptionRow>();
    rows.forEach((r) => map.set(r.id, r));
    setSelectedOptions(Array.from(map.values()));
    optionsDirtyRef.current = true;
    setOptOpen(false);
  };
  const removeOne = (id: number) => {
    setSelectedOptions((prev) => prev.filter((r) => r.id !== id));
    optionsDirtyRef.current = true;
  };

  // 저장
  const handleSave = async () => {
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
        // ✅ 409(중복) 메시지까지 예쁘게 처리
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
          throw new Error(`중복된 장비 호기입니다.\n${detail}\n\n기존 위치를 확인하거나 다른 호기를 입력해주세요.`);
        }
        throw new Error(detail);
      }

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
              onClick={() => setOptOpen(true)}
              className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-sky-700"
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
                        className="rounded-full bg-sky-100 px-2 text-[10px] text-sky-700 hover:bg-sky-200"
                        aria-label={`${opt.name} 제거`}
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
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
                  />
                  <p className="mt-1 text-xs text-gray-400">중복된 호기는 저장 시 차단됩니다.</p>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      출하일
                    </label>
                    <input
                      type="date"
                      value={shippingDate}
                      onChange={(e) => setShippingDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      입고일
                    </label>
                    <input
                      type="date"
                      value={receiveDate}
                      onChange={(e) => {
                        receiveDirtyRef.current = true;
                        setReceiveDate(e.target.value);
                      }}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
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
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">고객사</label>
                  <input
                    value={customer}
                    onChange={(e) => setCustomer(e.target.value)}
                    placeholder="고객사"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
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
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">출하 가능 여부</label>
                  <div className="flex items-center gap-2 rounded-xl bg-gray-50 p-2">
                    <button
                      type="button"
                      onClick={() => setStatus("가능")}
                      className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                        status === "가능" ? "bg-emerald-600 text-white" : "text-gray-700 hover:bg-white"
                      }`}
                    >
                      출하 가능
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatus("불가능")}
                      className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                        status === "불가능" ? "bg-rose-600 text-white" : "text-gray-700 hover:bg-white"
                      }`}
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
                    className="h-28 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
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
                disabled={saving}
                className={`rounded-full px-5 py-2 text-sm font-semibold text-white ${
                  saving ? "bg-gray-400" : "bg-orange-500 hover:bg-orange-600"
                }`}
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
