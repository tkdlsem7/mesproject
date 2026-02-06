from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from backend.db.database import get_db
from .models import DefectCatalog
from .schemas import DefectCatalogUpsert, DefectCatalogRead

router = APIRouter(prefix="/defect-catalog", tags=["defect-catalog"])


def _normalize_types(v) -> list[str]:
    """
    DB가 text[]면 list로 들어오고,
    혹시라도 문자열로 들어오는 케이스까지 같이 방어.
    """
    if v is None:
        raw = []
    elif isinstance(v, (list, tuple)):
        raw = list(v)
    else:
        raw = str(v).split(",")

    out: list[str] = []
    seen = set()
    for x in raw:
        s = str(x).strip()
        if not s:
            continue
        if s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out


@router.get("", response_model=list[DefectCatalogRead])
def list_all(db: Session = Depends(get_db)):
    rows = db.query(DefectCatalog).order_by(DefectCatalog.defect.asc()).all()
    return [
        DefectCatalogRead(
            id=r.id,
            defect=r.defect,
            defect_types=_normalize_types(r.defect_types),
        )
        for r in rows
    ]


@router.post("", response_model=DefectCatalogRead)
def create_one(payload: DefectCatalogUpsert, db: Session = Depends(get_db)):
    row = DefectCatalog(
        defect=payload.defect.strip(),
        defect_types=_normalize_types(payload.defect_types),  # ✅ list 저장
    )
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="이미 존재하는 불량명입니다.")

    return DefectCatalogRead(
        id=row.id,
        defect=row.defect,
        defect_types=_normalize_types(row.defect_types),
    )


@router.put("/{id}", response_model=DefectCatalogRead)
def update_one(id: int, payload: DefectCatalogUpsert, db: Session = Depends(get_db)):
    row = db.query(DefectCatalog).filter(DefectCatalog.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="항목을 찾을 수 없습니다.")

    row.defect = payload.defect.strip()
    row.defect_types = _normalize_types(payload.defect_types)  # ✅ list 저장

    try:
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="이미 존재하는 불량명입니다.")

    return DefectCatalogRead(
        id=row.id,
        defect=row.defect,
        defect_types=_normalize_types(row.defect_types),
    )


@router.delete("/{id}", status_code=204)
def delete_one(id: int, db: Session = Depends(get_db)):
    row = db.query(DefectCatalog).filter(DefectCatalog.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="항목을 찾을 수 없습니다.")
    db.delete(row)
    db.commit()
    return None
