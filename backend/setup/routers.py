# routers.py
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError

from backend.db.database import get_db
from .models import SetupSheetAll
from .schemas import (
    SaveRequest, SaveResponse, RowRead,
    CommonRowRead, CommonUpdateRequest, CommonUpdateResponse
)

router = APIRouter(prefix="/setup-sheets", tags=["setup-sheets"])

def _next_sheet_id(db: Session) -> int:
    max_id = db.query(func.coalesce(func.max(SetupSheetAll.sheet_id), 0)).scalar() or 0
    return int(max_id + 1)

@router.post("/save", response_model=SaveResponse)
def save_setup_sheet(payload: SaveRequest, db: Session = Depends(get_db)):
    sheet_id = payload.sheetId if payload.sheetId is not None else _next_sheet_id(db)
    s = payload.step

    try:
        if s.id:  # UPDATE
            row = db.query(SetupSheetAll).filter(SetupSheetAll.id == s.id).first()
            if not row:
                raise HTTPException(status_code=404, detail="row not found")
            if row.sheet_id != sheet_id:
                raise HTTPException(status_code=400, detail="sheetId mismatch")
        else:     # INSERT
            row = SetupSheetAll(sheet_id=sheet_id, step_name=s.step_name)
            db.add(row)
            db.flush()  # row.id 확보

        m = payload.meta
        row.machine_no = m.machine_no
        row.sn = m.sn
        row.chiller_sn = m.chiller_sn
        row.setup_start_date = m.setup_start_date
        row.setup_end_date = m.setup_end_date

        row.step_name = s.step_name
        row.setup_hours = s.setup_hours
        row.defect_detail = s.defect_detail
        row.quality_score = s.quality_score
        row.ts_hours = s.ts_hours

        row.hw_sw = s.hw_sw
        row.defect = s.defect
        row.defect_type = s.defect_type
        row.defect_group = s.defect_group
        row.defect_location = s.defect_location

        db.commit()
        return SaveResponse(sheetId=sheet_id, stepId=int(row.id))

    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"DB error: {e.__class__.__name__}")

@router.get("/search", response_model=list[RowRead])
def search_setup_sheets(
    sheet_id: int | None = Query(default=None),
    machine_no: str | None = Query(default=None),
    step_name: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    q = db.query(SetupSheetAll)
    if sheet_id is not None:
        q = q.filter(SetupSheetAll.sheet_id == sheet_id)
    if machine_no:
        q = q.filter(SetupSheetAll.machine_no.ilike(f"%{machine_no}%"))
    if step_name:
        q = q.filter(SetupSheetAll.step_name == step_name)

    return q.order_by(SetupSheetAll.sheet_id.asc(), SetupSheetAll.id.asc()).all()

# ✅ 공통사항 조회: 호기(machine_no)별로 대표 1건만
@router.get("/search-common", response_model=list[CommonRowRead])
def search_common(
    machine_no: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    q = db.query(SetupSheetAll).filter(SetupSheetAll.machine_no.isnot(None))
    if machine_no:
        q = q.filter(SetupSheetAll.machine_no.ilike(f"%{machine_no}%"))

    # Postgres: DISTINCT ON(machine_no) 효과
    q = (
        q.distinct(SetupSheetAll.machine_no)
         .order_by(
            SetupSheetAll.machine_no.asc(),
            SetupSheetAll.created_at.desc(),
            SetupSheetAll.id.desc(),
         )
    )
    return q.all()

# ✅ 공통사항 일괄 수정: old_machine_no 기준으로 전체 row 업데이트(호기 변경 포함)
@router.post("/update-common", response_model=CommonUpdateResponse)
def update_common(payload: CommonUpdateRequest, db: Session = Depends(get_db)):
    old_no = (payload.old_machine_no or "").strip()
    if not old_no:
        raise HTTPException(status_code=400, detail="old_machine_no is required")

    m = payload.meta
    # 새 호기값(없으면 기존 유지)
    new_no = (m.machine_no or "").strip() if m.machine_no else old_no

    try:
        # 대소문자 차이까지 안전하게 매칭(예: J-11-10 vs j-11-10)
        cond = func.lower(SetupSheetAll.machine_no) == old_no.lower()

        updated = (
            db.query(SetupSheetAll)
              .filter(cond)
              .update(
                  {
                      SetupSheetAll.machine_no: new_no,
                      SetupSheetAll.sn: m.sn,
                      SetupSheetAll.chiller_sn: m.chiller_sn,
                      SetupSheetAll.setup_start_date: m.setup_start_date,
                      SetupSheetAll.setup_end_date: m.setup_end_date,
                  },
                  synchronize_session=False,
              )
        )

        if updated == 0:
            raise HTTPException(status_code=404, detail="no rows matched old_machine_no")

        db.commit()
        return CommonUpdateResponse(updated=int(updated))

    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"DB error: {e.__class__.__name__}")

@router.delete("/{id}", status_code=204)
def delete_setup_row(id: int, db: Session = Depends(get_db)):
    row = db.query(SetupSheetAll).filter(SetupSheetAll.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="row not found")
    db.delete(row)
    db.commit()
    return None
