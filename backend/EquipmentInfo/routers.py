# backend/EquipmentInfo/routers.py
from __future__ import annotations

from decimal import Decimal
from datetime import date as _date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy import func
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
    EquipmentDetailOut,
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


def _find_slot_row_strict(db: Session, *, site: str, slot_code: str):
    """
    저장/수정용: site가 들어오면 site까지 최대한 일치하는 row를 찾는다.
    - trim 비교 1차
    - 그래도 없으면 기존 로직처럼 site 무시(=slot only)는 하지 않는다(오입력 방지)
    """
    q = db.query(EquipProgress).filter(EquipProgress.slot_code == slot_code)

    if site.strip():
        # site가 '본사 ' 같은 경우를 고려해 trim 비교
        q = q.filter(func.trim(EquipProgress.site) == site.strip())

    return q.order_by(EquipProgress.no.desc()).first()


def _find_slot_row_relaxed(db: Session, *, site: str, slot_code: str):
    """
    조회용:
    1) slot + (trim site exact)
    2) slot + (site prefix match)  ex) '본사' vs '본사(a동,b동)'
    3) slot only (가장 최신 no 우선)
    """
    slot = slot_code.strip().upper()
    site_norm = (site or "").strip()

    if site_norm:
        row = (
            db.query(EquipProgress)
            .filter(EquipProgress.slot_code == slot)
            .filter(func.trim(EquipProgress.site) == site_norm)
            .first()
        )
        if row:
            return row

        row = (
            db.query(EquipProgress)
            .filter(EquipProgress.slot_code == slot)
            .filter(EquipProgress.site.ilike(f"{site_norm}%"))
            .order_by(EquipProgress.no.desc())
            .first()
        )
        if row:
            return row

    return (
        db.query(EquipProgress)
        .filter(EquipProgress.slot_code == slot)
        .order_by(EquipProgress.no.desc())
        .first()
    )


def _find_by_machine_id(db: Session, machine_id: str):
    mid = machine_id.strip()
    if not mid:
        return None
    return (
        db.query(EquipProgress)
        .filter(EquipProgress.machine_id == mid)
        .order_by(EquipProgress.no.desc())
        .first()
    )


def _latest_receipt_date(db: Session, machine_no: str) -> Optional[_date]:
    row = (
        db.query(EquipmentReceiptLog)
        .filter(EquipmentReceiptLog.machine_no == machine_no)
        .order_by(EquipmentReceiptLog.id.desc())
        .first()
    )
    return row.receive_date if row else None


# ✅ 수정: slot_code로도 되고 machine_id로도 되는 detail
@router.get("/detail", response_model=EquipmentDetailOut)
def get_equipment_detail(
    slot_code: Optional[str] = Query(None, max_length=10),
    site: str = Query("", max_length=30),
    machine_id: Optional[str] = Query(None, max_length=20),
    db: Session = Depends(get_db),
):
    site_norm = (site or "").strip()
    mid = (machine_id or "").strip()
    slot = (slot_code or "").strip().upper()

    row = None
    found_by = None

    if mid:
        row = _find_by_machine_id(db, mid)
        found_by = "machine_id"
    elif slot:
        row = _find_slot_row_relaxed(db, site=site_norm, slot_code=slot)
        found_by = "slot_code"
    else:
        raise HTTPException(
            status_code=422,
            detail="detail 조회에는 machine_id 또는 slot_code가 필요합니다.",
        )

    if not row:
        raise HTTPException(status_code=404, detail="해당 장비 데이터가 없습니다.")

    recv = None
    if row.machine_id and row.machine_id.strip():
        recv = _latest_receipt_date(db, row.machine_id.strip())

    return EquipmentDetailOut(
        row_no=row.no,
        machine_id=row.machine_id,
        shipping_date=row.shipping_date,
        receive_date=recv,
        manager=row.manager or "",
        customer=row.customer or "",
        slot_code=row.slot_code,
        site=row.site,
        serial_number=row.serial_number,
        chiller_serial_number=getattr(row, "chiller_serial_number", None),
        status=row.status,
        note=row.note,
        found_by=found_by,
    )


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
    machine_id = payload.machine_id.strip()
    slot_code = payload.slot_code.strip().upper()
    site = payload.site.strip() if payload.site else ""
    status_norm = _normalize_status(payload.status)

    target_row = _find_slot_row_strict(db, site=site, slot_code=slot_code)

    existing_machine_row = (
        db.query(EquipProgress)
        .filter(EquipProgress.machine_id == machine_id)
        .first()
    )

    if existing_machine_row:
        if not target_row or existing_machine_row.no != target_row.no:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"이미 등록된 장비 호기입니다: {machine_id} "
                    f"(현재 위치: {existing_machine_row.site or '-'} / {existing_machine_row.slot_code or '-'})"
                ),
            )

    # ── 1) UPDATE
    if target_row:
        was_empty = _is_blank(target_row.machine_id)

        target_row.machine_id = machine_id
        target_row.manager = payload.manager or ""
        target_row.shipping_date = payload.shipping_date
        target_row.customer = payload.customer or ""
        target_row.slot_code = slot_code
        target_row.site = site

        target_row.serial_number = payload.serial_number
        target_row.chiller_serial_number = payload.chiller_serial_number

        target_row.status = status_norm
        target_row.note = payload.note

        try:
            db.flush()

            _upsert_equipment_option(
                db,
                machine_id=machine_id,
                manager=payload.manager or "",
                option_codes_str=payload.option_codes_str,
            )

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
            db.refresh(target_row)
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"저장 실패: {e}")

        return EquipmentSaveResponse(mode="update", row_no=target_row.no, saved_option_count=0)

    # ── 2) INSERT
    new_row = EquipProgress(
        machine_id=machine_id,
        progress=Decimal("0.00"),
        manager=payload.manager or "",
        shipping_date=payload.shipping_date,
        customer=payload.customer or "",
        slot_code=slot_code,
        site=site,
        serial_number=payload.serial_number,
        chiller_serial_number=payload.chiller_serial_number,
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
