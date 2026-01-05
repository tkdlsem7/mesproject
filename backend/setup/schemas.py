# schemas.py
from __future__ import annotations
from typing import Optional
from datetime import date, datetime
from pydantic import BaseModel, Field, ConfigDict

class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)  # ORM → Pydantic

# ─ 요청 본문 ─
class Meta(_Base):
    machine_no: Optional[str] = None
    sn: Optional[str] = None
    chiller_sn: Optional[str] = None
    setup_start_date: Optional[date] = None
    setup_end_date: Optional[date] = None

class Step(_Base):
    id: Optional[int] = None     # 있으면 UPDATE, 없으면 INSERT
    step_name: str
    setup_hours: Optional[float] = Field(default=None, ge=0)
    defect_detail: Optional[str] = None
    quality_score: Optional[int] = Field(default=None, ge=0, le=100)
    ts_hours: Optional[float] = Field(default=None, ge=0)

    hw_sw: Optional[str] = None
    defect: Optional[str] = None
    defect_type: Optional[str] = None
    defect_group: Optional[str] = None
    defect_location: Optional[str] = None

class SaveRequest(_Base):
    sheetId: Optional[int] = None
    meta: Meta
    step: Step

class SaveResponse(_Base):
    sheetId: int
    stepId: int

# ─ 조회 응답 ─
class RowRead(_Base):
    id: int
    sheet_id: int
    step_name: Optional[str]
    machine_no: Optional[str]
    sn: Optional[str]
    chiller_sn: Optional[str]
    setup_start_date: Optional[date]
    setup_end_date: Optional[date]
    setup_hours: Optional[float]
    defect_detail: Optional[str]
    quality_score: Optional[int]
    ts_hours: Optional[float]

    hw_sw: Optional[str]
    defect: Optional[str]
    defect_type: Optional[str]
    defect_group: Optional[str]
    defect_location: Optional[str]

    created_at: datetime

# ✅ [추가] 공통사항 조회(호기 기준 1건만 대표로 내려줌)
class CommonRowRead(_Base):
    machine_no: Optional[str]
    sn: Optional[str]
    chiller_sn: Optional[str]
    setup_start_date: Optional[date]
    setup_end_date: Optional[date]

# ✅ [추가] 공통사항 일괄 수정(기존 호기(old_machine_no) 기준으로 전체 업데이트)
class CommonUpdateRequest(_Base):
    old_machine_no: str
    meta: Meta

class CommonUpdateResponse(_Base):
    updated: int
