from __future__ import annotations
from pydantic import BaseModel
from typing import Optional, List  # ← 추가
from datetime import datetime


class BuildingCapacity(BaseModel):
    used: int
    capacity: int
    remaining: int


class CapacityResponse(BaseModel):
    A: BuildingCapacity
    B: BuildingCapacity
    I: BuildingCapacity


class ShipSummary(BaseModel):
    today: int       # 오늘 출하 개수 (shipping_date == today)
    within3: int     # 오늘 포함 3일 이내 출하 개수 (today ~ today+3)


# ✅ 오늘 입고 요약
class ReceiptSummary(BaseModel):
    today: int


class EquipProgressBrief(BaseModel):
    no: int
    machine_id: Optional[str] = None
    manager: Optional[str] = None
    customer: Optional[str] = None
    slot_code: Optional[str] = None


class RowBrief(BaseModel):
    machine_id: Optional[str] = None
    manager: Optional[str] = None
    slot_code: Optional[str] = None


class EquipGroupSummary(BaseModel):
    name: str                           # "A동", "B동", "I라인", "본사", "진우리"
    status_counts: dict[str, int]       # waiting / processing / done 개수
    model_counts: dict[str, int]        # SD(e), SE(e) 같은 모델별 개수


class EquipSummaryResponse(BaseModel):
    buildings: List[EquipGroupSummary]  # A동 / B동 / I라인
    sites: List[EquipGroupSummary]      # 본사 / 진우리


# ─────────────────────────────────────────
# 🔹 메인페이지: 모델/상태 요약 응답 스키마
# ─────────────────────────────────────────
class BuildingEquipSummary(BaseModel):
    # 예) {"FD": 3, "SC": 2, "STP(e)": 1}
    model_counts: dict[str, int]
    # 예) {"waiting": 2, "processing": 3, "done": 1}
    status_counts: dict[str, int]


class EquipSummary(BaseModel):
    A: BuildingEquipSummary
    B: BuildingEquipSummary
    I: BuildingEquipSummary

class EquipGroupSummary(BaseModel):
    name: str                           # "A동", "B동", "I라인", "본사", "진우리"
    status_counts: dict[str, int]       # waiting / processing / done 개수
    model_counts: dict[str, int]        # SD(e), SE(e) 등 모델별 개수


class EquipSummaryResponse(BaseModel):
    buildings: List[EquipGroupSummary]  # A동 / B동 / I라인
    sites: List[EquipGroupSummary]      # 본사 / 진우리

class AttendanceCreate(BaseModel):
    user_id: str
    record_type: int  # 1,2,3


class AttendanceLogOut(BaseModel):
    no: int
    user_id: str
    record_type: int
    checked_at: datetime

    class Config:
        from_attributes = True