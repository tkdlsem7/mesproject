from __future__ import annotations
from typing import Optional, List
from datetime import date, timedelta
from collections import Counter
from collections import Counter  # 🔹 추가
from collections import Counter
from typing import Optional, List
from datetime import date, timedelta, datetime
from zoneinfo import ZoneInfo
from fastapi import Body

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from backend.db.database import get_db
from . import schemas
from .models import EquipProgress, EquipmentLog, EquipmentReceiptLog, AttendanceLog

router = APIRouter(prefix="/main", tags=["main"])

CAPACITY = {"A": 60, "B": 32, "I": 8}

MODEL_PREFIX_MAP = {
    "f": "FD",
    "c": "SC",
    "d(e)": "SD(e)",
    "e(e)": "SE(e)",
    "h(e)": "SH(e)",
    "t(e)": "SLT(e)",
    "p": "SP",
    "i": "ST(e)",
    "j": "STP(e)",
}

def _aggregate_equip_rows(
    rows: list[tuple[Optional[str], Optional[float]]]
) -> dict[str, dict[str, int]]:
    status_counter: Counter[str] = Counter()
    model_counter: Counter[str] = Counter()

    for machine_id, progress in rows:
        # 1) 상태 집계
        try:
            p = float(progress or 0)
        except Exception:
            p = 0.0

        if p <= 0:
            status_counter["waiting"] += 1
        elif p >= 100:
            status_counter["done"] += 1
        else:
            status_counter["processing"] += 1

        # 2) 모델 집계 (대소문자 무시)
        if machine_id:
            prefix_raw = (machine_id.split("-")[0] or "").strip()
            key = prefix_raw.lower()              # ← 여기서 소문자로
            label = MODEL_PREFIX_MAP.get(key, prefix_raw)
            # 매핑 없으면 prefix_raw 그대로 쓰도록 fallback
            model_counter[label] += 1

    return {
        "status_counts": dict(
            (k, v) for k, v in status_counter.items() if v > 0
        ),
        "model_counts": dict(
            (k, v) for k, v in model_counter.items() if v > 0
        ),
    }


# 🔹 slot_code → A/B/I 구분용 프리픽스
BUILDING_PREFIXES = {
    "A": ["a", "b", "c", "d", "e", "f"],
    "B": ["g", "h"],
    "I": ["i"],
}

MODEL_PREFIX_MAP = {
    "F": "FD",
    "C": "SC",
    "D(e)": "SD(e)",
    "E(e)": "SE(e)",
    "H(e)": "SH(e)",
    "T(e)": "SLT(e)",
    "P": "SP",
    "I": "ST(e)",
    "J": "STP(e)",
}

# 🔹 machine_id 첫 부분 → 모델 코드 매핑
MODEL_PREFIX_MAP = {
    "F": "FD",
    "C": "SC",
    "D(e)": "SD(e)",
    "E(e)": "SE(e)",
    "H(e)": "SH(e)",
    "T(e)": "SLT(e)",
    "P": "SP",
    "I": "ST(e)",
    "J": "STP(e)",
}

def _aggregate_equip_rows(
    rows: list[tuple[Optional[str], Optional[float]]]
) -> dict[str, dict[str, int]]:
    """
    rows: (machine_id, progress) 리스트
    progress -> waiting / processing / done
    machine_id -> MODEL_PREFIX_MAP 기반 모델 카운트
    """
    status_counter: Counter[str] = Counter()
    model_counter: Counter[str] = Counter()

    for machine_id, progress in rows:
        # 1) 상태 집계
        try:
            p = float(progress or 0)
        except Exception:
            p = 0.0

        if p <= 0:
            status_counter["waiting"] += 1      # 생산 대기
        elif p >= 100:
            status_counter["done"] += 1         # 생산 완료
        else:
            status_counter["processing"] += 1   # 생산 중

        # 2) 모델 집계
        if machine_id:
            prefix = machine_id.split("-")[0].strip()
            model = MODEL_PREFIX_MAP.get(prefix)
            if model:
                model_counter[model] += 1

    return {
        "status_counts": {k: v for k, v in status_counter.items() if v > 0},
        "model_counts": {k: v for k, v in model_counter.items() if v > 0},
    }


def _count_by_prefixes(db: Session, prefixes: List[str], site: Optional[str]) -> int:
    q = db.query(func.count(EquipProgress.no))
    if site:
        q = q.filter(EquipProgress.site == site)
    cond = or_(*[EquipProgress.slot_code.ilike(f"{p}%") for p in prefixes])
    q = q.filter(cond)
    return int(q.scalar() or 0)


# 🔹 모델/상태 요약용: 해당 동(A/B/I) + 사이트에서 장비 row 가져오기
def _rows_by_prefixes(
    db: Session, prefixes: List[str], site: Optional[str]
) -> list[tuple[Optional[str], Optional[float]]]:
    q = db.query(EquipProgress.machine_id, EquipProgress.progress)
    if site:
        q = q.filter(EquipProgress.site == site)
    cond = or_(*[EquipProgress.slot_code.ilike(f"{p}%") for p in prefixes])
    q = q.filter(cond)
    return list(q.all())


# 🔹 한 동(A/B/I)에 대한 모델/상태 카운트 계산
def _build_equip_summary_for_rows(
    rows: list[tuple[Optional[str], Optional[float]]]
) -> dict:
    model_counter: Counter[str] = Counter()
    status_counter: Counter[str] = Counter()

    for machine_id, progress in rows:
        if not machine_id:
            continue

        # machine_id 예: "D(e)-11-10" → 첫 부분 "D(e)"
        prefix = machine_id.split("-")[0].strip()
        model_code = MODEL_PREFIX_MAP.get(prefix)
        if model_code:
            model_counter[model_code] += 1

        # 진행 상태: progress 기준
        p = float(progress or 0)
        if p <= 0:
            status = "waiting"   # 생산 대기
        elif p >= 100:
            status = "done"      # 생산 완료
        else:
            status = "processing"  # 생산 중
        status_counter[status] += 1

    return {
        "model_counts": dict(model_counter),
        "status_counts": dict(status_counter),
    }



@router.get("/capacity", response_model=schemas.CapacityResponse)
def capacity_summary(
    site: Optional[str] = Query(None, description="사이트 필터(예: 본사). 미지정 시 전체"),
    db: Session = Depends(get_db),
):
    used_A = _count_by_prefixes(db, BUILDING_PREFIXES["A"], site)
    used_B = _count_by_prefixes(db, BUILDING_PREFIXES["B"], site)
    used_I = _count_by_prefixes(db, BUILDING_PREFIXES["I"], site)

    return {
        "A": {
            "used": used_A,
            "capacity": CAPACITY["A"],
            "remaining": max(CAPACITY["A"] - used_A, 0),
        },
        "B": {
            "used": used_B,
            "capacity": CAPACITY["B"],
            "remaining": max(CAPACITY["B"] - used_B, 0),
        },
        "I": {
            "used": used_I,
            "capacity": CAPACITY["I"],
            "remaining": max(CAPACITY["I"] - used_I, 0),
        },
    }

@router.get("/equip-summary", response_model=schemas.EquipSummaryResponse)
def equip_summary(db: Session = Depends(get_db)):
    """
    - buildings: A동 / B동 / I라인 (사이트 구분 없이 slot_code 로만 묶음)
    - sites: 본사 / 진우리 (동 구분 없이 site 로 묶음)
    """

    def rows_for_slot_prefixes(prefixes: List[str]):
        # slot_code 가 a%, b%, c% ... 인 장비만 취득
        cond = or_(*[EquipProgress.slot_code.ilike(f"{p}%") for p in prefixes])
        q = db.query(EquipProgress.machine_id, EquipProgress.progress).filter(cond)
        return q.all()

    # 동별(A/B/I) : 전체 site 포함
    rows_A = rows_for_slot_prefixes(["a", "b", "c", "d", "e", "f"])
    rows_B = rows_for_slot_prefixes(["g", "h"])
    rows_I = rows_for_slot_prefixes(["i"])

    # 사이트별(본사 / 진우리) : 모든 동 포함
    rows_head = (
        db.query(EquipProgress.machine_id, EquipProgress.progress)
        .filter(EquipProgress.site == "본사")
        .all()
    )
    rows_jin = (
        db.query(EquipProgress.machine_id, EquipProgress.progress)
        .filter(EquipProgress.site == "진우리")
        .all()
    )

    return {
        "buildings": [
            {"name": "A동", **_aggregate_equip_rows(rows_A)},
            {"name": "B동", **_aggregate_equip_rows(rows_B)},
            {"name": "I라인", **_aggregate_equip_rows(rows_I)},
        ],
        "sites": [
            {"name": "본사", **_aggregate_equip_rows(rows_head)},
            {"name": "진우리", **_aggregate_equip_rows(rows_jin)},
        ],
    }


# 🔹 신규: 동/사이트별 모델/상태 요약
@router.get("/equip-summary", response_model=schemas.EquipSummary)
def equip_summary(
    site: Optional[str] = Query(None, description="사이트 필터(예: 본사, 진우리 등)"),
    db: Session = Depends(get_db),
):
    rows_A = _rows_by_prefixes(db, BUILDING_PREFIXES["A"], site)
    rows_B = _rows_by_prefixes(db, BUILDING_PREFIXES["B"], site)
    rows_I = _rows_by_prefixes(db, BUILDING_PREFIXES["I"], site)

    return {
        "A": _build_equip_summary_for_rows(rows_A),
        "B": _build_equip_summary_for_rows(rows_B),
        "I": _build_equip_summary_for_rows(rows_I),
    }


# ✅ 오늘/3일 이내 출하 요약 (shipping_date 기준, 오늘 포함 3일)
@router.get("/ship-summary", response_model=schemas.ShipSummary)
def ship_summary(
    site: Optional[str] = Query(None, description="사이트 필터(예: 본사). 미지정 시 전체"),
    db: Session = Depends(get_db),
):
    today = date.today()
    end = today + timedelta(days=3)

    q1 = db.query(func.count(EquipProgress.no))
    if site:
        q1 = q1.filter(EquipProgress.site == site)
    today_count = int(q1.filter(EquipProgress.shipping_date == today).scalar() or 0)

    q2 = db.query(func.count(EquipProgress.no))
    if site:
        q2 = q2.filter(EquipProgress.site == site)
    within3_count = int(
        q2.filter(EquipProgress.shipping_date.between(today, end)).scalar() or 0
    )

    return {"today": today_count, "within3": within3_count}


# ✅ 오늘 입고 수 (equipment_receipt_log.receive_date == today)
@router.get("/receipt-summary", response_model=schemas.ReceiptSummary)
def receipt_summary(
    site: str | None = Query(None, description="사이트 필터(예: 본사). 미지정 시 전체"),
    db: Session = Depends(get_db),
):
    today = date.today()
    q = db.query(func.count(EquipmentReceiptLog.id)).filter(
        EquipmentReceiptLog.receive_date == today
    )
    if site:
        q = q.filter(EquipmentReceiptLog.site == site)
    cnt = int(q.scalar() or 0)
    return {"today": cnt}


# ─────────────────────────────────────────────────────────────
# 👇 추가된 목록 API들 (메인 하단 표 3개용)
#   - 반환 스키마: schemas.RowBrief (machine_id, manager, slot_code)
# ─────────────────────────────────────────────────────────────

# --- 오늘 입고 목록 (equipment_receipt_log 기준) ---
@router.get("/receipt-today-rows", response_model=List[schemas.RowBrief])
def receipt_today_rows(
    site: Optional[str] = Query(None, description="사이트 필터(예: 본사)"),
    limit: int = Query(10, ge=1, le=200),
    db: Session = Depends(get_db),
):
    today = date.today()

    q = (
        db.query(
            EquipmentReceiptLog.machine_no,
            EquipmentReceiptLog.manager,          # 담당자: equip_progress에서 조인(없으면 None)
            EquipmentReceiptLog.slot,
        )
        .outerjoin(EquipProgress, EquipProgress.machine_id == EquipmentReceiptLog.machine_no)
        .filter(EquipmentReceiptLog.receive_date == today)
    )
    if site:
        q = q.filter(EquipmentReceiptLog.site == site)

    # 🔑 모든 filter 끝난 뒤 정렬/제한
    rows = (
        q.order_by(EquipmentReceiptLog.receive_date.desc(), EquipmentReceiptLog.id.desc())
         .limit(limit)
         .all()
    )
    return [{"machine_id": r[0], "manager": r[1], "slot_code": r[2]} for r in rows]


# --- 오늘 출하 목록 (equip_progress.shipping_date=오늘) ---
@router.get("/ship-today-rows", response_model=List[schemas.RowBrief])
def ship_today_rows(
    site: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=200),
    db: Session = Depends(get_db),
):
    today = date.today()

    q = (
        db.query(EquipProgress.machine_id, EquipProgress.manager, EquipProgress.slot_code)
        .filter(EquipProgress.shipping_date == today)
    )
    if site:
        q = q.filter(EquipProgress.site == site)

    rows = (
        q.order_by(EquipProgress.shipping_date.desc(), EquipProgress.no.desc())
         .limit(limit)
         .all()
    )
    return [{"machine_id": r[0], "manager": r[1], "slot_code": r[2]} for r in rows]


# --- 3일 이내 출하 목록 (오늘 포함: [오늘, 오늘+3]) ---
@router.get("/ship-within3-rows", response_model=List[schemas.RowBrief])
def ship_within3_rows(
    site: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=200),
    db: Session = Depends(get_db),
):
    today = date.today()
    end = today + timedelta(days=3)

    q = (
        db.query(EquipProgress.machine_id, EquipProgress.manager, EquipProgress.slot_code)
        .filter(EquipProgress.shipping_date.between(today, end))
    )
    if site:
        q = q.filter(EquipProgress.site == site)

    rows = (
        q.order_by(EquipProgress.shipping_date.desc(), EquipProgress.no.desc())
         .limit(limit)
         .all()
    )
    return [{"machine_id": r[0], "manager": r[1], "slot_code": r[2]} for r in rows]

@router.get("/equip-summary", response_model=schemas.EquipSummaryResponse)
def equip_summary(db: Session = Depends(get_db)):
    """
    - buildings: A동 / B동 / I라인 (slot_code 기준)
    - sites: 본사 / 진우리 (site 기준)
    """

    def rows_for_slot_prefixes(prefixes: List[str]):
        cond = or_(*[EquipProgress.slot_code.ilike(f"{p}%") for p in prefixes])
        q = db.query(EquipProgress.machine_id, EquipProgress.progress).filter(cond)
        return q.all()

    # 동별(A/B/I) : 전체 site 포함
    rows_A = rows_for_slot_prefixes(BUILDING_PREFIXES["A"])
    rows_B = rows_for_slot_prefixes(BUILDING_PREFIXES["B"])
    rows_I = rows_for_slot_prefixes(BUILDING_PREFIXES["I"])

    # 사이트별(본사 / 진우리) : 모든 동 포함
    rows_head = (
        db.query(EquipProgress.machine_id, EquipProgress.progress)
        .filter(EquipProgress.site == "본사")
        .all()
    )
    rows_jin = (
        db.query(EquipProgress.machine_id, EquipProgress.progress)
        .filter(EquipProgress.site == "진우리")
        .all()
    )

    return {
        "buildings": [
            {"name": "A동", **_aggregate_equip_rows(rows_A)},
            {"name": "B동", **_aggregate_equip_rows(rows_B)},
            {"name": "I라인", **_aggregate_equip_rows(rows_I)},
        ],
        "sites": [
            {"name": "본사", **_aggregate_equip_rows(rows_head)},
            {"name": "진우리", **_aggregate_equip_rows(rows_jin)},
        ],
    }


@router.post("/attendance", response_model=schemas.AttendanceLogOut)
def create_attendance_log(
    payload: schemas.AttendanceCreate = Body(...),
    db: Session = Depends(get_db),
):
    # ✅ 한국시간 기준 "오늘 00:00 ~ 내일 00:00" 범위 계산
    kst = ZoneInfo("Asia/Seoul")
    now_kst = datetime.now(kst)
    start_kst = now_kst.replace(hour=0, minute=0, second=0, microsecond=0)
    end_kst = start_kst + timedelta(days=1)

    # ✅ 같은 user의 오늘 기록은 전부 삭제 (출근/오전/오후 포함)
    db.query(AttendanceLog).filter(
        AttendanceLog.user_id == payload.user_id,
        AttendanceLog.checked_at >= start_kst,
        AttendanceLog.checked_at < end_kst,
    ).delete(synchronize_session=False)

    # ✅ 새 기록 1건 추가
    row = AttendanceLog(
        user_id=payload.user_id,
        record_type=int(payload.record_type),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row