# backend/Attendance_history/routers.py
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Optional, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db.database import get_db
from . import schemas

router = APIRouter(prefix="/attendance", tags=["attendance"])


def _parse_q(q: Optional[str]) -> tuple[Optional[int], Optional[str]]:
    raw = (q or "").strip()
    if not raw:
        return None, None

    tokens = raw.split()
    token_set = set(tokens)

    record_type: Optional[int] = None
    remove_idx: set[int] = set()

    def norm(s: str) -> str:
        return s.replace(" ", "")

    if "오전" in token_set and "출근" in token_set:
        record_type = 2
        for i, t in enumerate(tokens):
            if t in ("오전", "출근"):
                remove_idx.add(i)
    elif "오후" in token_set and "출근" in token_set:
        record_type = 3
        for i, t in enumerate(tokens):
            if t in ("오후", "출근"):
                remove_idx.add(i)
    else:
        for i, t in enumerate(tokens):
            t0 = norm(t)
            if t0 in ("출근", "1"):
                record_type = 1
                remove_idx.add(i)
            elif t0 in ("오전", "오전출근", "2"):
                record_type = 2
                remove_idx.add(i)
            elif t0 in ("오후", "오후출근", "3"):
                record_type = 3
                remove_idx.add(i)

    remain = [t for i, t in enumerate(tokens) if i not in remove_idx]
    keyword = " ".join(remain).strip() or None
    return record_type, keyword


SortType = Literal["time_desc", "time_asc", "name_asc", "id_asc"]


@router.get("/logs", response_model=schemas.AttendanceLogsResponse)
def list_attendance_logs(
    # ✅ 기존: day(단일 날짜)
    day: Optional[date] = Query(None, description="조회 날짜 (YYYY-MM-DD). 미지정 시 오늘"),
    # ✅ 추가: 기간 조회
    from_date: Optional[date] = Query(None, description="조회 시작일 (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="조회 종료일 (YYYY-MM-DD)"),
    # ✅ 추가: 팀 필터(조직도 선택용)
    dept: Optional[str] = Query(None, description="팀(부서) 필터. ILIKE 포함 검색"),
    # ✅ 기존: 통합 검색(q)
    q: Optional[str] = Query(None, description="팀/이름/ID + 기록(출근/오전/오후/1/2/3) 통합 검색"),
    # ✅ 추가: 정렬
    sort: SortType = Query("time_desc", description="정렬: time_desc/time_asc/name_asc/id_asc"),
    limit: int = Query(500, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    kst = ZoneInfo("Asia/Seoul")

    # 1) 기간 확정
    if from_date or to_date:
        if from_date is None:
            from_date = to_date
        if to_date is None:
            to_date = from_date
        assert from_date is not None and to_date is not None
        start_day = from_date
        end_day = to_date
        # day는 "대표값"으로만 내려줌(기존 호환)
        day_value: Optional[date] = from_date
    else:
        if day is None:
            day = datetime.now(kst).date()
        start_day = day
        end_day = day
        day_value = day

    start_kst = datetime.combine(start_day, time.min, tzinfo=kst)
    end_kst = datetime.combine(end_day, time.min, tzinfo=kst) + timedelta(days=1)

    # 2) q 파싱(기록타입/키워드)
    record_type_filter, keyword = _parse_q(q)
    kw_like = f"%{keyword}%" if keyword else None

    # 3) 팀 필터
    dept_like = f"%{dept}%" if dept else None

    stmt = text("""
        SELECT
            al.no,
            al.user_id,
            u.name AS user_name,
            u.dept AS dept,
            al.record_type,
            CASE al.record_type
                WHEN 1 THEN '출근'
                WHEN 2 THEN '오전 출근'
                WHEN 3 THEN '오후 출근'
                ELSE CAST(al.record_type AS TEXT)
            END AS record_label,
            al.checked_at
        FROM attendance_logs al
        LEFT JOIN users u ON u.id = al.user_id
        WHERE al.checked_at >= :start_kst
          AND al.checked_at <  :end_kst
          AND (:rt IS NULL OR al.record_type = :rt)
          AND (
              :kw_like IS NULL
              OR COALESCE(u.dept, '') ILIKE :kw_like
              OR COALESCE(u.name, '') ILIKE :kw_like
              OR al.user_id ILIKE :kw_like
          )
          AND (
              :dept_like IS NULL
              OR COALESCE(u.dept, '') ILIKE :dept_like
          )
        ORDER BY al.checked_at DESC
        LIMIT :limit
    """)

    rows = db.execute(
        stmt,
        {
            "start_kst": start_kst,
            "end_kst": end_kst,
            "rt": record_type_filter,
            "kw_like": kw_like,
            "dept_like": dept_like,
            "limit": limit,
        },
    ).mappings().all()

    items = [schemas.AttendanceLogRow(**dict(r)) for r in rows]

    # 4) 정렬(프론트 드롭다운)
    if sort == "time_asc":
        items.sort(key=lambda x: x.checked_at)
    elif sort == "name_asc":
        items.sort(key=lambda x: (x.user_name or "", x.user_id))
    elif sort == "id_asc":
        items.sort(key=lambda x: x.user_id)
    # time_desc는 이미 SQL에서 최신순

    return {
        "day": day_value,
        "from_date": start_day,
        "to_date": end_day,
        "items": items,
    }

@router.get("/summary/dept", response_model=schemas.DeptAttendanceSummaryResponse)
def dept_attendance_summary(
    day: date = Query(..., description="기준일(YYYY-MM-DD)"),
    db: Session = Depends(get_db),
):
    kst = ZoneInfo("Asia/Seoul")
    start_kst = datetime.combine(day, time.min, tzinfo=kst)
    end_kst = start_kst + timedelta(days=1)

    # ✅ 화면에 쓰는 4개 팀만 집계
    depts = ["시스템생산실", "통합생산실", "생산물류팀", "파트생산팀"]

    stmt = text("""
        SELECT
            u.dept AS dept,
            COUNT(DISTINCT al.user_id) AS present
        FROM attendance_logs al
        JOIN users u ON u.id = al.user_id
        WHERE al.checked_at >= :start_kst
          AND al.checked_at <  :end_kst
          AND al.record_type IN (1,2,3)
          AND u.dept IN ('시스템생산실','통합생산실','생산물류팀','파트생산팀')
        GROUP BY u.dept
    """)

    rows = db.execute(stmt, {"start_kst": start_kst, "end_kst": end_kst}).mappings().all()
    present_map = {r["dept"]: int(r["present"] or 0) for r in rows}

    items = [{"dept": d, "present": present_map.get(d, 0)} for d in depts]
    return {"day": day, "items": items}

@router.get("/roster", response_model=schemas.AttendanceRosterResponse)
def get_roster(
    db: Session = Depends(get_db),
):
    # 생산본부 4팀만 고정
    depts = ["시스템생산실", "통합생산실", "생산물류팀", "파트생산팀"]

    params = {}
    ph = []
    for i, d in enumerate(depts):
        k = f"d{i}"
        ph.append(f":{k}")
        params[k] = d

    stmt = text(f"""
        SELECT
            u.id   AS user_id,
            u.name AS user_name,
            u.dept AS dept
        FROM users u
        WHERE u.dept IN ({",".join(ph)})
        ORDER BY u.dept, u.name
    """)

    rows = db.execute(stmt, params).mappings().all()
    return {"items": [schemas.DeptUserRow(**dict(r)) for r in rows]}