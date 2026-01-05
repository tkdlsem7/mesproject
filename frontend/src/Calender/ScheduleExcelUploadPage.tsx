import React, { useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

/**
 * CRA 기준:
 * - .env에 REACT_APP_API_BASE=http://192.168.101.1:8000/api 같은 값이 있으면 그걸 사용
 * - 없으면 개발: localhost, 운영: /api
 */
export const API_BASE =
  process.env.NODE_ENV === "production" ? "/api" : "http://localhost:8000/api";

type SourceKey = "production" | "setup";

export default function CalendarExcelUploadPage() {
  const navigate = useNavigate();

  const [sourceKey, setSourceKey] = useState<SourceKey>("production");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const helpText = useMemo(() => {
    return sourceKey === "production"
      ? "생산 일정관리 엑셀에서 (출하요청/SETTING/QC) 일정만 추출하여 업로드합니다."
      : "세팅 일정관리 엑셀에서 (출하요청/SETTING/QC) 일정만 추출하여 업로드합니다.";
  }, [sourceKey]);

  const onSubmit = async () => {
    if (!file) {
      alert("엑셀 파일을 선택해주세요.");
      return;
    }

    const form = new FormData();
    form.append("source_key", sourceKey);
    form.append("file", file);

    try {
      setUploading(true);

      const res = await axios.post(`${API_BASE}/calendar/upload`, form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
      });

      alert(
        `업로드 완료\n- 기존 ${res.data.deleted_count}건 삭제\n- 신규 ${res.data.inserted_count}건 추가`
      );

      // 업로드 후 캘린더로 이동
      navigate("/calendar", { replace: true });
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "업로드 중 오류가 발생했습니다.";
      alert(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        {/* 헤더 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xl font-bold text-slate-800">엑셀 업로드</div>
              <div className="mt-1 text-sm text-slate-500">{helpText}</div>
            </div>

            <button
              type="button"
              onClick={() => navigate("/calendar", { replace: true })}
              className="h-10 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              disabled={uploading}
            >
              돌아가기
            </button>
          </div>

          {/* 폼 */}
          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                소스키
              </label>
              <select
                value={sourceKey}
                onChange={(e) => setSourceKey(e.target.value as SourceKey)}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-200"
                disabled={uploading}
              >
                <option value="production">생산 일정</option>
                <option value="setup">세팅 일정</option>
              </select>
              <div className="mt-1 text-xs text-slate-500">
                업로드 시 이 소스키 기준으로 기존 데이터가 삭제되고 새로 등록됩니다.
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                엑셀 파일
              </label>
              <input
                type="file"
                accept=".xlsx,.xls,.xlsm,.xltx,.xltm"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full rounded-xl border border-slate-300 bg-white p-2 text-sm"
                disabled={uploading}
              />
              <div className="mt-1 text-xs text-slate-500">
                시트명: <span className="font-mono">생산 일정관리</span> 에서만
                읽습니다.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onSubmit}
                className="h-11 rounded-full bg-orange-500 px-5 text-sm font-bold text-white shadow-sm hover:bg-orange-600 disabled:opacity-50"
                disabled={uploading}
              >
                {uploading ? "업로드 중…" : "업로드"}
              </button>
            </div>
          </div>
        </div>

        {/* 안내 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
          <div className="font-bold text-slate-800">업로드 규칙</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>엑셀 1행 → DB 3행(출하요청 / SETTING / QC)으로 저장</li>
            <li>출하요청은 start_date만 저장(end_date는 NULL)</li>
            <li>공통: 호기(machine_no), SETTING(owner), 비고(note)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
