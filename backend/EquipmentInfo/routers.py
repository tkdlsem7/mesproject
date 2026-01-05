# backend/EquipmentInfo/routers.py
from __future__ import annotations

from decimal import Decimal
from datetime import date as _date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from backend.deps import get_db
from .models import (
    EquipProgress,
    EquipmentReceiptLog,
    EquipmentOption,
)
from .schemas import (
    EquipmentOptionOut,
    EquipmentReceiptDateOut,
    EquipmentSaveRequest,
    EquipmentSaveResponse,
)

router = APIRouter(
    prefix="/dashboard/equipment",
    tags=["Dashboard / EquipmentInfo"],
)


@router.get("/ping")
def ping():
    return {"ok": True, "where": "EquipmentInfo"}


def _normalize_status(s: Optional[str]) -> str:
    if s is None:
        return "불가능"
    v = s.strip().lower()
    if not v:
        return "불가능"
    if v in ("가능", "ok", "okay", "true", "yes", "avail", "available"):
        return "가능"
    if v in ("불가능", "hold", "false", "no", "unavail", "blocked", "ban"):
        return "불가능"
    return "불가능"


def _is_blank(s: Optional[str]) -> bool:
    return s is None or s.strip() == ""


def _upsert_equipment_option(
    db: Session,
    machine_id: str,
    manager: str,
    option_codes_str: Optional[str],
) -> None:
    if option_codes_str is None:
        return

    codes = option_codes_str.strip()

    row = (
        db.query(EquipmentOption)
        .filter(EquipmentOption.machine_id == machine_id)
        .order_by(EquipmentOption.id.desc())
        .first()
    )
    if row:
        row.option_id = codes
        row.manager = manager or ""
        row.selected_at = func.now()
    else:
        db.add(
            EquipmentOption(
                machine_id=machine_id,
                option_id=codes,
                manager=manager or "",
            )
        )


def _upsert_receipt_date(
    db: Session,
    *,
    machine_no: str,
    receive_date: _date,
    manager: str,
    site: str,
    slot: str,
) -> None:
    """
    equipment_receipt_log 에서 machine_no 기준으로 '가장 최근' row를 찾아 receive_date를 업데이트.
    - row가 없으면 새로 insert
    """
    row = (
        db.query(EquipmentReceiptLog)
        .filter(EquipmentReceiptLog.machine_no == machine_no)
        .order_by(EquipmentReceiptLog.id.desc())
        .first()
    )
    if row:
        row.receive_date = receive_date
        row.manager = manager or row.manager
        row.site = site or row.site
        row.slot = slot or row.slot
    else:
        db.add(
            EquipmentReceiptLog(
                machine_no=machine_no,
                manager=manager or "",
                receive_date=receive_date,
                site=site or "",
                slot=slot,
            )
        )


def _effective_receive_date(payload: EquipmentSaveRequest) -> _date:
    return payload.receive_date or _date.today()


@router.get("/options/{machine_id}", response_model=EquipmentOptionOut)
def get_equipment_options(machine_id: str = Path(..., min_length=1), db: Session = Depends(get_db)):
    row = (
        db.query(EquipmentOption)
        .filter(EquipmentOption.machine_id == machine_id.strip())
        .order_by(EquipmentOption.id.desc())
        .first()
    )
    if not row or not (row.option_id or "").strip():
        return EquipmentOptionOut(machine_id=machine_id, option_codes=[], option_codes_str="")
    raw = row.option_id or ""
    codes = [c.strip() for c in raw.split(",") if c.strip()]
    return EquipmentOptionOut(machine_id=machine_id, option_codes=codes, option_codes_str=raw)


# ✅ 프론트 프리필용: 가장 최근 입고일 조회
@router.get("/receipt-date/{machine_id}", response_model=EquipmentReceiptDateOut)
def get_latest_receipt_date(machine_id: str = Path(..., min_length=1), db: Session = Depends(get_db)):
    row = (
        db.query(EquipmentReceiptLog)
        .filter(EquipmentReceiptLog.machine_no == machine_id.strip())
        .order_by(EquipmentReceiptLog.id.desc())
        .first()
    )
    return EquipmentReceiptDateOut(receive_date=(row.receive_date if row else None))


@router.post("/save", response_model=EquipmentSaveResponse)
def save_equipment_info(payload: EquipmentSaveRequest, db: Session = Depends(get_db)):
    # ── 입력 정규화
    machine_id = payload.machine_id.strip()
    slot_code = payload.slot_code.strip().upper()
    site = payload.site.strip() if payload.site else ""
    status_norm = _normalize_status(payload.status)

    # ── 1) machine_id 기준 UPDATE
    row_by_machine = db.query(EquipProgress).filter(EquipProgress.machine_id == machine_id).first()
    if row_by_machine:
        row_by_machine.manager = payload.manager or ""
        row_by_machine.shipping_date = payload.shipping_date
        row_by_machine.customer = payload.customer or ""
        row_by_machine.slot_code = slot_code
        row_by_machine.site = site
        row_by_machine.serial_number = payload.serial_number
        row_by_machine.status = status_norm
        row_by_machine.note = payload.note

        try:
            db.flush()

            _upsert_equipment_option(
                db,
                machine_id=machine_id,
                manager=payload.manager or "",
                option_codes_str=payload.option_codes_str,
            )

            # ✅ 입고일 수정
            if payload.receive_date is not None:
                _upsert_receipt_date(
                    db,
                    machine_no=machine_id,
                    receive_date=payload.receive_date,
                    manager=payload.manager or "",
                    site=site or "",
                    slot=slot_code,
                )

            db.commit()
            db.refresh(row_by_machine)
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"저장 실패: {e}")

        return EquipmentSaveResponse(mode="update", row_no=row_by_machine.no, saved_option_count=0)

    # ── 2) (site, slot_code) 기준 UPDATE
    row_by_slot = (
        db.query(EquipProgress)
        .filter(and_(EquipProgress.site == site, EquipProgress.slot_code == slot_code))
        .first()
    )
    if row_by_slot:
        was_empty = _is_blank(row_by_slot.machine_id)

        row_by_slot.machine_id = machine_id
        row_by_slot.manager = payload.manager or ""
        row_by_slot.shipping_date = payload.shipping_date
        row_by_slot.customer = payload.customer or ""
        row_by_slot.slot_code = slot_code
        row_by_slot.site = site
        row_by_slot.serial_number = payload.serial_number
        row_by_slot.status = status_norm
        row_by_slot.note = payload.note

        try:
            db.flush()

            _upsert_equipment_option(
                db,
                machine_id=machine_id,
                manager=payload.manager or "",
                option_codes_str=payload.option_codes_str,
            )

            # 빈 슬롯 → 입고 로그 insert
            if was_empty and not _is_blank(machine_id):
                db.add(
                    EquipmentReceiptLog(
                        machine_no=machine_id,
                        manager=payload.manager or "",
                        receive_date=_effective_receive_date(payload),
                        site=site or "",
                        slot=slot_code,
                    )
                )
            # 기존 장비 → 입고일만 수정
            elif payload.receive_date is not None:
                _upsert_receipt_date(
                    db,
                    machine_no=machine_id,
                    receive_date=payload.receive_date,
                    manager=payload.manager or "",
                    site=site or "",
                    slot=slot_code,
                )

            db.commit()
            db.refresh(row_by_slot)
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"저장 실패: {e}")

        return EquipmentSaveResponse(mode="update", row_no=row_by_slot.no, saved_option_count=0)

    # ── 3) INSERT
    new_row = EquipProgress(
        machine_id=machine_id,
        progress=Decimal("0.00"),
        manager=payload.manager or "",
        shipping_date=payload.shipping_date,
        customer=payload.customer or "",
        slot_code=slot_code,
        site=site,
        serial_number=payload.serial_number,
        status=status_norm,
        note=payload.note,
    )
    db.add(new_row)

    try:
        db.flush()

        _upsert_equipment_option(
            db,
            machine_id=machine_id,
            manager=payload.manager or "",
            option_codes_str=payload.option_codes_str,
        )

        # 새로 삽입된 케이스는 입고로 간주
        db.add(
            EquipmentReceiptLog(
                machine_no=machine_id,
                manager=payload.manager or "",
                receive_date=_effective_receive_date(payload),
                site=site or "",
                slot=slot_code,
            )
        )

        db.commit()
        db.refresh(new_row)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"저장 실패: {e}")

    return EquipmentSaveResponse(mode="insert", row_no=new_row.no, saved_option_count=0)
