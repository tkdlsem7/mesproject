# backend/setup/schemas.py
from __future__ import annotations

from datetime import date, datetime
from typing import Optional, Any, Dict

from pydantic import BaseModel
from pydantic import ConfigDict


# -----------------------------
# 공통: 장비 공통정보(헤더)
# -----------------------------
class SetupSheetMeta(BaseModel):
    """
    setup_sheet_all 의 공통(헤더) 영역
    프론트에서는 보통 "YYYY-MM-DD" 문자열로 보내도 Pydantic이 date로 파싱함.
    """
    machine_no: Optional[str] = None
    sn: Optional[str] = None
    chiller_sn: Optional[str] = None

    # ✅ 중요: DB가 date 타입이므로 schema도 date로 맞춘다
    setup_start_date: Optional[date] = None
    setup_end_date: Optional[date] = None


# -----------------------------
# 공통: 스텝 입력(저장용)
# -----------------------------
class SetupSheetStepIn(BaseModel):
    """
    저장(save) 요청에서 step 영역
    """
    id: Optional[int] = None  # 있으면 UPDATE, 없으면 INSERT
    step_name: Optional[str] = None

    setup_hours: Optional[float] = None
    defect_detail: Optional[str] = None
    quality_score: Optional[float] = None
    ts_hours: Optional[float] = None

    hw_sw: Optional[str] = None
    defect: Optional[str] = None
    defect_type: Optional[str] = None
    defect_group: Optional[str] = None
    defect_location: Optional[str] = None

    remark: Optional[str] = None
    apply_text: Optional[str] = None


# -----------------------------
# 저장 API (/save)
# -----------------------------
class SaveRequest(BaseModel):
    sheetId: Optional[int] = None
    meta: SetupSheetMeta
    step: SetupSheetStepIn


class SaveResponse(BaseModel):
    sheetId: int
    stepId: int


# -----------------------------
# 조회 응답(/search, /manage 등)
# -----------------------------
class RowRead(BaseModel):
    """
    SetupSheetAll ORM -> 응답용
    """
    model_config = ConfigDict(from_attributes=True)

    id: int
    sheet_id: Optional[int] = None

    step_name: Optional[str] = None
    machine_no: Optional[str] = None
    sn: Optional[str] = None
    chiller_sn: Optional[str] = None

    # ✅ 중요: date 로 맞춤
    setup_start_date: Optional[date] = None
    setup_end_date: Optional[date] = None

    setup_hours: Optional[float] = None
    defect_detail: Optional[str] = None
    quality_score: Optional[float] = None
    ts_hours: Optional[float] = None

    hw_sw: Optional[str] = None
    defect: Optional[str] = None
    defect_type: Optional[str] = None
    defect_group: Optional[str] = None
    defect_location: Optional[str] = None

    remark: Optional[str] = None
    apply_text: Optional[str] = None
    
    created_at: Optional[datetime] = None



class CommonRowRead(BaseModel):
    """
    /search-common 에서 machine_no 기준으로 최신 common 정보 보여줄 때 사용
    """
    model_config = ConfigDict(from_attributes=True)

    machine_no: Optional[str] = None
    sn: Optional[str] = None
    chiller_sn: Optional[str] = None

    setup_start_date: Optional[date] = None
    setup_end_date: Optional[date] = None

    created_at: Optional[datetime] = None


class CommonUpdateRequest(BaseModel):
    old_machine_no: str
    meta: SetupSheetMeta


class CommonUpdateResponse(BaseModel):
    updated: int


# -----------------------------
# ✅ 수정/삭제(관리) 관련
# -----------------------------
class SetupSheetStepUpdate(BaseModel):
    """
    PATCH 개념: 들어온 필드만 업데이트(exclude_unset=True 사용 전제)
    - 프론트가 row 단위로 수정할 때, 공통 필드(machine_no/sn/date)도 같이 올 수 있어서 포함
    """
    # 공통(헤더)
    machine_no: Optional[str] = None
    sn: Optional[str] = None
    chiller_sn: Optional[str] = None
    setup_start_date: Optional[date] = None
    setup_end_date: Optional[date] = None

    # step
    step_name: Optional[str] = None
    setup_hours: Optional[float] = None
    defect_detail: Optional[str] = None
    quality_score: Optional[float] = None
    ts_hours: Optional[float] = None

    hw_sw: Optional[str] = None
    defect: Optional[str] = None
    defect_type: Optional[str] = None
    defect_group: Optional[str] = None
    defect_location: Optional[str] = None
    remark: Optional[str] = None
    apply_text: Optional[str] = None

class SetupSheetStepRead(BaseModel):
    """
    수정 API 응답용 (update_step 등)
    """
    model_config = ConfigDict(from_attributes=True)

    id: int
    sheet_id: Optional[int] = None

    machine_no: Optional[str] = None
    sn: Optional[str] = None
    chiller_sn: Optional[str] = None

    # ✅ 중요: date
    setup_start_date: Optional[date] = None
    setup_end_date: Optional[date] = None

    step_name: Optional[str] = None
    setup_hours: Optional[float] = None
    defect_detail: Optional[str] = None
    quality_score: Optional[float] = None
    ts_hours: Optional[float] = None

    hw_sw: Optional[str] = None
    defect: Optional[str] = None
    defect_type: Optional[str] = None
    defect_group: Optional[str] = None
    defect_location: Optional[str] = None
    remark: Optional[str] = None
    apply_text: Optional[str] = None
    created_at: Optional[datetime] = None


# -----------------------------
# equip_progress 응답 (컬럼이 프로젝트마다 달라서 넉넉하게)
# -----------------------------
class EquipProgressRead(BaseModel):
    """
    EquipProgress ORM -> 응답
    컬럼이 프로젝트마다 달라질 수 있어서 extra 허용.
    """
    model_config = ConfigDict(from_attributes=True, extra="allow")


# -----------------------------
# equipment_schedule에서 세팅 날짜 조회
# -----------------------------
class SettingDatesRead(BaseModel):
    machine_no: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
