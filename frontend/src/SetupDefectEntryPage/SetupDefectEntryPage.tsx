// src/SetupDefectEntryPage/SetupDefectEntryPage.tsx
import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

/** 스텝 옵션 */
const STEPS = [
  "Common",
  "Stage",
  "Loader",
  "STAGE(Advanced)",
  "Cold Test",
  "Option&ETC",
  "개조",
  "HW",
  "Packing&Delivery",
] as const;
type StepType = (typeof STEPS)[number];

/** HW/SW 타입 (없음 포함) */
type HwSw = "" | "H/W" | "S/W";
const HW_SW_OPTIONS: Exclude<HwSw, "">[] = ["H/W", "S/W"];

const LOCATION_OPTIONS = ["PC & Monitor", "Loader", "Stage", "Chiller"] as const;

const DEFECT_TYPES_BY_DEFECT: Record<string, string[]> = {
  Bolt_Nut_Tab: ["체결불량", "파손", "오사용", "누락"],
  Cover: ["도장불량", "스크래치", "파손", "누락", "미조립불량"],
  Cable: ["단선", "반삽입", "탈삽입", "파손", "전장불량"],
  CableTie: ["커팅불량", "누락", "오사용"],
  "SpeedValve&Peeting": ["고정불량", "파트불량", "조립불량"],
  "I-Marking": ["누락", "작업불량"],
  "Air&Vac line": ["전장불량", "파손", "누락", "오배선", "꺾임"],
  Mount: ["파손", "체결불량", "오사용", "누락", "작업불량"],
  "Label&Sticker": ["누락", "오사용"],
  Setting: ["설정미스", "셋팅미스"],
  Sensor: ["파손", "위치 불량"],
  Module: ["조립불량", "파트불량", "파손"],
  Chuck: ["파트불량", "파손"],
  Board: ["파트불량", "파손"],
  Camera: ["조명불량", "파트불량", "파손"],
  Chain: ["파트불량", "전장불량"],
  Driver: ["전원불량", "파트불량", "파손"],
  Terminal: ["누락", "조립불량"],
  "Axis Base": ["파트불량", "파손", "조립불량"],
  CC: ["파트불량", "파손", "누락"],
  "B/K & Dog": ["조립불량", "누락"],
  "Top Plate": ["도장불량", "기타"],
  Chiller: ["기타"],
  SMPS: ["전원불량", "파트불량", "파손"],
  ETC: ["기타"],
  Fan: ["파트불량"],
  CardHolder: ["스크래치", "오사용"],
  "Auto Tilt": ["조립불량", "파손"],
  "Belt Tensic": ["장력불량"],
  "Parameter axis base": ["도장불량"],
  FOUP: ["기타"],
};

const DEFECT_OPTIONS = Object.keys(DEFECT_TYPES_BY_DEFECT);
const DEFECT_GROUP_OPTIONS = ["단순 하드웨어", "기능"] as const;

/** API 기본 경로 */
const API_BASE =
  process.env.NODE_ENV === "production" ? "/api" : "http://localhost:8000/api";

/** ---------- 타입 ---------- */
type MetaState = {
  machineNo: string;
  sn: string;
  chillerSn: string;
  setupStart: string;
  setupEnd: string;
};

type StepRow = {
  setupHours: string;
  defectDetail: string;
  qualityScore: string;
  tsMinutes: string;

  hwSw: HwSw;
  defectGroup: string;
  defectLocation: string;
  defect: string;
  defectType: string;
};

type RowRead = {
  id: number;
  sheet_id: number;
  step_name: StepType;
  machine_no: string | null;
  sn: string | null;
  chiller_sn: string | null;
  setup_start_date: string | null;
  setup_end_date: string | null;
  setup_hours: number | null;
  defect_detail: string | null;
  quality_score: number | null;
  ts_hours: number | null;

  hw_sw: string | null;
  defect: string | null;
  defect_type: string | null;
  defect_group: string | null;
  defect_location: string | null;

  created_at: string;
};

type UIRow = {
  id: number;
  sheetId: number; // 내부용(수정 요청 시 필요)
  stepName: StepType;
  setupHours: string;
  defectDetail: string;
  qualityScore: string;
  tsMinutes: string;

  hwSw: string;
  defectGroup: string;
  defectLocation: string;
  defect: string;
  defectType: string;

  createdAt: string; // 내부용(표시 X)
};

type CommonRowRead = {
  machine_no: string | null;
  sn: string | null;
  chiller_sn: string | null;
  setup_start_date: string | null;
  setup_end_date: string | null;
};

type CommonUIRow = {
  machineNo: string;
  sn: string;
  chillerSn: string;
  setupStart: string;
  setupEnd: string;
};

type ViewMode = "STEP" | "COMMON";

/** ---------- 유틸 ---------- */
function scoreFromMinutes(mins: number | null): number | null {
  if (mins === null || isNaN(mins) || mins < 0) return null;
  if (mins < 10) return 1;
  if (mins < 30) return 2;
  if (mins < 60) return 5;
  if (mins < 120) return 10;
  if (mins < 240) return 20;
  if (mins < 600) return 40;
  return 60;
}

/** ---------- 스타일 토큰 ---------- */
const pageWrap = "min-h-screen bg-slate-50";
const card = "rounded-2xl bg-white border border-slate-200 shadow-sm";
const sectionTitle =
  "px-6 py-4 border-b border-slate-200 text-[15px] text-slate-700";
const cell = "border-b border-slate-200";

const rowTopCell = "border-slate-200";
const rowBottomCell = "border-b border-slate-200";

/** ---------- 컴포넌트 ---------- */
export default function SetupDefectEntryPage() {
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState<StepType>("Loader");
  const [sheetId, setSheetId] = useState<number | null>(null);

  // ✅ 조회 모드 토글
  const [viewMode, setViewMode] = useState<ViewMode>("STEP");

  // 공통 정보(상단 입력폼)
  const [meta, setMeta] = useState<MetaState>({
    machineNo: "",
    sn: "",
    chillerSn: "",
    setupStart: "",
    setupEnd: "",
  });

  const emptyRow: StepRow = {
    setupHours: "",
    defectDetail: "",
    qualityScore: "",
    tsMinutes: "",
    hwSw: "",
    defectGroup: "",
    defectLocation: "",
    defect: "",
    defectType: "",
  };
  const [rows, setRows] = useState<StepRow[]>([emptyRow]);

  // ✅ 조회 조건: sheet_id 제거(요청사항)
  const [qMachineNo, setQMachineNo] = useState<string>("");
  const [qStep, setQStep] = useState<"" | StepType>("");

  const [loading, setLoading] = useState(false);

  // STEP 조회 결과
  const [result, setResult] = useState<UIRow[]>([]);

  // COMMON 조회 결과
  const [commonResult, setCommonResult] = useState<CommonUIRow[]>([]);

  // STEP 인라인 수정 상태
  const [editId, setEditId] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<UIRow | null>(null);

  // ✅ COMMON 인라인 수정 상태 (oldMachineNo를 기억)
  const [editCommonOldMachineNo, setEditCommonOldMachineNo] = useState<string | null>(null);
  const [editCommonRow, setEditCommonRow] = useState<CommonUIRow | null>(null);

  /** 액션들 */
  const changeStep = (s: StepType) => {
    setCurrentStep(s);
    setRows([emptyRow]);
  };

  const onMeta = (k: keyof MetaState, v: string) =>
    setMeta((p) => ({ ...p, [k]: v }));

  const updateRow = (idx: number, key: keyof StepRow, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[idx], [key]: value as any };

      if (key === "tsMinutes") {
        const score = scoreFromMinutes(
          value.trim() === "" ? null : parseFloat(value)
        );
        row.qualityScore = score == null ? "" : String(score);
      }

      if (key === "defect") {
        const types = DEFECT_TYPES_BY_DEFECT[value] ?? [];
        row.defectType = types[0] ?? "";
      }

      next[idx] = row;
      return next;
    });
  };

  const addRow = () => setRows((p) => [...p, { ...emptyRow }]);
  const removeRow = (idx: number) =>
    setRows((p) => (p.length === 1 ? p : p.filter((_, i) => i !== idx)));

  const handleBack = () => navigate(-1);

  /** 저장 (여러 행) */
  const handleSave = async () => {
    const valid = rows.filter(
      (r) =>
        r.setupHours ||
        r.defectDetail ||
        r.tsMinutes ||
        r.qualityScore ||
        r.defect ||
        r.defectType
    );
    if (valid.length === 0) {
      alert("저장할 행이 없습니다.");
      return;
    }
    try {
      let sid = sheetId;
      setLoading(true);
      for (let i = 0; i < valid.length; i++) {
        const r = valid[i];
        const payload = {
          sheetId: sid ?? null,
          meta: {
            machine_no: meta.machineNo || null,
            sn: meta.sn || null,
            chiller_sn: meta.chillerSn || null,
            setup_start_date: meta.setupStart || null,
            setup_end_date: meta.setupEnd || null,
          },
          step: {
            step_name: currentStep,
            setup_hours: r.setupHours === "" ? null : parseFloat(r.setupHours),
            defect_detail: r.defectDetail === "" ? null : r.defectDetail,
            quality_score:
              r.qualityScore === "" ? null : parseInt(r.qualityScore, 10),
            ts_hours: r.tsMinutes === "" ? null : parseFloat(r.tsMinutes),

            hw_sw: r.hwSw || null,
            defect_group: r.defectGroup || null,
            defect_location: r.defectLocation || null,
            defect: r.defect || null,
            defect_type: r.defectType || null,
          },
        };
        const res = await axios.post(`${API_BASE}/setup-sheets/save`, payload);
        sid = res.data.sheetId;
        if (i === 0) setSheetId(sid);
      }
      alert(`총 ${valid.length}건 저장되었습니다. (sheetId=${sid})`);
    } catch (e) {
      console.error(e);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  /** ✅ 조회(모드에 따라 API가 다름) */
  const handleSearch = async () => {
    try {
      setLoading(true);

      if (viewMode === "STEP") {
        const params: Record<string, string> = {};
        if (qMachineNo.trim()) params.machine_no = qMachineNo.trim();
        if (qStep) params.step_name = qStep;

        const res = await axios.get<RowRead[]>(`${API_BASE}/setup-sheets/search`, { params });

        const rows = (res.data ?? []).map<UIRow>((r) => ({
          id: r.id,
          sheetId: r.sheet_id,
          stepName: r.step_name,
          setupHours: r.setup_hours == null ? "" : String(r.setup_hours),
          defectDetail: r.defect_detail ?? "",
          qualityScore: r.quality_score == null ? "" : String(r.quality_score),
          tsMinutes: r.ts_hours == null ? "" : String(r.ts_hours),

          hwSw: r.hw_sw ?? "",
          defectGroup: r.defect_group ?? "",
          defectLocation: r.defect_location ?? "",
          defect: r.defect ?? "",
          defectType: r.defect_type ?? "",

          createdAt: r.created_at,
        }));
        setResult(rows);

        // 공통정보 프리필(첫 행 기준)
        if (res.data.length > 0) {
          const h = res.data[0];
          setMeta({
            machineNo: h.machine_no ?? "",
            sn: h.sn ?? "",
            chillerSn: h.chiller_sn ?? "",
            setupStart: h.setup_start_date ?? "",
            setupEnd: h.setup_end_date ?? "",
          });
          setSheetId(h.sheet_id);
        }
      } else {
        // COMMON 모드
        const params: Record<string, string> = {};
        if (qMachineNo.trim()) params.machine_no = qMachineNo.trim();

        const res = await axios.get<CommonRowRead[]>(`${API_BASE}/setup-sheets/search-common`, { params });

        const rows = (res.data ?? [])
          .filter((r) => (r.machine_no ?? "").trim() !== "")
          .map<CommonUIRow>((r) => ({
            machineNo: r.machine_no ?? "",
            sn: r.sn ?? "",
            chillerSn: r.chiller_sn ?? "",
            setupStart: r.setup_start_date ?? "",
            setupEnd: r.setup_end_date ?? "",
          }));

        setCommonResult(rows);
      }
    } catch (e) {
      console.error(e);
      alert("조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  /** STEP 인라인 수정/삭제 */
  const startEdit = (row: UIRow) => {
    setEditId(row.id);
    setEditRow({ ...row });
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditRow(null);
  };

  const saveEdit = async () => {
    if (editId == null || !editRow) return;
    try {
      setLoading(true);
      const payload = {
        sheetId: editRow.sheetId,
        meta: {
          machine_no: meta.machineNo || null,
          sn: meta.sn || null,
          chiller_sn: meta.chillerSn || null,
          setup_start_date: meta.setupStart || null,
          setup_end_date: meta.setupEnd || null,
        },
        step: {
          id: editRow.id,
          step_name: editRow.stepName,
          setup_hours: editRow.setupHours === "" ? null : parseFloat(editRow.setupHours),
          defect_detail: editRow.defectDetail === "" ? null : editRow.defectDetail,
          quality_score: editRow.qualityScore === "" ? null : parseInt(editRow.qualityScore, 10),
          ts_hours: editRow.tsMinutes === "" ? null : parseFloat(editRow.tsMinutes),

          hw_sw: editRow.hwSw || null,
          defect_group: editRow.defectGroup || null,
          defect_location: editRow.defectLocation || null,
          defect: editRow.defect || null,
          defect_type: editRow.defectType || null,
        },
      };
      await axios.post(`${API_BASE}/setup-sheets/save`, payload);
      setResult((prev) => prev.map((r) => (r.id === editRow.id ? { ...editRow } : r)));
      cancelEdit();
      alert("수정되었습니다.");
    } catch (e) {
      console.error(e);
      alert("수정 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (row: UIRow) => {
    if (!window.confirm(`행 #${row.id} 을(를) 삭제할까요?`)) return;
    try {
      setLoading(true);
      await axios.delete(`${API_BASE}/setup-sheets/${row.id}`);
      setResult((prev) => prev.filter((r) => r.id !== row.id));
      alert("삭제되었습니다.");
    } catch (e) {
      console.error(e);
      alert("삭제 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  /** ✅ COMMON 인라인 수정 */
  const startEditCommon = (row: CommonUIRow) => {
    // “수정 버튼 누른 시점의 호기”를 기억(요구사항)
    setEditCommonOldMachineNo(row.machineNo);
    setEditCommonRow({ ...row });
  };

  const cancelEditCommon = () => {
    setEditCommonOldMachineNo(null);
    setEditCommonRow(null);
  };

  const saveEditCommon = async () => {
    if (!editCommonOldMachineNo || !editCommonRow) return;

    try {
      setLoading(true);

      const payload = {
        old_machine_no: editCommonOldMachineNo,
        meta: {
          machine_no: editCommonRow.machineNo || null, // ✅ 새 호기(변경 가능)
          sn: editCommonRow.sn || null,
          chiller_sn: editCommonRow.chillerSn || null,
          setup_start_date: editCommonRow.setupStart || null,
          setup_end_date: editCommonRow.setupEnd || null,
        },
      };

      const res = await axios.post(`${API_BASE}/setup-sheets/update-common`, payload);

      // 화면 반영
      setCommonResult((prev) =>
        prev.map((r) =>
          r.machineNo === editCommonOldMachineNo ? { ...editCommonRow } : r
        )
      );

      // 상단 공통 입력폼이 같은 호기였다면 같이 갱신
      if (meta.machineNo === editCommonOldMachineNo) {
        setMeta({ ...editCommonRow });
      }

      cancelEditCommon();
      alert(`공통사항이 수정되었습니다. (업데이트 ${res.data.updated}건)`);
    } catch (e) {
      console.error(e);
      alert("공통사항 수정 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  /** ---------- UI ---------- */
  return (
    <div className={pageWrap}>
      <div className="mx-auto max-w-[1600px] px-8 py-6">
        <div className="grid grid-cols-[240px_1fr] items-stretch gap-6">
          {/* 좌측 Step 선택 */}
          <aside className="h-full rounded-2xl bg-white border border-slate-200 p-4 text-slate-900 shadow-sm">
            <div className="mb-3 text-sm font-semibold tracking-wide text-slate-800">
              Step 선택
            </div>
            <nav className="space-y-1">
              {STEPS.map((s) => {
                const active = s === currentStep;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => changeStep(s)}
                    className={`w-full rounded-lg px-4 py-2 text-left transition ${
                      active ? "bg-slate-400 text-white" : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* 본문 */}
          <main className="flex h-full flex-col gap-6">
            {/* 상단 바 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 hover:bg-slate-50"
                >
                  ← 뒤로가기
                </button>
                <h1 className="text-[22px] font-semibold text-slate-800">
                  세팅·불량 입력
                </h1>
              </div>
              {sheetId && (
                <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-500">
                  sheetId: {sheetId}
                </span>
              )}
            </div>

            {/* 공통 정보 카드 */}
            <section className={card}>
              <div className={sectionTitle}>공통 정보</div>
              <div className="w-full overflow-x-auto">
                <div className="min-w-[900px]">
                  <div className="grid grid-cols-[200px_200px_200px_200px_200px]">
                    {["장비번호", "S/N", "Chiller S/N", "세팅시작일", "세팅종료일"].map((h) => (
                      <div
                        key={h}
                        className="border-b border-slate-200 bg-sky-200/70 px-4 py-3 text-[15px] font-semibold text-slate-700"
                      >
                        {h}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-[200px_200px_200px_200px_200px]">
                    <div className={cell + " p-2"}>
                      <input
                        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-sky-200"
                        value={meta.machineNo}
                        onChange={(e) => onMeta("machineNo", e.target.value)}
                        placeholder="예: j-11-10"
                      />
                    </div>
                    <div className={cell + " p-2"}>
                      <input
                        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-sky-200"
                        value={meta.sn}
                        onChange={(e) => onMeta("sn", e.target.value)}
                        placeholder="예: SN-0001"
                      />
                    </div>
                    <div className={cell + " p-2"}>
                      <input
                        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-sky-200"
                        value={meta.chillerSn}
                        onChange={(e) => onMeta("chillerSn", e.target.value)}
                        placeholder="예: CH-0001"
                      />
                    </div>
                    <div className={cell + " p-2"}>
                      <input
                        type="date"
                        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-sky-200"
                        value={meta.setupStart}
                        onChange={(e) => onMeta("setupStart", e.target.value)}
                      />
                    </div>
                    <div className="border-b border-slate-200 p-2">
                      <input
                        type="date"
                        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-sky-200"
                        value={meta.setupEnd}
                        onChange={(e) => onMeta("setupEnd", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 스텝 입력 폼 */}
            <section className="rounded-2xl border border-sky-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-sky-200 px-6 py-3">
                <div className="text-[15px] font-semibold text-slate-800">
                  {currentStep} 스텝 입력 폼{" "}
                  <span className="font-normal text-slate-500">(여러 건 입력 가능)</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRows([emptyRow])}
                    className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600"
                  >
                    초기화
                  </button>
                  <button
                    type="button"
                    onClick={addRow}
                    className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600"
                  >
                    행 추가
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
                    disabled={loading}
                  >
                    저장
                  </button>
                </div>
              </div>
                <div className="w-full overflow-x-auto">
                  <div className="min-w-[1400px]">
                    {/* 헤더: 1줄 (위) */}
                    <div className="grid grid-cols-[130px_130px_1.6fr_150px_160px_120px]">
                      {[
                        "step",
                        "세팅 총 소요시간(시간)",
                        "세부 불량(멀티라인)",
                        "품질점수(자동)",
                        "T.S 소요(분)",
                        "관리",
                      ].map((h, i) => (
                        <div
                          key={i}
                          className="border-b border-sky-200 bg-sky-100 px-4 py-3 text-center text-[15px] font-semibold text-slate-700 first:text-left"
                        >
                          {h}
                        </div>
                      ))}
                    </div>

                    {/* 입력 행들: 각 행이 2줄 (위: 기본 필드 / 아래: 콤보박스들) */}
                    {rows.map((r, idx) => {
                      const defectTypeOptions = r.defect
                        ? DEFECT_TYPES_BY_DEFECT[r.defect] ?? []
                        : [];
                      return (
                        <React.Fragment key={idx}>
                          {/* 1줄차 */}
                          <div className="grid grid-cols-[130px_130px_1.6fr_150px_160px_120px]">
                            {/* step */}
                            <div className={rowTopCell + " p-2"}>
                              <input
                                readOnly
                                value={currentStep}
                                className="mt-1 h-11 w-full rounded-lg bg-slate-50 px-4 text-[15px]"
                              />
                            </div>

                            {/* 세팅 총 소요시간(시간) */}
                            <div className={rowTopCell + " p-2"}>
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-4 text-center text-[15px] focus:outline-none focus:ring-2 focus:ring-sky-200"
                                value={r.setupHours}
                                onChange={(e) => updateRow(idx, "setupHours", e.target.value)}
                                placeholder="예: 1.5"
                              />
                            </div>

                            {/* 세부 불량 */}
                            <div className={rowTopCell + " p-2"}>
                              <textarea
                                className="mt-1 min-h-[110px] w-full resize-y rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-[15px] leading-6 focus:outline-none focus:ring-2 focus:ring-sky-200"
                                rows={4}
                                value={r.defectDetail}
                                onChange={(e) => updateRow(idx, "defectDetail", e.target.value)}
                                placeholder="예: 케이블 접촉 불량 / 커넥터 재체결 ..."
                              />
                            </div>

                            {/* 품질 점수(자동) */}
                            <div className={rowTopCell + " p-2"}>
                              <input
                                readOnly
                                className="mt-1 h-11 w-full rounded-lg bg-slate-50 px-4 text-center text-[15px]"
                                value={r.qualityScore}
                                placeholder="자동"
                                title="T.S 소요(분)에 따라 자동 계산"
                              />
                            </div>

                            {/* TS 분 */}
                            <div className={rowTopCell + " p-2"}>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-4 text-center text-[15px] focus:outline-none focus:ring-2 focus:ring-sky-200"
                                value={r.tsMinutes}
                                onChange={(e) => updateRow(idx, "tsMinutes", e.target.value)}
                                placeholder="예: 30"
                              />
                            </div>

                            {/* 삭제 버튼 */}
                            <div className={"flex items-center justify-center " + rowTopCell + " p-2"}>
                              <button
                                type="button"
                                onClick={() => removeRow(idx)}
                                className="rounded-lg border border-orange-300 bg-white px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-50 disabled:opacity-50"
                                disabled={rows.length === 1}
                                title={rows.length === 1 ? "마지막 행은 삭제 불가" : "이 행 삭제"}
                              >
                                삭제
                              </button>
                            </div>
                          </div>

                          {/* 2줄차: 콤보 박스들 */}
                          <div className="grid grid-cols-[130px_130px_1.6fr_150px_160px_120px]">
                            {/* 라벨용 빈칸 */}
                            <div className={rowBottomCell + " px-4 py-2"}>
                              <div className="mt-1 text-xs font-medium text-slate-500">불량 입력</div>
                            </div>

                            {/* HW/SW */}
                            <div className={rowBottomCell + " p-2"}>
                              <label className="block text-xs text-slate-600">HW/SW</label>
                              <select
                                className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-sky-200"
                                value={r.hwSw}
                                onChange={(e) => updateRow(idx, "hwSw", e.target.value as HwSw)}
                              >
                                <option value="">없음</option>
                                {HW_SW_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* 불량구분 / 위치 */}
                            <div className={rowBottomCell + " p-2"}>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-xs text-slate-600">불량구분</label>
                                  <select
                                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-sky-200"
                                    value={r.defectGroup}
                                    onChange={(e) => updateRow(idx, "defectGroup", e.target.value)}
                                  >
                                    <option value="">없음</option>
                                    {DEFECT_GROUP_OPTIONS.map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-xs text-slate-600">불량 위치</label>
                                  <select
                                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-sky-200"
                                    value={r.defectLocation}
                                    onChange={(e) => updateRow(idx, "defectLocation", e.target.value)}
                                  >
                                    <option value="">없음</option>
                                    {LOCATION_OPTIONS.map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>

                            {/* 불량 + 불량유형 */}
                            <div className={rowBottomCell + " p-2"}>
                              <label className="block text-xs text-slate-600">불량</label>
                              <select
                                className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-sky-200"
                                value={r.defect}
                                onChange={(e) => updateRow(idx, "defect", e.target.value)}
                              >
                                <option value="">없음</option>
                                {DEFECT_OPTIONS.map((d) => (
                                  <option key={d} value={d}>
                                    {d}
                                  </option>
                                ))}
                              </select>

                              <label className="mt-2 block text-xs text-slate-600">불량유형</label>
                              <select
                                className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-sky-200"
                                value={r.defectType}
                                onChange={(e) => updateRow(idx, "defectType", e.target.value)}
                                disabled={!r.defect}
                              >
                                {!r.defect && <option value="">불량 없음</option>}
                                {r.defect &&
                                  defectTypeOptions.map((t) => (
                                    <option key={t} value={t}>
                                      {t}
                                    </option>
                                  ))}
                              </select>
                            </div>

                            {/* 나머지 두 칸 비움 */}
                            <div className={rowBottomCell}></div>
                            <div className={rowBottomCell}></div>
                          </div>
                        </React.Fragment>
                      );
                    })}

                    <div className="px-6 py-3 text-sm text-slate-500">
                      점수표: &lt;10분=1, 10~&lt;30=2, 30~&lt;60=5, 60~&lt;120=10,
                      120~&lt;240=20, 240~&lt;600=40, 600분 이상=60
                    </div>
                  </div>
                </div>

              
              <div className="px-6 py-3 text-sm text-slate-500">
                점수표: &lt;10분=1, 10~&lt;30=2, 30~&lt;60=5, 60~&lt;120=10,
                120~&lt;240=20, 240~&lt;600=40, 600분 이상=60
              </div>
            </section>

            {/* 데이터 조회 카드 */}
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className={sectionTitle}>데이터 조회</div>
              <div className="p-4">
                {/* ✅ 모드 토글 */}
                <div className="mb-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode("STEP");
                      setEditCommonOldMachineNo(null);
                      setEditCommonRow(null);
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-semibold border ${
                      viewMode === "STEP"
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    Step 입력 조회
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode("COMMON");
                      setEditId(null);
                      setEditRow(null);
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-semibold border ${
                      viewMode === "COMMON"
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    공통 사항 조회
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
                  <div className={viewMode === "STEP" ? "md:col-span-3" : "md:col-span-4"}>
                    <label className="text-xs font-medium text-slate-700">
                      machine_no
                    </label>
                    <input
                      value={qMachineNo}
                      onChange={(e) => setQMachineNo(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-sky-200"
                      placeholder="예: j-11-10"
                    />
                  </div>

                  {viewMode === "STEP" && (
                    <div className="md:col-span-2">
                      <label className="text-xs font-medium text-slate-700">
                        step
                      </label>
                      <select
                        value={qStep}
                        onChange={(e) => setQStep(e.target.value as typeof qStep)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-sky-200"
                      >
                        <option value="">전체</option>
                        {STEPS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setQMachineNo("");
                      setQStep("");
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    초기화
                  </button>
                  <button
                    type="button"
                    onClick={handleSearch}
                    disabled={loading}
                    className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
                  >
                    {loading ? "조회 중…" : "조회"}
                  </button>
                </div>
              </div>
            </section>

            {/* 조회 결과 */}
            <section className={card}>
              <div className={sectionTitle}>
                {viewMode === "STEP" ? "조회 결과 (Step)" : "조회 결과 (공통 사항)"}
              </div>

              <div className="w-full overflow-x-auto">
                {viewMode === "STEP" ? (
                  // ✅ STEP 결과: sheet_id / 생성일 컬럼 제거
                  <table className="w-full min-w-[1300px] text-left text-sm">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="px-3 py-2">ID</th>
                        <th className="px-3 py-2">step</th>
                        <th className="px-3 py-2">HW/SW</th>
                        <th className="px-3 py-2">불량구분</th>
                        <th className="px-3 py-2">불량 위치</th>
                        <th className="px-3 py-2">불량</th>
                        <th className="px-3 py-2">불량유형</th>
                        <th className="px-3 py-2">setup_hours</th>
                        <th className="px-3 py-2">defect_detail</th>
                        <th className="px-3 py-2">quality_score</th>
                        <th className="px-3 py-2">TS(분)</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.length === 0 ? (
                        <tr>
                          <td className="px-3 py-4 text-slate-500" colSpan={12}>
                            조회 결과가 없습니다. 조건을 입력하고 ‘조회’를 눌러주세요.
                          </td>
                        </tr>
                      ) : (
                        result.map((r) => {
                          const isEdit = editId === r.id;
                          const defectTypeOptions = r.defect
                            ? DEFECT_TYPES_BY_DEFECT[r.defect] ?? []
                            : [];
                          return (
                            <tr key={r.id} className="border-t hover:bg-gray-50">
                              <td className="px-3 py-2">{r.id}</td>

                              <td className="px-3 py-2">
                                {!isEdit ? (
                                  r.stepName
                                ) : (
                                  <select
                                    value={editRow?.stepName ?? r.stepName}
                                    onChange={(e) =>
                                      setEditRow((prev) =>
                                        prev
                                          ? { ...prev, stepName: e.target.value as StepType }
                                          : prev
                                      )
                                    }
                                    className="rounded border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-200"
                                  >
                                    {STEPS.map((s) => (
                                      <option key={s} value={s}>
                                        {s}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </td>

                              <td className="px-3 py-2">
                                {!isEdit ? (
                                  r.hwSw
                                ) : (
                                  <select
                                    value={editRow?.hwSw ?? r.hwSw}
                                    onChange={(e) =>
                                      setEditRow((p) => (p ? { ...p, hwSw: e.target.value } : p))
                                    }
                                    className="w-24 rounded border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-200"
                                  >
                                    <option value="">없음</option>
                                    {HW_SW_OPTIONS.map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </td>

                              <td className="px-3 py-2">
                                {!isEdit ? (
                                  r.defectGroup
                                ) : (
                                  <select
                                    value={editRow?.defectGroup ?? r.defectGroup}
                                    onChange={(e) =>
                                      setEditRow((p) =>
                                        p ? { ...p, defectGroup: e.target.value } : p
                                      )
                                    }
                                    className="w-32 rounded border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-200"
                                  >
                                    <option value="">없음</option>
                                    {DEFECT_GROUP_OPTIONS.map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </td>

                              <td className="px-3 py-2">
                                {!isEdit ? (
                                  r.defectLocation
                                ) : (
                                  <select
                                    value={editRow?.defectLocation ?? r.defectLocation}
                                    onChange={(e) =>
                                      setEditRow((p) =>
                                        p ? { ...p, defectLocation: e.target.value } : p
                                      )
                                    }
                                    className="w-32 rounded border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-200"
                                  >
                                    <option value="">없음</option>
                                    {LOCATION_OPTIONS.map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </td>

                              <td className="px-3 py-2">
                                {!isEdit ? (
                                  r.defect
                                ) : (
                                  <select
                                    value={editRow?.defect ?? r.defect}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      const types = DEFECT_TYPES_BY_DEFECT[v] ?? [];
                                      setEditRow((p) =>
                                        p ? { ...p, defect: v, defectType: types[0] ?? "" } : p
                                      );
                                    }}
                                    className="w-40 rounded border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-200"
                                  >
                                    <option value="">없음</option>
                                    {DEFECT_OPTIONS.map((d) => (
                                      <option key={d} value={d}>
                                        {d}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </td>

                              <td className="px-3 py-2">
                                {!isEdit ? (
                                  r.defectType
                                ) : (
                                  <select
                                    value={editRow?.defectType ?? r.defectType ?? ""}
                                    onChange={(e) =>
                                      setEditRow((p) => (p ? { ...p, defectType: e.target.value } : p))
                                    }
                                    className="w-36 rounded border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-200"
                                    disabled={!editRow?.defect && !r.defect}
                                  >
                                    {defectTypeOptions.map((t) => (
                                      <option key={t} value={t}>
                                        {t}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </td>

                              <td className="px-3 py-2">
                                {!isEdit ? (
                                  r.setupHours
                                ) : (
                                  <input
                                    value={editRow?.setupHours ?? r.setupHours ?? ""}
                                    onChange={(e) =>
                                      setEditRow((p) => (p ? { ...p, setupHours: e.target.value } : p))
                                    }
                                    className="w-24 rounded border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-200"
                                  />
                                )}
                              </td>

                              <td className="px-3 py-2">
                                {!isEdit ? (
                                  r.defectDetail
                                ) : (
                                  <input
                                    value={editRow?.defectDetail ?? r.defectDetail ?? ""}
                                    onChange={(e) =>
                                      setEditRow((p) => (p ? { ...p, defectDetail: e.target.value } : p))
                                    }
                                    className="w-[260px] rounded border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-200"
                                  />
                                )}
                              </td>

                              <td className="px-3 py-2">
                                {!isEdit ? (
                                  r.qualityScore
                                ) : (
                                  <input
                                    value={editRow?.qualityScore ?? r.qualityScore ?? ""}
                                    onChange={(e) =>
                                      setEditRow((p) => (p ? { ...p, qualityScore: e.target.value } : p))
                                    }
                                    className="w-24 rounded border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-200"
                                  />
                                )}
                              </td>

                              <td className="px-3 py-2">
                                {!isEdit ? (
                                  r.tsMinutes
                                ) : (
                                  <input
                                    value={editRow?.tsMinutes ?? r.tsMinutes ?? ""}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setEditRow((p) => {
                                        if (!p) return p;
                                        const score =
                                          val.trim() === ""
                                            ? ""
                                            : String(scoreFromMinutes(parseFloat(val)) ?? "");
                                        return { ...p, tsMinutes: val, qualityScore: score };
                                      });
                                    }}
                                    className="w-24 rounded border border-slate-300 px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-sky-200"
                                  />
                                )}
                              </td>

                              <td className="px-3 py-2">
                                {!isEdit ? (
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => startEdit(r)}
                                      className="rounded bg-orange-500 px-3 py-1 text-white hover:bg-orange-600"
                                    >
                                      수정
                                    </button>
                                    <button
                                      onClick={() => handleDelete(r)}
                                      className="rounded bg-orange-500 px-3 py-1 text-white hover:bg-orange-600"
                                    >
                                      삭제
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex gap-2">
                                    <button
                                      onClick={saveEdit}
                                      className="rounded bg-orange-500 px-3 py-1 text-white hover:bg-orange-600 disabled:opacity-60"
                                      disabled={loading}
                                    >
                                      저장
                                    </button>
                                    <button
                                      onClick={cancelEdit}
                                      className="rounded bg-gray-200 px-3 py-1 text-gray-800 hover:bg-gray-300"
                                    >
                                      취소
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                ) : (
                  // ✅ COMMON 결과: 공통사항 수정(호기 포함) 가능
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="px-3 py-2">machine_no</th>
                        <th className="px-3 py-2">sn</th>
                        <th className="px-3 py-2">chiller_sn</th>
                        <th className="px-3 py-2">setup_start_date</th>
                        <th className="px-3 py-2">setup_end_date</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {commonResult.length === 0 ? (
                        <tr>
                          <td className="px-3 py-4 text-slate-500" colSpan={6}>
                            조회 결과가 없습니다. 조건을 입력하고 ‘조회’를 눌러주세요.
                          </td>
                        </tr>
                      ) : (
                        commonResult.map((r) => {
                          const isEdit = editCommonOldMachineNo === r.machineNo;
                          return (
                            <tr key={r.machineNo} className="border-t hover:bg-gray-50">
                              <td className="px-3 py-2">
                                {!isEdit ? (
                                  r.machineNo
                                ) : (
                                  <input
                                    value={editCommonRow?.machineNo ?? r.machineNo}
                                    onChange={(e) =>
                                      setEditCommonRow((p) => (p ? { ...p, machineNo: e.target.value } : p))
                                    }
                                    className="w-44 rounded border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-200"
                                  />
                                )}
                              </td>

                              <td className="px-3 py-2">
                                {!isEdit ? (
                                  r.sn
                                ) : (
                                  <input
                                    value={editCommonRow?.sn ?? r.sn}
                                    onChange={(e) =>
                                      setEditCommonRow((p) => (p ? { ...p, sn: e.target.value } : p))
                                    }
                                    className="w-56 rounded border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-200"
                                  />
                                )}
                              </td>

                              <td className="px-3 py-2">
                                {!isEdit ? (
                                  r.chillerSn
                                ) : (
                                  <input
                                    value={editCommonRow?.chillerSn ?? r.chillerSn}
                                    onChange={(e) =>
                                      setEditCommonRow((p) => (p ? { ...p, chillerSn: e.target.value } : p))
                                    }
                                    className="w-56 rounded border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-200"
                                  />
                                )}
                              </td>

                              <td className="px-3 py-2">
                                {!isEdit ? (
                                  r.setupStart
                                ) : (
                                  <input
                                    type="date"
                                    value={editCommonRow?.setupStart ?? r.setupStart}
                                    onChange={(e) =>
                                      setEditCommonRow((p) => (p ? { ...p, setupStart: e.target.value } : p))
                                    }
                                    className="rounded border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-200"
                                  />
                                )}
                              </td>

                              <td className="px-3 py-2">
                                {!isEdit ? (
                                  r.setupEnd
                                ) : (
                                  <input
                                    type="date"
                                    value={editCommonRow?.setupEnd ?? r.setupEnd}
                                    onChange={(e) =>
                                      setEditCommonRow((p) => (p ? { ...p, setupEnd: e.target.value } : p))
                                    }
                                    className="rounded border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-200"
                                  />
                                )}
                              </td>

                              <td className="px-3 py-2">
                                {!isEdit ? (
                                  <button
                                    onClick={() => startEditCommon(r)}
                                    className="rounded bg-orange-500 px-3 py-1 text-white hover:bg-orange-600"
                                  >
                                    수정
                                  </button>
                                ) : (
                                  <div className="flex gap-2">
                                    <button
                                      onClick={saveEditCommon}
                                      className="rounded bg-orange-500 px-3 py-1 text-white hover:bg-orange-600 disabled:opacity-60"
                                      disabled={loading}
                                    >
                                      저장
                                    </button>
                                    <button
                                      onClick={cancelEditCommon}
                                      className="rounded bg-gray-200 px-3 py-1 text-gray-800 hover:bg-gray-300"
                                    >
                                      취소
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
