# Dashboard/routers.py
from __future__ import annotations
from datetime import date as _date
from typing import List, Iterable, Optional
import re

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from backend.deps import get_db
from .models import (
    EquipProgress,
    EquipmentLog,
    EquipmentMoveLog,
    EquipmentShipmentLog,
)
from .schemas import SlotOut, MoveRequest, OK

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

BUILDING_PREFIX = {
    "A": tuple("ABCDEF"),
    "B": tuple("GHIJKL"),
    "I": tuple("I"),
    "JIN": tuple(),
}

JIN_SITE_NAME = "진우리"


def _is_empty(machine_id: str | None) -> bool:
    return (machine_id or "").strip() == ""


def _sort_key(slot_code: str) -> tuple[str, int]:
    m = re.match(r"^([A-Za-z])\s*0*([0-9]+)$", slot_code or "")
    if not m:
        return ("Z", 9999)
    return (m.group(1).upper(), int(m.group(2)))


def _resolve_jin_by_pos(db: Session, pos_code: str) -> Optional[EquipProgress]:
    m = re.match(r"^JIN(\d+)$", (pos_code or "").upper())
    if not m:
        return None
    idx = int(m.group(1))
    if idx <= 0:
        return None

    stmt = (
        select(EquipProgress)
        .where(EquipProgress.site == JIN_SITE_NAME)
        .order_by(EquipProgress.machine_id.asc(), EquipProgress.no.asc())
        .offset(idx - 1)
        .limit(1)
    )
    return db.execute(stmt).scalars().first()


def _resolve_src_row(db: Session, slot_code: str) -> Optional[EquipProgress]:
    sc = (slot_code or "").strip().upper()
    if sc.startswith("JIN"):
        return _resolve_jin_by_pos(db, sc)
    return db.query(EquipProgress).filter(EquipProgress.slot_code == slot_code).first()


@router.get("/slots", response_model=List[SlotOut])
def list_slots(
    db: Session = Depends(get_db),
    site: str = Query("본사", description="사이트명(본사/부항리/진우리/라인대기)"),
    building: str = Query("A", description="건물/라인 그룹: A|B|I|JIN"),
    limit: int = Query(1000, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    b = building.upper()
    if b not in BUILDING_PREFIX:
        raise HTTPException(status_code=400, detail="지원하지 않는 building 입니다.")

    prefixes: Iterable[str] = BUILDING_PREFIX[b]
    stmt = select(EquipProgress).where(EquipProgress.site == site).limit(limit).offset(offset)

    if b != "JIN":
        stmt = stmt.where(or_(*[EquipProgress.slot_code.ilike(f"{p}%") for p in prefixes]))

    rows: list[EquipProgress] = list(db.execute(stmt).scalars().all())

    if b == "JIN":
        rows.sort(key=lambda r: ((r.machine_id or "").lower(), int(getattr(r, "no", 0) or 0)))
    else:
        rows.sort(key=lambda r: _sort_key(r.slot_code))

    return [
        SlotOut(
            id=r.slot_code,
            slot_code=r.slot_code,
            machine_id=r.machine_id or None,
            progress=float(r.progress or 0),
            shipping_date=r.shipping_date,
            manager=r.manager,
            site=r.site,
            customer=getattr(r, "customer", None),
            serial_number=getattr(r, "serial_number", None),

            # ✅ 추가
            chiller_serial_number=getattr(r, "chiller_serial_number", None),

            note=getattr(r, "note", None),
            status=getattr(r, "status", None),
        )
        for r in rows
    ]


@router.post("/ship/{slot_code}", response_model=OK, status_code=status.HTTP_200_OK)
def ship_equipment(
    slot_code: str = Path(..., min_length=2, max_length=10, description="원본 슬롯 코드 (예: A7, JIN12)"),
    db: Session = Depends(get_db),
):
    row: EquipProgress | None = _resolve_src_row(db, slot_code)

    if not row:
        raise HTTPException(status_code=404, detail="슬롯/장비를 찾을 수 없습니다.")
    if not row.machine_id or not row.machine_id.strip():
        raise HTTPException(status_code=400, detail="빈 슬롯은 출하 처리할 수 없습니다.")
    if (row.status or "").strip() != "가능":
        raise HTTPException(status_code=400, detail='status가 "가능일 때만 출하 가능합니다')

    db.add(
        EquipmentShipmentLog(
            machine_no=row.machine_id.strip(),
            manager=(row.manager or "미지정").strip(),
            shipped_date=_date.today(),
            site=(row.site or "").strip(),
            slot=(row.slot_code or "").strip(),
            customer=(row.customer or "미지정").strip() if hasattr(row, "customer") else "미지정",
            progress=(row.progress or 0),
            serial_number=(row.serial_number or "").strip() if hasattr(row, "serial_number") else "",
        )
    )

    db.add(EquipmentLog(action="SHIP", slot_code=row.slot_code, machine_id=row.machine_id))

    db.delete(row)
    db.commit()
    return OK()


@router.post("/move/{slot_code}", response_model=OK, status_code=status.HTTP_200_OK)
def move_equipment(
    slot_code: str = Path(..., min_length=2, max_length=10, description="원본 슬롯 코드 (예: A7, JIN12)"),
    payload: MoveRequest = ...,
    db: Session = Depends(get_db),
):
    src: EquipProgress | None = _resolve_src_row(db, slot_code)
    if not src:
        raise HTTPException(status_code=404, detail="원본 슬롯/장비를 찾을 수 없습니다.")
    if _is_empty(src.machine_id):
        raise HTTPException(status_code=400, detail="원본 슬롯이 비어 있습니다.")

    dst: EquipProgress | None = (
        db.query(EquipProgress).filter(EquipProgress.slot_code == payload.dst_slot_code).first()
    )
    if not dst:
        raise HTTPException(status_code=404, detail="대상 슬롯을 찾을 수 없습니다.")
    if not _is_empty(dst.machine_id):
        raise HTTPException(status_code=400, detail="대상 슬롯이 비어있지 않습니다.")

    # 이동: 대상에 정보 복사
    dst.machine_id = src.machine_id
    dst.manager = src.manager
    dst.progress = src.progress
    dst.shipping_date = src.shipping_date

    if hasattr(dst, "customer") and hasattr(src, "customer"):
        dst.customer = getattr(src, "customer", None)
    if hasattr(dst, "serial_number") and hasattr(src, "serial_number"):
        dst.serial_number = getattr(src, "serial_number", None)

    # ✅ 추가: 칠러 시리얼
    if hasattr(dst, "chiller_serial_number") and hasattr(src, "chiller_serial_number"):
        dst.chiller_serial_number = getattr(src, "chiller_serial_number", None)

    if hasattr(dst, "note") and hasattr(src, "note"):
        dst.note = getattr(src, "note", None)
    if hasattr(dst, "status") and hasattr(src, "status"):
        dst.status = getattr(src, "status", None)

    # 원본 초기화
    src.machine_id = None
    src.manager = None
    src.progress = 0
    src.shipping_date = None

    if hasattr(src, "customer"):
        src.customer = None
    if hasattr(src, "serial_number"):
        src.serial_number = None

    # ✅ 추가: 칠러 시리얼 초기화
    if hasattr(src, "chiller_serial_number"):
        src.chiller_serial_number = None

    if hasattr(src, "note"):
        src.note = None
    if hasattr(src, "status"):
        src.status = None

    db.add(
        EquipmentMoveLog(
            from_slot=src.slot_code,
            to_slot=dst.slot_code,
            machine_id=dst.machine_id,
        )
    )

    db.commit()
    return OK()
