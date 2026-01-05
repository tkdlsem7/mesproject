# backend/LogBrowser/schemas.py
try:
    from pydantic import BaseModel, Field, ConfigDict
    _V2 = True
except Exception:  # pydantic v1 호환
    from pydantic import BaseModel, Field  # type: ignore
    _V2 = False


class TableMeta(BaseModel):
    name: str
    columns: list[str]
    date_fields: list[str] = []

    if _V2:
        model_config = ConfigDict(from_attributes=True)
    else:
        class Config:
            orm_mode = True


class RowsResponse(BaseModel):
    columns: list[str]
    rows: list[dict]
    total: int


# ──────────────────────────────────────
#  리드타임 계산용 스키마
# ──────────────────────────────────────
from typing import List, Optional


class LeadTimeItem(BaseModel):
    """
    한 호기(machine_no)에 대한 리드타임 계산 결과
    """

    machine_no: str
    # 사내 입고 → 출하
    in_to_ship_days: Optional[float] = None
    # 사내 입고 → 생산 완료(progress=100)
    in_to_done_days: Optional[float] = None
    # 사내 입고 → 생산 시작(progress>0 중 최소)
    in_to_start_days: Optional[float] = None


class LeadTimeRequest(BaseModel):
    """
    프론트에서 보낸 호기 목록
    """
    machine_nos: List[str]


class LeadTimeResponse(BaseModel):
    items: List[LeadTimeItem]
