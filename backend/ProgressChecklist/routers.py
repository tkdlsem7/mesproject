# backend/ProgressChecklist/routers.py
from __future__ import annotations

import re
from typing import List, Dict, Set, Tuple, Optional
from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.db.database import get_db

# ORM
from ..EquipmentInfo.models import EquipmentOption
from ..MainDashboard.models import EquipProgress, EquipmentProgressLog
from .models import Checklist, EquipmentChecklistResult

# Schemas
from .schemas import (
    ChecklistItemOut,
    ChecklistPageOut,
    ChecklistByMachineOut,
    SaveChecklistIn,
    SaveChecklistOut,
    SaveChecklistBatchIn,
    SaveChecklistBatchOut,
)

router = APIRouter(prefix="/progress", tags=["progress-checklist"])

_SPLIT_RE = re.compile(r"\s*(?:,|/|\||;)\s*")
_WS_RE = re.compile(r"\s+")

_KST = ZoneInfo("Asia/Seoul")


def _canon_option(opt: str) -> str:
    opt = (opt or "").strip()
    opt = _WS_RE.sub(" ", opt)
    return opt.upper()


def _split_options(raw: str) -> List[str]:
    if not raw:
        return []
    parts = (s.strip() for s in _SPLIT_RE.split(raw))
    out: List[str] = []
    seen: Set[str] = set()
    for p in parts:
        if not p:
            continue
        p2 = _canon_option(p)
        k = p2.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(p2)
    return out


def _upsert_progress(machine_id: str, progress: float, db: Session) -> None:
    row = (
        db.query(EquipProgress)
        .filter(EquipProgress.machine_id == machine_id)
        .one_or_none()
    )
    if row:
        row.progress = progress


def _recompute_machine_progress(machine_id: str, db: Session) -> float:
    opt_rows = (
        db.query(EquipmentOption.option_id)
        .filter(EquipmentOption.machine_id == machine_id)
        .all()
    )
    if not opt_rows:
        _upsert_progress(machine_id, 0.0, db)
        return 0.0

    raw = ",".join((r[0] or "") for r in opt_rows)
    opts = _split_options(raw)
    if not opts:
        _upsert_progress(machine_id, 0.0, db)
        return 0.0

    res_rows = (
        db.query(EquipmentChecklistResult.option, EquipmentChecklistResult.checked_steps)
        .filter(EquipmentChecklistResult.machine_id == machine_id)
        .all()
    )
    saved_map: Dict[str, List[int]] = {
        (opt or "").lower(): (steps or []) for opt, steps in res_rows
    }

    grand_total = 0.0
    done_total = 0.0

    for opt in opts:
        key = opt.lower()
        items = (
            db.query(Checklist.no, Checklist.hours)
            .filter(func.lower(Checklist.option) == key)
            .all()
        )
        if not items:
            continue

        total_hours = sum(float(h) for _, h in items)
        grand_total += total_hours

        saved = set(saved_map.get(key, []) or [])
        if saved:
            done_hours = sum(float(h) for no, h in items if no in saved)
            done_total += done_hours

    progress = round((done_total / grand_total * 100.0), 2) if grand_total > 0 else 0.0
    _upsert_progress(machine_id, progress, db)
    return progress


def _as_log_datetime(d: Optional[date]) -> Optional[datetime]:
    """
    date(YYYY-MM-DD)만 들어오면 KST 기준으로 해당 날짜 12:00로 기록.
    (timestamptz 변환 시 날짜가 어긋나는 케이스를 줄이기 위해 정오로 설정)
    """
    if not d:
        return None
    return datetime(d.year, d.month, d.day, 12, 0, 0, tzinfo=_KST)


def _log_progress_update(machine_id: str, progress: float, db: Session, log_date: Optional[date] = None) -> None:
    """
    저장 성공 시 equipment_progress_log에 한 줄 기록.
    manager는 equip_progress.manager 우선, 없으면 'system'.
    ✅ log_date가 오면 updated_at을 그 날짜로 기록.
    """
    mgr = (
        db.query(EquipProgress.manager)
        .filter(EquipProgress.machine_id == machine_id)
        .scalar()
    ) or "system"

    dt = _as_log_datetime(log_date)

    if dt is None:
        db.add(EquipmentProgressLog(machine_no=machine_id, manager=mgr, progress=progress))
    else:
        db.add(EquipmentProgressLog(machine_no=machine_id, manager=mgr, progress=progress, updated_at=dt))


# ------------------------- 조회 -------------------------

@router.get("/checklist/{machine_id}", response_model=ChecklistByMachineOut)
def get_checklist_by_machine(machine_id: str, db: Session = Depends(get_db)):
    rows = (
        db.query(EquipmentOption.option_id)
        .filter(EquipmentOption.machine_id == machine_id)
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="equipment_option not found for machine")

    raw = ",".join((r[0] or "") for r in rows)
    opt_list = _split_options(raw)
    if not opt_list:
        return ChecklistByMachineOut(machine_id=machine_id, options=[], pages=[])

    pages: List[ChecklistPageOut] = []

    for opt in opt_list:
        key = opt.lower()
        items = (
            db.query(Checklist)
            .filter(func.lower(Checklist.option) == key)
            .order_by(Checklist.step.asc(), Checklist.no.asc())
            .all()
        )

        saved = (
            db.query(EquipmentChecklistResult.checked_steps)
            .filter(
                EquipmentChecklistResult.machine_id == machine_id,
                func.lower(EquipmentChecklistResult.option) == key,
            )
            .order_by(EquipmentChecklistResult.updated_at.desc(), EquipmentChecklistResult.no.desc())
            .first()
        )
        checked_steps = list(saved[0]) if saved and saved[0] else []

        total_hours = float(sum(float(it.hours) for it in items)) if items else 0.0
        items_out = [
            ChecklistItemOut(
                no=it.no,
                step=it.step,
                item=it.item,
                hours=float(it.hours),
                percent=round((float(it.hours) / total_hours * 100.0), 1) if total_hours > 0 else 0.0,
            )
            for it in items
        ]

        pages.append(
            ChecklistPageOut(
                option=opt,
                total_hours=round(total_hours, 1),
                item_count=len(items_out),
                items=items_out,
                checked_steps=checked_steps,
            )
        )

    return ChecklistByMachineOut(
        machine_id=machine_id,
        options=[p.option for p in pages],
        pages=pages,
    )


# ------------------------- 저장(단건, 호환용) -------------------------

@router.post("/checklist/result", response_model=SaveChecklistOut)
def save_checklist_result(payload: SaveChecklistIn, db: Session = Depends(get_db)):
    machine_id = (payload.machine_id or "").strip()
    opt = _canon_option(payload.option)

    steps = sorted(set(int(x) for x in (payload.checked_steps or [])))

    valid_nos = {
        n for (n,) in db.query(Checklist.no)
        .filter(func.lower(Checklist.option) == opt.lower())
        .all()
    }
    steps = [n for n in steps if n in valid_nos]

    existing_rows = (
        db.query(EquipmentChecklistResult)
        .filter(
            EquipmentChecklistResult.machine_id == machine_id,
            func.lower(EquipmentChecklistResult.option) == opt.lower(),
        )
        .order_by(EquipmentChecklistResult.updated_at.desc(), EquipmentChecklistResult.no.desc())
        .all()
    )

    if existing_rows:
        row = existing_rows[0]
        row.option = opt
        row.checked_steps = steps
        if len(existing_rows) > 1:
            dup_ids = [r.no for r in existing_rows[1:]]
            db.query(EquipmentChecklistResult) \
              .filter(EquipmentChecklistResult.no.in_(dup_ids)) \
              .delete(synchronize_session=False)
    else:
        db.add(EquipmentChecklistResult(
            machine_id=machine_id,
            option=opt,
            checked_steps=steps,
        ))

    prog = _recompute_machine_progress(machine_id, db)
    _log_progress_update(machine_id, prog, db, payload.log_date)

    db.commit()
    return SaveChecklistOut(ok=True)


# ------------------------- 저장(배치, 추천) -------------------------

@router.post("/checklist/result/batch", response_model=SaveChecklistBatchOut)
def save_checklist_result_batch(payload: SaveChecklistBatchIn, db: Session = Depends(get_db)):
    machine_id = (payload.machine_id or "").strip()

    valid_cache: Dict[str, Set[int]] = {}
    merged_steps: Dict[str, Set[int]] = {}

    def get_valid_nos(opt_lower: str) -> Set[int]:
        if opt_lower in valid_cache:
            return valid_cache[opt_lower]
        nos = {
            n for (n,) in db.query(Checklist.no)
            .filter(func.lower(Checklist.option) == opt_lower)
            .all()
        }
        valid_cache[opt_lower] = nos
        return nos

    for item in (payload.items or []):
        opt = _canon_option(item.option)
        key = opt.lower()
        valid = get_valid_nos(key)

        cleaned = {int(x) for x in (item.checked_steps or [])}
        cleaned = {n for n in cleaned if n in valid}

        merged_steps.setdefault(opt, set()).update(cleaned)

    db.query(EquipmentChecklistResult) \
      .filter(EquipmentChecklistResult.machine_id == machine_id) \
      .delete(synchronize_session=False)

    new_rows: List[EquipmentChecklistResult] = []
    for opt, steps_set in merged_steps.items():
        new_rows.append(EquipmentChecklistResult(
            machine_id=machine_id,
            option=opt,
            checked_steps=sorted(steps_set),
        ))

    if new_rows:
        db.add_all(new_rows)

    db.flush()
    prog = _recompute_machine_progress(machine_id, db)
    _log_progress_update(machine_id, prog, db, payload.log_date)

    db.commit()
    return SaveChecklistBatchOut(ok=True, saved=len(new_rows))
