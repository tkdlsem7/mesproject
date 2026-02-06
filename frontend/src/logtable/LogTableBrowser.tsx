// src/pages/LogTableBrowser.tsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

/** CRA/Vite 공용: 환경변수 → 없으면 '/api' */
const API_BASE =
  process.env.NODE_ENV === "production" ? "/api" : "http://localhost:8000/api";

type TableMeta = { name: string; columns: string[]; date_fields: string[] };
type RowsRes = { columns: string[]; rows: Record<string, any>[]; total: number };

const LIMIT = 20;
const EXPORT_CHUNK_DEFAULT = 200;

// 콤보박스에 보여줄 한글 라벨
const TABLE_LABELS: Record<string, string> = {
  setup_sheet_all: "Raw Data",
  equipment_progress_log: "장비 진척도 로그 ",
  equip_progress: "라인 현황",
  equipment_receipt_log: "장비 입고 로그",
  troubleshoot_entry: "Trouble Shoot",
  board_posts: "게시판",
  checklist: "옵션별 체크리스트",
  equipment_checklist_result: "장비별 진척도 체크리스트 현황",
  equipment_move_log: "장비 이동 로그",
  equipment_option: "장비별 옵션",
  equipment_shipment_log: "장비 출하 로그",
  task_option: "장비 옵션 리스트",
  users: "회원정보",
  // 필요하면 계속 추가
};

// ---------- Rawdata용 유틸/상수 ----------

// Rawdata 엑셀 헤더 순서
const RAWDATA_HEADERS = [
  "모델",
  "차분",
  "호기",
  "S/N",
  "Chiller S/N",
  "세팅시작일",
  "세팅종료일",
  "리드타임\n(사내 입고 - 출하)",
  "Step",
  "세팅총소요시간(단위 : 시간)",
  "HW/SW",
  "불량",
  "불량유형",
  "세부 불량",
  "품질점수",
  "T.S 소요 시간\n(단위 : 분)",
  "적용",
  "비고",
  "담당자",
  "불량구분",
  "불량 위치",
];

// 리드타임 3개 컬럼 이름 상수
const SUMMARY_LT_RECEIPT_SHIP = "사내 입고 - 출하 리드타임(일)";
const SUMMARY_LT_RECEIPT_COMPLETE = "사내 입고 - 생산 완료 리드타임(일)";
const SUMMARY_LT_RECEIPT_START = "사내 입고 - 생산 시작 리드타임(일)";

// 차분보고서취합 헤더 순서
const SUMMARY_HEADERS = [
  "모델",
  "차분",
  "호기",
  "S/N",
  "Chiller S/N",
  "출하요청일",
  "리드타임\n(사내 입고 - 출하, 단위 : 일)",
  "세팅총소요시간(단위 : 시간)",
  "세팅총소요시간(단위 : 시간)\nPacking&Delivery 포함",
  "입고 품질 점수(단위 : 점)",
  "불량 건수",
  "T.S 소요 시간\n(단위 : 분)",
  "COMMON",
  "STAGE",
  "LOADER",
  "STAGE(Advanced)",
  "Cold Test",
  "HW",
  "Option&ETC",
  "개조 및\n변경점",
  "Packing&Delivery",
  "적용",
  "비고",
  "담당자",
];

// Step 매핑 키 (차분보고서취합용)
const SUMMARY_DEFECT_GROUP_KEYS = [
  // STAGE(Advanced)가 STAGE에 포함되지 않도록 순서 중요
  { header: "COMMON", keys: ["COMMON"] },
  { header: "STAGE(Advanced)", keys: ["STAGE(ADVANCED)", "STAGE(Advanced)"] },
  { header: "STAGE", keys: ["STAGE"] },
  { header: "LOADER", keys: ["LOADER"] },
  { header: "Cold Test", keys: ["COLDTEST", "COLD TEST"] },
  { header: "HW", keys: ["HW"] },
  { header: "Option&ETC", keys: ["OPTION&ETC", "OPTION", "ETC"] },
  { header: "개조 및\n변경점", keys: ["개조및변경점", "개조 및 변경점", "변경점", "개조", "MODIFY"] },
  { header: "Packing&Delivery", keys: ["PACKING&DELIVERY", "PACKING", "DELIVERY"] },
];

// 날짜 문자열 -> Date 변환(안되면 null)
const parseDate = (v: any): Date | null => {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const diffDays = (a: any, b: any) => {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return "";
  const ms = db.getTime() - da.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
};

// machine_no -> 모델/차분/호기 파싱 (요청하신 규칙)
const parseMachineNo = (machineNo: string) => {
  const parts = machineNo.split("-").map((x) => x.trim());
  const prefix = parts[0] ?? "";
  const diff = parts[1] ?? "";
  const ho = parts.slice(1).join("-");

  const MODEL_MAP: Record<string, string> = {
    F: "FD",
    C: "SC",
    "D(e)": "SD(e)",
    "E(e)": "SE(e)",
    "H(e)": "SH(e)",
    "T(e)": "SLT(e)",
    P: "SP",
    I: "ST(e)",
    J: "STP(e)",
  };

  const model = MODEL_MAP[prefix] ?? prefix;
  const chabun = model && diff ? `${model} ${diff}` : diff;

  return {
    모델: model,
    차분: chabun,
    호기: machineNo,
  };
};

// setup_sheet_all rows -> Rawdata CSV rows 생성
// - CSV 다운로드는 DB 컬럼을 그대로 쓰지만, Rawdata 출력은 프론트 매핑을 타기 때문에
//   컬럼명이 한글/영문으로 바뀌었거나 공백/특수문자가 포함된 경우 값이 비는 문제가 생길 수 있습니다.
// - pick()로 여러 후보 키를 순서대로 조회하여 호환성을 높입니다.
  const pickVal = (r: Record<string, any>, keys: string[]) => {
    for (const k of keys) {
      const v = (r as any)[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return "";
  };

  const toRawdataRows = (rows: Record<string, any>[]) => {
    return rows.map((r) => {
      const machineNo = String(r.machine_no ?? "");
      const base = parseMachineNo(machineNo);

      const start =
        r.setup_start_date ??
        r.setting_start_date ??
        r.setting_start ??
        r.start_date ??
        "";
      const end =
        r.setup_end_date ??
        r.setting_end_date ??
        r.setting_end ??
        r.end_date ??
        "";

      const lead = diffDays(start, end);

      // ts_hours(시간) -> 분으로 변환 (템플릿 단위: 분)
      const tsMinutes =
        r.ts_minutes ??
        r.ts_time ??
        (r.ts_hours != null && r.ts_hours !== ""
          ? Math.round(Number(r.ts_hours))
          : "");

      return {
        ...base,
        "S/N": r.sn ?? r.serial_number ?? r.serial_no ?? "",
        "Chiller S/N": r.chiller_sn ?? r.chiller_serial_number ?? "",
        세팅시작일: start,
        세팅종료일: end,
        "리드타임\n(사내 입고 - 출하)": lead,
        Step: r.step_name ?? r.step ?? "",
        "세팅총소요시간(단위 : 시간)":
          r.setup_hours ?? r.total_hours ?? r.setting_total_hours ?? "",
        "HW/SW": r.hw_sw ?? "",
        불량: r.defect ?? "",
        불량유형: r.defect_type ?? "",
        "세부 불량": r.defect_detail ?? "",
        품질점수: r.quality_score ?? "",
        "T.S 소요 시간\n(단위 : 분)": tsMinutes,
        적용: r.apply ?? r.apply_text ?? (r as any).applyText ?? "",
        비고: r.remark ?? r.note ?? "",
        담당자: r.owner ?? r.manager ?? "",
        불량구분: r.defect_group ?? r.defect_category ?? "",
        "불량 위치": r.defect_location ?? "",
      };
    });
  };

// 차분보고서취합: machine_no 기준 group 후 요약
  const buildSummaryRows = (rawRows: Record<string, any>[]) => {
    const grouped: Record<string, Record<string, any>[]> = {};
    for (const r of rawRows) {
      const machineNo = String(r["호기"] ?? "");
      if (!machineNo) continue;
      if (!grouped[machineNo]) grouped[machineNo] = [];
      grouped[machineNo].push(r);
    }

    // step 정규화
    const normStep = (v: any) =>
      String(v ?? "")
        .trim()
        .replace(/\s+/g, "")  // 공백 제거
        .toUpperCase();

    const initCounts = () => ({
      COMMON: 0,
      STAGE: 0,
      LOADER: 0,
      "STAGE(Advanced)": 0,
      "Cold Test": 0,
      "Option&ETC": 0,
      "개조 및\n변경점": 0,
      HW: 0,
      "Packing&Delivery": 0,
    });

    const result: Record<string, any>[] = [];

    Object.entries(grouped).forEach(([_, groupRows]) => {
      const base = groupRows[0] ?? {};
      const counts = initCounts();

      let totalHoursNoPack = 0;
      let totalHoursWithPack = 0;
      let totalTsMinutes = 0;
      let defectCount = 0;

      // ✅ 품질점수: 기본 100에서 행별 품질점수 누적 차감
      let inboundQuality = 100;
      let sawQuality = false;

      for (const r of groupRows) {
        const stepRaw = String(r["Step"] ?? "");
        const step = normStep(stepRaw);

        // ----- Step 카운트(요청하신 목록 기준, Step만 보고 셈) -----
        if (step === "COMMON") counts.COMMON += 1;
        else if (step === "STAGE") counts.STAGE += 1;
        else if (step === "LOADER") counts.LOADER += 1;
        else if (step === "STAGE(ADVANCED)" || step === "STAGEADVANCED")
          counts["STAGE(Advanced)"] += 1;
        else if (step === "COLDTEST" || step === "COLDTEST") counts["Cold Test"] += 1;
        else if (step === "OPTION&ETC" || step === "OPTIONETC") counts["Option&ETC"] += 1;
        else if (step === "개조") counts["개조 및\n변경점"] += 1;
        else if (step === "HW" || step === "H/W") counts.HW += 1;
        else if (
          step === "PACKING&DELIVERY" ||
          step === "PACKINGDELIVERY" ||
          step === "PACKING" ||
          step === "DELIVERY"
        )
          counts["Packing&Delivery"] += 1;

        // ----- 시간 합산(기존 유지) -----
        const hoursVal = parseFloat(String(r["세팅총소요시간(단위 : 시간)"] ?? ""));
        const hours = isNaN(hoursVal) ? 0 : hoursVal;

        totalHoursWithPack += hours;
        if (stepRaw !== "Packing&Delivery") totalHoursNoPack += hours;

        const tsVal = parseFloat(String(r["T.S 소요 시간\n(단위 : 분)"] ?? ""));
        const ts = isNaN(tsVal) ? 0 : tsVal;
        totalTsMinutes += ts;

        // ----- 불량 건수(기존 기준 유지) -----
        const defect = String(r["불량"] ?? "").trim();
        if (defect !== "") defectCount += 1;

        // ----- ✅ 품질점수(요구사항 반영) -----
        // 품질점수 값이 있으면 100에서 누적 차감
        const qRaw = r["품질점수"];
        if (qRaw !== null && qRaw !== undefined && String(qRaw).trim() !== "") {
          const q = parseFloat(String(qRaw));
          if (!isNaN(q)) {
            sawQuality = true;
            inboundQuality -= q;
          }
        }
      }

      // 기본 100, 범위는 0~100으로 제한
      if (!sawQuality) inboundQuality = 100;
      inboundQuality = Math.max(0, Math.min(100, inboundQuality));

      // 리드타임(기존 유지: 세팅시작~종료)
      const lead = diffDays(base["세팅시작일"], base["세팅종료일"]);
      const shipRequest = base["세팅종료일"] ?? "";

      const summaryRow: Record<string, any> = {
        모델: base["모델"],
        차분: base["차분"],
        호기: base["호기"],
        "S/N": base["S/N"],
        "Chiller S/N": base["Chiller S/N"],
        출하요청일: shipRequest,
        "리드타임\n(사내 입고 - 출하, 단위 : 일)": lead,

        "세팅총소요시간(단위 : 시간)":
          totalHoursNoPack !== 0 ? totalHoursNoPack.toFixed(1) : "",
        "세팅총소요시간(단위 : 시간)\nPacking&Delivery 포함":
          totalHoursWithPack !== 0 ? totalHoursWithPack.toFixed(1) : "",

        // ✅ 여기로 들어감(0~100)
        "입고 품질 점수(단위 : 점)": inboundQuality.toFixed(0),

        "불량 건수": defectCount,
        "T.S 소요 시간\n(단위 : 분)":
          totalTsMinutes !== 0 ? Math.round(totalTsMinutes).toString() : "",

        COMMON: counts.COMMON,
        STAGE: counts.STAGE,
        LOADER: counts.LOADER,
        "STAGE(Advanced)": counts["STAGE(Advanced)"],
        "Cold Test": counts["Cold Test"],
        HW: counts.HW,
        "Option&ETC": counts["Option&ETC"],
        "개조 및\n변경점": counts["개조 및\n변경점"],
        "Packing&Delivery": counts["Packing&Delivery"],

        적용: base["적용"],
        비고: base["비고"],
        담당자: base["담당자"],
      };

      result.push(summaryRow);
    });

    // 정렬(모델/차분/호기)
    result.sort((a, b) => {
      const aKey = `${a["모델"] || ""}_${a["차분"] || ""}_${a["호기"] || ""}`;
      const bKey = `${b["모델"] || ""}_${b["차분"] || ""}_${b["호기"] || ""}`;
      return aKey.localeCompare(bKey);
    });

    return result;
  };

/* -----------------------------------------------------------------------------
  정렬 유틸 (클라이언트 사이드)
  - 컬럼 헤더 클릭: 오름/내림차순 토글
  - 숫자/날짜/문자 자동 판별
----------------------------------------------------------------------------- */
type SortDir = "asc" | "desc";

const isEmptyVal = (v: any) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

const tryNumber = (v: any): number | null => {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "boolean") return v ? 1 : 0;

  if (typeof v === "string") {
    const s = v.trim().replace(/,/g, "");
    if (!s) return null;
    // 순수 숫자(정수/소수)만 숫자로 취급
    if (/^-?\d+(\.\d+)?$/.test(s)) {
      const n = Number(s);
      return Number.isNaN(n) ? null : n;
    }
  }
  return null;
};

const looksLikeDate = (s: string) =>
  // 2025-12-19, 2025/12/19, 2025-12-19 10:30:00, ISO 문자열 등
  /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s) || s.includes("T");

const tryTime = (v: any): number | null => {
  if (v instanceof Date) return v.getTime();

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    if (!looksLikeDate(s)) return null;
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : t;
  }
  return null;
};

const compareCell = (a: any, b: any): number => {
  // 빈 값은 항상 아래로
  const aEmpty = isEmptyVal(a);
  const bEmpty = isEmptyVal(b);
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const an = tryNumber(a);
  const bn = tryNumber(b);
  if (an !== null && bn !== null) return an === bn ? 0 : an < bn ? -1 : 1;

  const at = tryTime(a);
  const bt = tryTime(b);
  if (at !== null && bt !== null) return at === bt ? 0 : at < bt ? -1 : 1;

  // 나머지는 문자열로 비교 (숫자 포함 정렬에 유리)
  const as = String(a);
  const bs = String(b);
  return as.localeCompare(bs, "ko-KR", { numeric: true, sensitivity: "base" });
};

const sortRowsBy = (
  data: Record<string, any>[],
  sortBy: string | null,
  dir: SortDir
) => {
  if (!sortBy) return data;
  const mul = dir === "asc" ? 1 : -1;
  return [...data].sort(
    (ra, rb) => mul * compareCell(ra?.[sortBy], rb?.[sortBy])
  );
};

const LogTableBrowser: React.FC = () => {
  const navigate = useNavigate();

  const [tables, setTables] = useState<TableMeta[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [page, setPage] = useState(1);

  // 정렬(컬럼 헤더 클릭)
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // setup_sheet_all 관련 상태
  const isSetupSheetAll = selected === "setup_sheet_all";
  // ✅ Rawdata 출력 시 담당자 입력 모달 제거(헷갈림 방지)
  //    - 담당자는 equipment_receipt_log의 manager를 machine_no 기준으로 자동 매칭

  const selectedMeta = useMemo(
    () => tables.find((t) => t.name === selected),
    [tables, selected]
  );
  const hasDateFilter = (selectedMeta?.date_fields?.length ?? 0) > 0;
  const dateFieldHint = hasDateFilter ? selectedMeta!.date_fields[0] : null;

  // 정렬 적용된 rows (현재 페이지 기준)
  const viewRows = useMemo(
    () => sortRowsBy(rows, sortBy, sortDir),
    [rows, sortBy, sortDir]
  );

  const toggleSort = (col: string) => {
    setSortBy((prev) => {
      if (prev === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return col;
      }
      setSortDir("asc");
      return col;
    });
  };

  // 테이블 목록 로딩
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoadingMeta(true);
        setError(null);
        const { data } = await axios.get<TableMeta[]>(`${API_BASE}/logs/tables`, {
          timeout: 10000,
        });
        if (!alive) return;
        setTables(data);
        const first = data[0]?.name ?? "";
        setSelected((prev) => prev || first);
        setColumns(data[0]?.columns ?? []);
      } catch (e: any) {
        if (!alive) return;
        console.error(e);
        setError("테이블 목록을 불러오지 못했습니다.");
      } finally {
        if (alive) setLoadingMeta(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 테이블 변경 시 컬럼/기간 초기화
  useEffect(() => {
    const meta = tables.find((t) => t.name === selected);
    setColumns(meta?.columns ?? []);
    setPage(1);
    setSortBy(null);
    setSortDir("asc");
    if (!meta?.date_fields?.length) {
      setFrom("");
      setTo("");
    }
  }, [selected, tables]);

  const fetchRows = async () => {
    if (!selected) return;
    try {
      setLoadingRows(true);
      setError(null);

      const offset = (page - 1) * LIMIT;
      const params: any = { table: selected, limit: LIMIT, offset };
      if (search.trim()) params.q = search.trim();
      if (hasDateFilter) {
        if (from) params.date_from = from;
        if (to) params.date_to = to;
      }

      const { data } = await axios.get<RowsRes>(`${API_BASE}/logs/rows`, {
        params,
        timeout: 15000,
      });
      setColumns(data.columns);
      setRows(data.rows);
      setTotal(data.total);
    } catch (e: any) {
      console.error(e);
      setError("데이터를 불러오지 못했습니다.");
      setRows([]);
      setTotal(0);
    } finally {
      setLoadingRows(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selected) fetchRows();
  }, [selected]); // 처음/테이블 변경 시

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return "";
    const s = String(val);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  // 일반 CSV (그냥 DB 데이터 그대로)
  const exportAllToCsv = async () => {
    if (!selected) return;
    try {
      setExporting(true);
      const base: any = { table: selected };
      if (search.trim()) base.q = search.trim();
      if (hasDateFilter) {
        if (from) base.date_from = from;
        if (to) base.date_to = to; // ✅ 수정
      }

      const probe = await axios.get<RowsRes>(`${API_BASE}/logs/rows`, {
        params: { ...base, limit: 1, offset: 0 },
        timeout: 30000,
      });
      const allColumns = probe.data.columns;
      const totalCount = probe.data.total;

      let chunk = EXPORT_CHUNK_DEFAULT;
      let fetched = 0;
      let allRows: Record<string, any>[] = [];

      while (fetched < totalCount) {
        try {
          const { data } = await axios.get<RowsRes>(`${API_BASE}/logs/rows`, {
            params: { ...base, limit: chunk, offset: fetched },
            timeout: 30000,
          });
          allRows = allRows.concat(data.rows);
          fetched += data.rows.length;
          if (data.rows.length === 0) break;
        } catch (e: any) {
          if (e?.response?.status === 422 && chunk > 50) {
            chunk = Math.max(50, Math.floor(chunk / 2));
            continue;
          }
          throw e;
        }
      }

      const EOL = "\r\n";
      const header = allColumns.map(escapeCsv).join(",");
      const lines = allRows.map((r) =>
        allColumns.map((c) => escapeCsv(r[c])).join(",")
      );
      const csvBody = [header, ...lines].join(EOL);
      const BOM = "\uFEFF";
      const csv = BOM + csvBody;

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const today = new Date();
      const fileName = `${selected}_${today.getFullYear()}${String(
        today.getMonth() + 1
      ).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}.csv`;

      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("CSV 내보내기에 실패했습니다.");
    } finally {
      setExporting(false);
    }
  };

  // Rawdata / 차분보고서취합 CSV 내보내기
  const exportSetupSheetRaw = async () => {
    if (!selected) return;
    try {
      setExporting(true);

      // 1) setup_sheet_all 전체 로딩
      const base: any = { table: "setup_sheet_all" };
      if (search.trim()) base.q = search.trim();
      if (hasDateFilter) {
        if (from) base.date_from = from;
        if (to) base.date_to = to;
      }

      const probe = await axios.get<RowsRes>(`${API_BASE}/logs/rows`, {
        params: { ...base, limit: 1, offset: 0 },
        timeout: 30000,
      });
      const totalCount = probe.data.total;

      let chunk = EXPORT_CHUNK_DEFAULT;
      let fetched = 0;
      let allRows: Record<string, any>[] = [];

      while (fetched < totalCount) {
        try {
          const { data } = await axios.get<RowsRes>(`${API_BASE}/logs/rows`, {
            params: { ...base, limit: chunk, offset: fetched },
            timeout: 30000,
          });
          allRows = allRows.concat(data.rows);
          fetched += data.rows.length;
          if (data.rows.length === 0) break;
        } catch (e: any) {
          if (e?.response?.status === 422 && chunk > 50) {
            chunk = Math.max(50, Math.floor(chunk / 2));
            continue;
          }
          throw e;
        }
      }

      // 2) Rawdata row 변환
      //    - 적용/비고는 DB 값 그대로(없으면 빈칸)
      //    - 호기 전체에 '복사 적용'하지 않음
      let rawRows = toRawdataRows(allRows);

      // 2-1) ✅ 담당자 자동 매칭
      //      equipment_receipt_log.machine_no 와 setup_sheet_all.machine_no(호기)를 비교해서
      //      최신 manager를 찾아 Rawdata/요약에 넣습니다.
      try {
        const machineNos = Array.from(
          new Set(
            rawRows
              .map((r) => String((r as any)["호기"] ?? "").trim())
              .filter((s) => !!s)
          )
        );

        if (machineNos.length) {
          const probe2 = await axios.get<RowsRes>(`${API_BASE}/logs/rows`, {
            params: { table: "equipment_receipt_log", limit: 1, offset: 0 },
            timeout: 30000,
          });

          const total2 = probe2.data.total;
          const cols2 = probe2.data.columns ?? [];
          const hasManager = cols2.includes("manager");
          const hasReceiveDate = cols2.includes("receive_date");
          const hasId = cols2.includes("id");

          if (hasManager && total2 > 0) {
            let chunk2 = 500;
            let fetched2 = 0;
            const receiptRows: Record<string, any>[] = [];

            while (fetched2 < total2) {
              try {
                const { data } = await axios.get<RowsRes>(`${API_BASE}/logs/rows`, {
                  params: {
                    table: "equipment_receipt_log",
                    limit: chunk2,
                    offset: fetched2,
                  },
                  timeout: 30000,
                });
                receiptRows.push(...data.rows);
                fetched2 += data.rows.length;
                if (data.rows.length === 0) break;
              } catch (e: any) {
                if (e?.response?.status === 422 && chunk2 > 50) {
                  chunk2 = Math.max(50, Math.floor(chunk2 / 2));
                  continue;
                }
                throw e;
              }
            }

            // machine_no(lower) -> { manager, ts }
            const managerMap: Record<string, { manager: string; ts: number; id: number }> = {};

            const wantSet = new Set(machineNos.map((m) => m.toLowerCase()));
            for (const rr of receiptRows) {
              const mn = String(rr.machine_no ?? "").trim();
              if (!mn) continue;
              const key = mn.toLowerCase();
              if (!wantSet.has(key)) continue;

              const mgr = String(rr.manager ?? "").trim();
              if (!mgr) continue;

              let ts = 0;
              if (hasReceiveDate) {
                const d = parseDate(rr.receive_date);
                ts = d ? d.getTime() : 0;
              }

              const id = hasId ? Number(rr.id ?? 0) : 0;
              const prev = managerMap[key];
              if (!prev) {
                managerMap[key] = { manager: mgr, ts, id };
              } else {
                // 최신 우선: receive_date -> id
                if (ts > prev.ts || (ts === prev.ts && id > prev.id)) {
                  managerMap[key] = { manager: mgr, ts, id };
                }
              }
            }

            rawRows = rawRows.map((r) => {
              const key = String((r as any)["호기"] ?? "")
                .trim()
                .toLowerCase();
              const mapped = managerMap[key]?.manager ?? "";
              return {
                ...r,
                // ✅ manager가 있으면 그걸 사용, 없으면 기존(혹시 있다면) 그대로
                담당자: mapped || String((r as any)["담당자"] ?? ""),
              };
            });
          }
        }
      } catch (e) {
        // 담당자 매칭 실패해도 export는 진행
        console.warn("manager auto-map failed", e);
      }

      const summaryRows = buildSummaryRows(rawRows);

      const EOL = "\r\n";
      const BOM = "\uFEFF";

      // 1) Rawdata CSV
      const rawHeader = RAWDATA_HEADERS.map(escapeCsv).join(",");
      const rawLines = rawRows.map((r) =>
        RAWDATA_HEADERS.map((h) => escapeCsv((r as any)[h])).join(",")
      );
      const rawCsvBody = [rawHeader, ...rawLines].join(EOL);
      const rawCsv = BOM + rawCsvBody;

      const rawBlob = new Blob([rawCsv], {
        type: "text/csv;charset=utf-8;",
      });
      const today = new Date();
      const rawFileName = `setup_sheet_all_rowdata_${today
        .toISOString()
        .slice(0, 10)}.csv`;
      const rawUrl = URL.createObjectURL(rawBlob);
      const a1 = document.createElement("a");
      a1.href = rawUrl;
      a1.download = rawFileName;
      document.body.appendChild(a1);
      a1.click();
      document.body.removeChild(a1);
      URL.revokeObjectURL(rawUrl);

      // 2) 차분보고서취합 CSV
      const summaryHeader = SUMMARY_HEADERS.map(escapeCsv).join(",");
      const summaryLines = summaryRows.map((r) =>
        SUMMARY_HEADERS.map((h) => escapeCsv((r as any)[h])).join(",")
      );
      const summaryCsvBody = [summaryHeader, ...summaryLines].join(EOL);
      const summaryCsv = BOM + summaryCsvBody;

      const summaryBlob = new Blob([summaryCsv], {
        type: "text/csv;charset=utf-8;",
      });
      const summaryFileName = `setup_sheet_all_summary_${today
        .toISOString()
        .slice(0, 10)}.csv`;
      const summaryUrl = URL.createObjectURL(summaryBlob);
      const a2 = document.createElement("a");
      a2.href = summaryUrl;
      a2.download = summaryFileName;
      document.body.appendChild(a2);
      a2.click();
      document.body.removeChild(a2);
      URL.revokeObjectURL(summaryUrl);
    } catch (e) {
      console.error(e);
      alert("Rawdata / 차분보고서취합 CSV 내보내기에 실패했습니다.");
    } finally {
      setExporting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setPage(1);
      void fetchRows();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50" onKeyDown={handleKeyDown}>
      {/* 상단 헤더 */}
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              className="shrink-0 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => navigate(-1)}
              disabled={loadingMeta || loadingRows}
            >
              ← 뒤로가기
            </button>
            <h1 className="text-lg font-semibold text-slate-900">
              Log Data Browser
            </h1>
          </div>
          {selected && (
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs text-slate-700">
              {TABLE_LABELS[selected] ?? selected}
            </span>
          )}
        </div>
      </div>

      {/* 본문 */}
      <div className="mx-auto max-w-7xl px-6 py-6">
        {/* 툴바 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            {/* 테이블 선택 */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">테이블</label>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="h-10 min-w-[220px] rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-200"
                disabled={loadingMeta}
              >
                {tables.map((t) => (
                  <option key={t.name} value={t.name}>
                    {TABLE_LABELS[t.name] ?? t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 검색 */}
            <div className="relative flex-1 min-w-[240px]">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="검색(머신ID, 담당자, 비고 등)…"
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 pl-9 text-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-200"
                disabled={loadingMeta}
              />
              <svg
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z"
                />
              </svg>
            </div>

            {/* 기간 필터 */}
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-slate-600">기간</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-200"
                disabled={!hasDateFilter || loadingMeta}
              />
              <span className="text-slate-400">~</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-200"
                disabled={!hasDateFilter || loadingMeta}
              />
            </div>

            {/* 버튼들 */}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {isSetupSheetAll && (
                <button
                  className="h-10 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                  disabled={loadingMeta || loadingRows || exporting}
                  onClick={() => void exportSetupSheetRaw()}
                >
                  Rawdata 출력
                </button>
              )}

              <button
                className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50 disabled:opacity-50"
                onClick={exportAllToCsv}
                disabled={loadingMeta || loadingRows || exporting || !selected}
                title="현재 선택/검색/기간 필터를 반영해 전체 데이터를 CSV로 저장합니다."
              >
                {exporting ? "내보내는 중…" : "CSV 다운로드"}
              </button>
              <button
                className="h-10 rounded-xl bg-slate-200 px-3 text-sm font-semibold text-slate-800 hover:bg-slate-300 disabled:opacity-50"
                onClick={() => {
                  setSearch("");
                  setFrom("");
                  setTo("");
                  setPage(1);
                }}
                disabled={loadingMeta || loadingRows}
              >
                초기화
              </button>
              <button
                className="h-10 rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                onClick={() => {
                  setPage(1);
                  fetchRows();
                }}
                disabled={loadingMeta || loadingRows}
              >
                조회
              </button>
            </div>
          </div>

          {/* 날짜 컬럼 힌트 */}
          <div className="mt-2 text-xs text-slate-400">
            {hasDateFilter
              ? `기준 컬럼: ${dateFieldHint}`
              : "이 테이블은 기간 필터가 없습니다."}
          </div>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="mt-3 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* 표 */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-100">
                <tr>
                  {columns.map((c) => {
                    const active = sortBy === c;
                    return (
                      <th
                        key={c}
                        className="border-b px-4 py-3 text-left font-semibold text-slate-700"
                      >
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 text-left hover:text-slate-900"
                          onClick={() => toggleSort(c)}
                          title="클릭하여 정렬(오름/내림 토글)"
                        >
                          <span className="truncate">{c}</span>
                          <span className="text-[11px] text-slate-400">
                            {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {loadingMeta || loadingRows ? (
                  <tr>
                    <td
                      className="px-4 py-6 text-center text-slate-400"
                      colSpan={columns.length || 1}
                    >
                      불러오는 중…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-6 text-center text-slate-400"
                      colSpan={columns.length || 1}
                    >
                      데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  viewRows.map((r, i) => (
                    <tr key={i} className="border-b hover:bg-slate-50">
                      {columns.map((c) => (
                        <td key={c} className="px-4 py-3 text-slate-800">
                          {r?.[c] === null || r?.[c] === undefined
                            ? ""
                            : String(r[c])}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 하단 페이징 */}
          <div className="flex items-center justify-between border-t bg-white px-4 py-3">
            <div className="text-sm text-slate-600">
              총 <span className="font-semibold">{total}</span> 건
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded border bg-white px-2 py-1 text-sm text-slate-600 disabled:opacity-40"
                onClick={() => {
                  if (page > 1) {
                    setPage(page - 1);
                    fetchRows();
                  }
                }}
                disabled={page <= 1 || loadingMeta || loadingRows}
              >
                ‹
              </button>
              <span className="text-sm text-slate-700">
                {Math.min(page, Math.max(1, totalPages))} / {totalPages}
              </span>
              <button
                className="rounded border bg-white px-2 py-1 text-sm text-slate-600 disabled:opacity-40"
                onClick={() => {
                  const max = totalPages;
                  if (page < max) {
                    setPage(page + 1);
                    fetchRows();
                  }
                }}
                disabled={page >= totalPages || loadingMeta || loadingRows}
              >
                ›
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default LogTableBrowser;
