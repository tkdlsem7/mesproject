# backend/MainDashboard/schemas.py
from __future__ import annotations

from datetime import date
from typing import Literal, Optional, List, Annotated

from pydantic import BaseModel, Field, StringConstraints

MachineId = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]
SlotCode  = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5)]
SiteStr   = Annotated[str, StringConstraints(strip_whitespace=True, max_length=30)]
SerialStr = Annotated[str, StringConstraints(strip_whitespace=True, max_length=50)]


class EquipmentSaveRequest(BaseModel):
    machine_id: MachineId
    shipping_date: Optional[date] = None

    # ✅ 추가: 사용자가 지정한 입고일(미입력 시 백엔드에서 오늘 날짜로 처리)
    receive_date: Optional[date] = None

    manager: Optional[str] = Field(default="")
    customer: Optional[str] = Field(default="")
    slot_code: SlotCode
    site: Optional[SiteStr] = None
    serial_number: Optional[SerialStr] = None

    status: Optional[Literal["가능", "불가능", "ok", "hold"]] = "불가능"
    note: Optional[str] = None

    option_ids: Optional[List[int]] = None
    replace_options: Optional[bool] = None
    option_codes_str: Optional[str] = None


class EquipmentSaveResponse(BaseModel):
    mode: Literal["insert", "update"]
    row_no: int
    saved_option_count: int = 0


class EquipmentOptionOut(BaseModel):
    machine_id: str
    option_codes: List[str] = []
    option_codes_str: str = ""


class EquipmentReceiptDateOut(BaseModel):
    # ✅ 가장 최근 입고일(없으면 None)
    receive_date: Optional[date] = None
