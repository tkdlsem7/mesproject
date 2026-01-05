# backend/ProgressChecklist/schemas.py
from __future__ import annotations

from typing import List, Optional
from datetime import date
from pydantic import BaseModel, Field


# ===== 조회 응답 =====

class ChecklistItemOut(BaseModel):
    no: int
    step: int
    item: str
    hours: float
    percent: float


class ChecklistPageOut(BaseModel):
    option: str
    total_hours: float
    item_count: int
    items: List[ChecklistItemOut]
    checked_steps: List[int] = Field(default_factory=list)


class ChecklistByMachineOut(BaseModel):
    machine_id: str
    options: List[str]
    pages: List[ChecklistPageOut]


# ===== 단건 저장 (선택) =====

class SaveChecklistIn(BaseModel):
    machine_id: str
    option: str
    checked_steps: List[int] = Field(default_factory=list)

    # ✅ 추가: 로그에 찍힐 날짜(YYYY-MM-DD). 안 주면 기존처럼 now()
    log_date: Optional[date] = None


class SaveChecklistOut(BaseModel):
    ok: bool


# ===== 배치 저장 (권장) =====

class SaveChecklistItem(BaseModel):
    option: str
    checked_steps: List[int] = Field(default_factory=list)


class SaveChecklistBatchIn(BaseModel):
    machine_id: str
    items: List[SaveChecklistItem] = Field(default_factory=list)

    # ✅ 추가: 로그에 찍힐 날짜(YYYY-MM-DD). 안 주면 기존처럼 now()
    log_date: Optional[date] = None


class SaveChecklistBatchOut(BaseModel):
    ok: bool
    saved: int
