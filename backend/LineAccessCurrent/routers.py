# backend/LineAccessCurrent/routers.py
from __future__ import annotations

import logging
from datetime import datetime, timezone, date, time, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.db.database import get_db
from .models import LineAccessCurrent, LineAccessLog
from . import schemas

router = APIRouter(prefix="/main/line-access", tags=["line-access"])
log = logging.getLogger("uvicorn.error")


# ─────────────────────────────────────────────────────────────
# util: 날짜 범위 (KST 기준으로 필터링하기 위해 timezone() 사용)
# - 프론트의 <input type="date"> 값은 YYYY-MM-DD
# - KST 기준 [from 00:00, to+1 00:00) 형태로 필터
# ─────────────────────────────────────────────────────────────
def _date_range_kst(from_s: Optional[str], to_s: Optional[str]):
    start = None
    end = None
    if from_s:
        fd = date.fromisoformat(from_s)
        start = datetime.combine(fd, time.min)  # naive (KST 기준)
    if to_s:
        td = date.fromisoformat(to_s) + timedelta(days=1)
        end = datetime.combine(td, time.min)    # naive (KST 기준)
    return start, end


# ─────────────────────────────────────────────────────────────
# 직원 검색 API
# - /api/main/line-access/employees?dept=...&q=...&limit=...
# - users 테이블에서 dept 필터 + 이름 일부 검색
# ─────────────────────────────────────────────────────────────
@router.get("/employees", response_model=List[schemas.EmployeeOut])
def get_employees(
    dept: Optional[str] = Query(None, description="예: 시스템생산팀"),
    q: Optional[str] = Query(None, description="이름 일부 검색"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    if not dept and not q:
        raise HTTPException(status_code=400, detail="dept 또는 q 중 하나는 필요합니다.")

    sql = """
        SELECT id, name, dept
        FROM users
        WHERE 1=1
    """
    params = {"limit": limit}

    if dept:
        sql += " AND dept = :dept"
        params["dept"] = dept

    if q:
        sql += " AND name ILIKE :q"
        params["q"] = f"%{q}%"

    sql += " ORDER BY name ASC LIMIT :limit"

    try:
        rows = db.execute(text(sql), params).mappings().all()
        return [schemas.EmployeeOut(**dict(r)) for r in rows]
    except Exception:
        log.exception("line-access employees query failed")
        raise HTTPException(status_code=500, detail="직원 목록 조회 실패")


# ─────────────────────────────────────────────────────────────
# 현재 출입 현황 조회
# - /api/main/line-access/current?site=...&building=...
# ─────────────────────────────────────────────────────────────
@router.get("/current", response_model=List[schemas.LineAccessCurrentOut])
def get_current(
    site: Optional[str] = Query(None),
    building: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    try:
        q = db.query(LineAccessCurrent)
        if site:
            q = q.filter(LineAccessCurrent.site == site)
        if building:
            q = q.filter(LineAccessCurrent.building == building)

        rows = q.order_by(LineAccessCurrent.entered_at.desc(), LineAccessCurrent.id.desc()).all()
        return rows
    except Exception:
        log.exception("line-access current query failed")
        raise HTTPException(status_code=500, detail="현재 출입 현황 조회 실패")


# ─────────────────────────────────────────────────────────────
# 로그 조회
# - /api/main/line-access/logs?from=YYYY-MM-DD&to=YYYY-MM-DD&...
# - KST 기준 날짜 필터 지원 (occurred_at)
# ─────────────────────────────────────────────────────────────
@router.get("/logs", response_model=List[schemas.LineAccessLogOut])
def get_logs(
    from_date: Optional[str] = Query(None, alias="from", description="YYYY-MM-DD"),
    to_date: Optional[str] = Query(None, alias="to", description="YYYY-MM-DD"),
    site: Optional[str] = Query(None),
    building: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None, description="ENTER 또는 EXIT"),
    name: Optional[str] = Query(None, description="이름 일부 검색"),
    dept_or_company: Optional[str] = Query(None, description="부서/업체명 일부 검색"),
    memo: Optional[str] = Query(None, description="비고 일부 검색"),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    try:
        q = db.query(LineAccessLog)

        # 날짜(기간) 필터: KST 기준
        start_kst, end_kst = _date_range_kst(from_date, to_date)
        kst_ts = func.timezone("Asia/Seoul", LineAccessLog.occurred_at)

        if start_kst:
            q = q.filter(kst_ts >= start_kst)
        if end_kst:
            q = q.filter(kst_ts < end_kst)

        if site:
            q = q.filter(LineAccessLog.site == site)
        if building:
            q = q.filter(LineAccessLog.building == building)

        if event_type:
            if event_type not in ("ENTER", "EXIT"):
                raise HTTPException(status_code=400, detail="event_type은 ENTER 또는 EXIT만 허용")
            q = q.filter(LineAccessLog.event_type == event_type)

        if name:
            q = q.filter(LineAccessLog.name.ilike(f"%{name}%"))

        if dept_or_company:
            q = q.filter(LineAccessLog.dept_or_company.ilike(f"%{dept_or_company}%"))

        if memo:
            q = q.filter(func.coalesce(LineAccessLog.memo, "").ilike(f"%{memo}%"))

        rows = (
            q.order_by(LineAccessLog.occurred_at.desc(), LineAccessLog.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return rows

    except HTTPException:
        raise
    except Exception:
        log.exception("line-access logs query failed")
        raise HTTPException(status_code=500, detail="로그 조회 실패")


# ─────────────────────────────────────────────────────────────
# 입실 등록
# - current upsert + logs INSERT(ENTER)
# - entered_at / occurred_at 는 UTC now()를 강제로 넣어서 NOT NULL 방지
# ─────────────────────────────────────────────────────────────
@router.post("/enter")
def enter(payload: schemas.LineAccessEnterIn, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)

    key_cond = and_(
        LineAccessCurrent.person_type == payload.person_type,
        LineAccessCurrent.person_key == payload.person_key,
    )

    try:
        row = db.query(LineAccessCurrent).filter(key_cond).one_or_none()

        if row:
            row.name = payload.name
            row.dept_or_company = payload.dept_or_company
            row.site = payload.site
            row.building = payload.building
            row.memo = payload.memo
            row.entered_at = now  # ✅ NOT NULL 보장
        else:
            row = LineAccessCurrent(
                person_type=payload.person_type,
                person_key=payload.person_key,
                name=payload.name,
                dept_or_company=payload.dept_or_company,
                site=payload.site,
                building=payload.building,
                memo=payload.memo,
                entered_at=now,  # ✅ NOT NULL 보장
            )
            db.add(row)

        # ✅ 로그 기록 (ENTER)
        db.add(
            LineAccessLog(
                person_type=payload.person_type,
                person_key=payload.person_key,
                name=payload.name,
                dept_or_company=payload.dept_or_company,
                site=payload.site,
                building=payload.building,
                event_type="ENTER",
                occurred_at=now,  # ✅ NOT NULL 보장
                memo=payload.memo,
            )
        )

        db.commit()
        return {"ok": True}

    except IntegrityError:
        db.rollback()
        log.exception("line-access ENTER IntegrityError")
        # 중복/NOT NULL/FK/unique 등
        raise HTTPException(status_code=409, detail="DB 제약조건 오류(중복/NOT NULL/FK 등)")

    except Exception:
        db.rollback()
        log.exception("line-access ENTER failed")
        raise HTTPException(status_code=500, detail="입실 처리 중 서버 오류")


# ─────────────────────────────────────────────────────────────
# 퇴실 처리
# - current DELETE + logs INSERT(EXIT)
# ─────────────────────────────────────────────────────────────
@router.post("/exit")
def exit_current(payload: schemas.LineAccessExitIn, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)

    key_cond = and_(
        LineAccessCurrent.person_type == payload.person_type,
        LineAccessCurrent.person_key == payload.person_key,
    )

    try:
        row = db.query(LineAccessCurrent).filter(key_cond).one_or_none()
        if not row:
            return {"ok": True, "deleted": 0}

        # ✅ 로그 기록 (EXIT)
        db.add(
            LineAccessLog(
                person_type=row.person_type,
                person_key=row.person_key,
                name=row.name,
                dept_or_company=row.dept_or_company,
                site=row.site,
                building=row.building,
                event_type="EXIT",
                occurred_at=now,  # ✅ NOT NULL 보장
                memo=row.memo,
            )
        )

        db.delete(row)
        db.commit()
        return {"ok": True, "deleted": 1}

    except IntegrityError:
        db.rollback()
        log.exception("line-access EXIT IntegrityError")
        raise HTTPException(status_code=409, detail="DB 제약조건 오류")

    except Exception:
        db.rollback()
        log.exception("line-access EXIT failed")
        raise HTTPException(status_code=500, detail="퇴실 처리 중 서버 오류")
