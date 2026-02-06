# routers.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from sqlalchemy.exc import SQLAlchemyError

from backend.db.database import get_db
from .models import SetupSheetAll, EquipProgress, EquipmentSchedule
from backend.setup.schemas import SetupSheetStepUpdate, SetupSheetStepRead
from .schemas import (
    SaveRequest,
    SaveResponse,
    RowRead,
    CommonRowRead,
    CommonUpdateRequest,
    CommonUpdateResponse,
    EquipProgressRead,
    SettingDatesRead,
)

# ─────────────────────────────────────────
# setup_sheet_all 라우터
# ─────────────────────────────────────────
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
        else:  # INSERT
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

        # ✅ 비고 저장
        row.remark = s.remark

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


@router.get("/search-common", response_model=list[CommonRowRead])
def search_common(
    machine_no: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    q = db.query(SetupSheetAll).filter(SetupSheetAll.machine_no.isnot(None))
    if machine_no:
        q = q.filter(SetupSheetAll.machine_no.ilike(f"%{machine_no}%"))

    q = (
        q.distinct(SetupSheetAll.machine_no)
        .order_by(
            SetupSheetAll.machine_no.asc(),
            SetupSheetAll.created_at.desc(),
            SetupSheetAll.id.desc(),
        )
    )
    return q.all()


@router.post("/update-common", response_model=CommonUpdateResponse)
def update_common(payload: CommonUpdateRequest, db: Session = Depends(get_db)):
    old_no = (payload.old_machine_no or "").strip()
    if not old_no:
        raise HTTPException(status_code=400, detail="old_machine_no is required")

    m = payload.meta
    new_no = (m.machine_no or "").strip() if m.machine_no else old_no

    try:
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


@router.get("/setting-dates", response_model=SettingDatesRead)
def get_setting_dates(
    machine_no: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    """
    equipment_schedule에서
    - machine_no 일치(대소문자 무시)
    - note에 SETTING/세팅 포함(앞뒤 공백/다른 문구 섞여도 OK)
    인 최신 1건의 start_date/end_date 반환
    """
    mn = machine_no.strip()
    if not mn:
        raise HTTPException(status_code=400, detail="machine_no is required")

    q = db.query(EquipmentSchedule).filter(
        func.lower(EquipmentSchedule.machine_no) == mn.lower()
    )

    note_txt = func.coalesce(EquipmentSchedule.note, "")
    q = q.filter(
        or_(
            note_txt.ilike("%SETTING%"),
            note_txt.ilike("%세팅%"),
        )
    )

    order_by_cols = []
    for col_name in ("uploaded_at", "created_at", "updated_at"):
        if hasattr(EquipmentSchedule, col_name):
            order_by_cols.append(getattr(EquipmentSchedule, col_name).desc())
            break
    if hasattr(EquipmentSchedule, "start_date"):
        order_by_cols.append(EquipmentSchedule.start_date.desc())
    if hasattr(EquipmentSchedule, "id"):
        order_by_cols.append(getattr(EquipmentSchedule, "id").desc())

    row = q.order_by(*order_by_cols).first()
    if not row:
        raise HTTPException(status_code=404, detail="setting dates not found")

    return SettingDatesRead(
        machine_no=row.machine_no,
        start_date=getattr(row, "start_date", None),
        end_date=getattr(row, "end_date", None),
    )


# ─────────────────────────────────────────
# ✅ SetupSheetAll 관리(조회/수정/삭제) 라우터
# ─────────────────────────────────────────

MANAGE_COLUMNS = [
    "id",
    "sheet_id",
    "machine_no",
    "sn",
    "chiller_sn",
    "setup_start_date",
    "setup_end_date",
    "step_name",
    "setup_hours",
    "hw_sw",
    "defect",
    "defect_type",
    "defect_detail",
    "quality_score",
    "ts_hours",
    "remark",
    "apply_text",
    "defect_group",
    "defect_location",
    "created_at",
]


class DeleteSheetReq(BaseModel):
    sheet_id: int


class DeleteStepReq(BaseModel):
    step_id: int


class UpdateStepReq(BaseModel):
    id: int
    patch: SetupSheetStepUpdate


@router.get("/manage/rows")
def manage_rows(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    machine_no: str | None = Query(None, description="장비번호(machine_no) 필터"),
    step: str | None = Query(None, description="Step 필터(=step_name)"),
    q: str | None = Query(None, description="간단 검색(머신번호/스텝/불량/비고 등)"),
    db: Session = Depends(get_db),
):
    query = db.query(SetupSheetAll)
    # ✅ 개별 필터 (프론트의 machine_no / step 필터와 연동)
    if machine_no and machine_no.strip():
        query = query.filter(SetupSheetAll.machine_no.ilike(f"%{machine_no.strip()}%"))

    if step and step.strip():
        query = query.filter(SetupSheetAll.step_name == step.strip())


    if q and q.strip():
        kw = f"%{q.strip()}%"
        query = query.filter(
            or_(
                SetupSheetAll.machine_no.ilike(kw),
                SetupSheetAll.step_name.ilike(kw),
                SetupSheetAll.defect.ilike(kw),
                SetupSheetAll.defect_type.ilike(kw),
                SetupSheetAll.defect_detail.ilike(kw),
                SetupSheetAll.defect_group.ilike(kw),
                SetupSheetAll.defect_location.ilike(kw),
                SetupSheetAll.remark.ilike(kw),
                SetupSheetAll.apply_text.ilike(kw),
                SetupSheetAll.hw_sw.ilike(kw),
                SetupSheetAll.sn.ilike(kw),
                SetupSheetAll.chiller_sn.ilike(kw),
            )
        )

    total = query.count()
    rows = (
        query.order_by(SetupSheetAll.sheet_id.desc(), SetupSheetAll.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {"columns": MANAGE_COLUMNS, "rows": rows, "total": total}


@router.get("/manage/sheet/{sheet_id}")
def manage_get_sheet(sheet_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(SetupSheetAll)
        .filter(SetupSheetAll.sheet_id == sheet_id)
        .order_by(SetupSheetAll.id.asc())
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="sheet not found")
    return {
        "sheet_id": sheet_id,
        "columns": MANAGE_COLUMNS,
        "rows": rows,
        "total": len(rows),
    }


@router.delete("/manage/sheet/{sheet_id}")
def manage_delete_sheet(sheet_id: int, db: Session = Depends(get_db)):
    deleted = (
        db.query(SetupSheetAll)
        .filter(SetupSheetAll.sheet_id == sheet_id)
        .delete(synchronize_session=False)
    )
    db.commit()
    if deleted == 0:
        raise HTTPException(status_code=404, detail="sheet not found")
    return {"ok": True, "deleted": deleted, "sheet_id": sheet_id}


@router.post("/manage/delete-sheet")
def manage_delete_sheet_post(body: DeleteSheetReq, db: Session = Depends(get_db)):
    return manage_delete_sheet(sheet_id=body.sheet_id, db=db)


@router.delete("/manage/step/{step_id}")
def manage_delete_step(step_id: int, db: Session = Depends(get_db)):
    row = db.query(SetupSheetAll).filter(SetupSheetAll.id == step_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="step not found")
    db.delete(row)
    db.commit()
    return {"ok": True, "deleted": 1, "step_id": step_id}


@router.post("/manage/delete-step")
def manage_delete_step_post(body: DeleteStepReq, db: Session = Depends(get_db)):
    return manage_delete_step(step_id=body.step_id, db=db)


# ✅ (중요) 수정 라우트: prefix 중복 문제를 피하려면 /manage/step/{step_id} 여야 함
@router.put("/manage/step/{step_id}", response_model=SetupSheetStepRead)
def update_step(step_id: int, payload: SetupSheetStepUpdate, db: Session = Depends(get_db)):
    row = db.query(SetupSheetAll).filter(SetupSheetAll.id == step_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="step not found")

    data = payload.model_dump(exclude_unset=True)

    for k, v in data.items():
        if not hasattr(row, k):
            continue
        setattr(row, k, v)

    db.commit()
    db.refresh(row)
    return row


# ✅ 프론트 fallback 대응: POST /manage/update-step
@router.post("/manage/update-step", response_model=SetupSheetStepRead)
def update_step_post(body: UpdateStepReq, db: Session = Depends(get_db)):
    return update_step(step_id=body.id, payload=body.patch, db=db)


@router.delete("/{id}", status_code=204)
def delete_setup_row(id: int, db: Session = Depends(get_db)):
    row = db.query(SetupSheetAll).filter(SetupSheetAll.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="row not found")
    db.delete(row)
    db.commit()
    return None


# ─────────────────────────────────────────
# ✅ equip_progress 라우터 (재사용 모델 EquipProgress)
# ─────────────────────────────────────────
equip_router = APIRouter(prefix="/equip-progress", tags=["equip-progress"])


@equip_router.get("/by-machine", response_model=EquipProgressRead)
def get_equip_progress_by_machine(
    machine_id: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    mid = machine_id.strip()
    row = (
        db.query(EquipProgress)
        .filter(func.lower(EquipProgress.machine_id) == mid.lower())
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="equip_progress not found")
    return row
