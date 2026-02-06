# ------------------------------------------------------------
# Dashboard/schemas.py
# - Pydantic v1/v2 모두 호환
# - 필드 정규화(트림/대문자화/상태값 매핑) 포함
# - 옵션 콤마문자열 → 리스트 파싱 지원
# - 출하 로그(INSERT 용) 스키마 포함
# ------------------------------------------------------------
from __future__ import annotations
from datetime import date
from typing import Optional, List, Literal, TypeVar, Any

# ----- pydantic v1/v2 호환 처리 -----
try:
    # v2
    from pydantic import BaseModel, Field, ConfigDict
    from pydantic import field_validator as _field_validator  # type: ignore[attr-defined]
    _IS_V2 = True
except Exception:  # pragma: no cover
    # v1
    from pydantic import BaseModel, Field  # type: ignore
    from pydantic.class_validators import validator as _field_validator  # type: ignore
    _IS_V2 = False


# ----- 공통 타입 별칭 -----
MachineId = str
SlotCode   = str
SiteStr    = str
SerialStr  = str


def _clean_str(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    v2 = v.strip()
    return v2 if v2 != "" else None


def _upper(v: Optional[str]) -> Optional[str]:
    v = _clean_str(v)
    return v.upper() if v is not None else None


def _status_normalize(v: Optional[str]) -> Optional[Literal["ok", "hold", "가능", "불가능"]]:
    if v is None:
        return None
    s = v.strip().lower()
    if s in {"ok", "가능", "가능함", "가능해요", "가능합니다"}:
        return "ok"
    if s in {"hold", "보류", "불가", "불가능"}:
        return "hold"
    return None


# ============================================================
#  장비 정보 저장(수정) 요청
# ============================================================
class EquipmentSaveRequest(BaseModel):
    """대시보드의 장비 카드에서 정보 저장/수정 요청 바디"""

    machine_id: MachineId = Field(..., description="예: j-11-10")
    shipping_date: date
    manager: Optional[str] = ""
    customer: Optional[str] = ""
    slot_code: SlotCode = Field(..., description="예: B3, C7")
    site: Optional[SiteStr] = None
    serial_number: Optional[SerialStr] = None

    # ✅ (기존) status
    status: Optional[Literal["가능", "불가능", "ok", "hold"]] = "불가능"
    note: Optional[str] = None

    # ✅ 옵션
    option_ids: Optional[List[int]] = None
    replace_options: Optional[bool] = None
    option_codes_str: Optional[str] = None
    option_codes: Optional[List[str]] = None

    @_field_validator("machine_id")
    def _v_machine_id(cls, v: str) -> str:
        v2 = v.strip()
        if not v2:
            raise ValueError("machine_id is empty")
        for ch in v2:
            if not (ch.isalnum() or ch in "-_"):
                raise ValueError("machine_id has invalid character")
        return v2

    @_field_validator("slot_code")
    def _v_slot_code(cls, v: str) -> str:
        v2 = _upper(v)
        if not v2:
            raise ValueError("slot_code is empty")
        return v2

    @_field_validator("manager", "customer", "site", "serial_number", "note")
    def _v_trim_optional(cls, v: Optional[str]) -> Optional[str]:
        return _clean_str(v)

    @_field_validator("status")
    def _v_status(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        norm = _status_normalize(v)
        return norm or "hold"

    @_field_validator("option_codes", mode="before")
    def _v_option_codes_before(cls, v: Any, values: Any) -> Any:
        if v is not None:
            return v
        raw = values.get("option_codes_str")
        if raw and isinstance(raw, str):
            toks = [t.strip() for t in raw.split(",")]
            toks = [t for t in toks if t]
            return toks or None
        return None

    if _IS_V2:
        model_config = ConfigDict(protected_namespaces=(), from_attributes=True)
    else:
        class Config:
            orm_mode = True


# ============================================================
#  대시보드 슬롯 단건 응답
# ============================================================
class SlotOut(BaseModel):
    """대시보드 슬롯 응답 DTO"""
    id: str = Field(..., description="슬롯 식별자 (=slot_code)")
    slot_code: str
    machine_id: Optional[str] = None
    progress: float = 0
    shipping_date: Optional[date] = None
    manager: Optional[str] = None
    site: Optional[str] = None

    # 프리필에 필요한 필드들
    customer: Optional[str] = None
    serial_number: Optional[str] = None

    # ✅ 추가: 칠러 시리얼 넘버
    chiller_serial_number: Optional[str] = None

    note: Optional[str] = None
    status: Optional[str] = None

    if _IS_V2:
        model_config = ConfigDict(from_attributes=True)
    else:
        class Config:
            orm_mode = True


# ============================================================
#  장비 이동 요청
# ============================================================
class MoveRequest(BaseModel):
    dst_slot_code: str = Field(..., min_length=2, max_length=5, description="대상 슬롯 코드 (예: C7)")

    @_field_validator("dst_slot_code")
    def _v_dst_slot(cls, v: str) -> str:
        v2 = _upper(v)
        if not v2:
            raise ValueError("dst_slot_code is empty")
        return v2


# ============================================================
#  출하 로그(INSERT 용)
# ============================================================
class ShipmentCreate(BaseModel):
    machine_no: str = Field(..., max_length=20)
    manager: str = Field(..., max_length=50)
    shipped_date: date
    site: str = Field(..., max_length=30)
    slot: Optional[str] = Field(default=None, max_length=5)
    customer: str = Field(..., max_length=50)

    @_field_validator("machine_no", "manager", "site", "slot", "customer")
    def _v_trim(cls, v: Optional[str]) -> Optional[str]:
        return _clean_str(v)

    if _IS_V2:
        model_config = ConfigDict(protected_namespaces=())
    else:
        class Config:
            anystr_strip_whitespace = True


class ShipmentOut(BaseModel):
    id: int
    machine_no: str
    manager: str
    shipped_date: date
    site: str
    slot: Optional[str] = None
    customer: str

    if _IS_V2:
        model_config = ConfigDict(from_attributes=True)
    else:
        class Config:
            orm_mode = True


class OK(BaseModel):
    status: str = "ok"
