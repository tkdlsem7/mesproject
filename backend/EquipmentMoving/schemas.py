from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field


# ✅ 사이트: 현재 운영에 맞춰 추가/확장
AllowedSite = Literal["본사", "진우리", "라인대기", "부항리"]


class EquipmentRowOut(BaseModel):
    machine_id: str
    site: str
    slot: str
    manager: Optional[str] = None
    progress: Optional[int] = None


class EquipmentListOut(BaseModel):
    site: AllowedSite
    items: List[EquipmentRowOut] = Field(default_factory=list)


class MoveItemIn(BaseModel):
    machine_id: str = Field(..., min_length=1)
    to_site: AllowedSite
    to_slot: str = Field(..., min_length=1)


class MoveBatchIn(BaseModel):
    items: List[MoveItemIn] = Field(default_factory=list)


class ConflictOut(BaseModel):
    site: str
    slot: str
    current_machine_id: str


class MoveBatchOut(BaseModel):
    ok: bool
    updated: int
    not_found: List[str] = Field(default_factory=list)
    conflicts: List[ConflictOut] = Field(default_factory=list)
    # (옵션) 내부 진단용. 프론트에서 무시해도 동작에는 영향 없음
    errors: List[str] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────
# 붙여넣기 파서 (현재 UI에서 비활성이라도 라우터가 참조하므로 유지)
# ─────────────────────────────────────────────────────────────
class PasteParseIn(BaseModel):
    text: str = ""


class PasteParsedRow(BaseModel):
    raw: str
    machine_id: str = ""
    from_site: str = ""
    to_site: str = ""
    from_slot: str = ""
    to_slot: str = ""
    status: Literal["ok", "not_found", "conflict", "skip", "error"] = "skip"
    message: str = ""


class PasteParseOut(BaseModel):
    from_site: str
    to_site: str
    ok: int = 0
    not_found: int = 0
    conflict: int = 0
    items: List[PasteParsedRow] = Field(default_factory=list)
