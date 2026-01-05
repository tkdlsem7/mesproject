# backend/LogBrowser/routers.py
from datetime import date, datetime
from typing import List, Optional, Dict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import inspect, MetaData, Table, select, or_, and_, func, String

from backend.deps import get_db
from .schemas import (
    TableMeta,
    RowsResponse,
    LeadTimeRequest,
    LeadTimeResponse,
    LeadTimeItem,
)

router = APIRouter(prefix="/logs", tags=["LogBrowser"])

# 날짜 컬럼 후보 (필터/정렬에 사용)
DATE_CANDIDATES = [
    "updated_at",
    "created_at",
    "moved_at",
    "receive_date",   # equipment_receipt_log
    "receipt_date",   # 혹시 옛날 컬럼명 대비
    "shipped_date",   # equipment_shipment_log
    "shipping_date",
    "logged_at",
    "timestamp",
]


def _insp(db: Session):
    return inspect(db.bind)


def _reflect(db: Session, schema: str, name: str) -> Table:
    md = MetaData()
    return Table(name, md, autoload_with=db.bind, schema=schema)


@router.get("/tables", response_model=List[TableMeta])
def list_tables(
    schema: str = Query("public", description="스키마명 (기본: public)"),
    db: Session = Depends(get_db),
):
    insp = _insp(db)
    table_names = set(insp.get_table_names(schema=schema))
    view_names = set(insp.get_view_names(schema=schema))  # 뷰도 포함
    names = sorted(table_names | view_names)

    out: List[TableMeta] = []
    for name in names:
        cols_meta = insp.get_columns(name, schema=schema)  # 테이블/뷰 모두 동작
        column_names = [c["name"] for c in cols_meta]
        date_fields = [c for c in DATE_CANDIDATES if c in column_names]
        out.append(TableMeta(name=name, columns=column_names, date_fields=date_fields))
    return out


@router.get("/rows", response_model=RowsResponse)
def get_rows(
    table: str = Query(..., description="테이블/뷰 이름"),
    schema: str = Query("public", description="스키마명 (기본: public)"),
    q: Optional[str] = Query(None, description="간단 검색(텍스트 컬럼 대상 ilike)"),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD (포함)"),
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    insp = _insp(db)
    names = set(insp.get_table_names(schema=schema)) | set(
        insp.get_view_names(schema=schema)
    )
    if table not in names:
        raise HTTPException(status_code=404, detail=f"{schema}.{table} 없음")

    tbl = _reflect(db, schema, table)
    cols_meta = insp.get_columns(table, schema=schema)
    col_names = [c["name"] for c in cols_meta]

    # 날짜/텍스트 컬럼
    date_col = next((c for c in DATE_CANDIDATES if c in col_names), None)

    def is_text(cmeta) -> bool:
        return any(k in str(cmeta["type"]).upper() for k in ("CHAR", "TEXT", "VARCHAR"))

    text_cols = [c["name"] for c in cols_meta if is_text(c)]

    # 조건
    conds = []
    if q and text_cols:
        conds.append(
            or_(*[tbl.c[c].cast(String).ilike(f"%{q}%") for c in text_cols])
        )
    if date_col and (date_from or date_to):
        d = getattr(tbl.c, date_col)
        if date_from:
            conds.append(d >= date_from)
        if date_to:
            conds.append(d <= date_to)
    where_clause = and_(*conds) if conds else None

    # 정렬
    if date_col:
        order_by = getattr(tbl.c, date_col).desc()
    elif "id" in col_names:
        order_by = tbl.c.id.desc()
    elif "no" in col_names:
        order_by = tbl.c.no.desc()
    else:
        order_by = getattr(tbl.c, col_names[0]).desc()

    # total(필터 포함)
    count_stmt = select(func.count()).select_from(tbl)
    if where_clause is not None:
        count_stmt = count_stmt.where(where_clause)
    total = db.execute(count_stmt).scalar_one()

    # 데이터
    stmt = select(tbl)
    if where_clause is not None:
        stmt = stmt.where(where_clause)
    stmt = stmt.order_by(order_by).limit(limit).offset(offset)
    rows = [dict(r) for r in db.execute(stmt).mappings().all()]

    return RowsResponse(columns=col_names, rows=rows, total=total)


# ──────────────────────────────────────
#  리드타임 조회 API (/logs/leadtime)
# ──────────────────────────────────────

def _to_date(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def _diff_days(a, b):
    da = _to_date(a)
    db_ = _to_date(b)
    if da is None or db_ is None:
        return None
    return (db_ - da).days


@router.post("/leadtime", response_model=LeadTimeResponse)
def get_leadtime(
    payload: LeadTimeRequest,
    db: Session = Depends(get_db),
):
    """
    equipment_receipt_log / equipment_shipment_log / equipment_progress_log 를 이용해
    호기별 리드타임(일)을 계산해서 반환.

    - in_to_ship_days  : receive_date → shipped_date
    - in_to_done_days  : receive_date → progress=100 의 updated_at
    - in_to_start_days : receive_date → progress>0 중 최소 updated_at
    """
    # 입력 정리(공백 제거 + 중복 제거)
    machine_nos = sorted(
        {m.strip() for m in payload.machine_nos if m and m.strip()}
    )
    if not machine_nos:
        return LeadTimeResponse(items=[])

    md = MetaData()
    receipt_tbl = Table(
        "equipment_receipt_log", md, autoload_with=db.bind, schema="public"
    )
    shipment_tbl = Table(
        "equipment_shipment_log", md, autoload_with=db.bind, schema="public"
    )
    progress_tbl = Table(
        "equipment_progress_log", md, autoload_with=db.bind, schema="public"
    )

    # 사내 입고일 (receive_date)
    rec_subq = (
        select(
            receipt_tbl.c.machine_no.label("machine_no"),
            func.min(receipt_tbl.c.receive_date).label("receive_date"),
        )
        .where(receipt_tbl.c.machine_no.in_(machine_nos))
        .group_by(receipt_tbl.c.machine_no)
        .subquery()
    )

    # 출하일 (shipped_date)
    ship_subq = (
        select(
            shipment_tbl.c.machine_no.label("machine_no"),
            func.min(shipment_tbl.c.shipped_date).label("shipped_date"),
        )
        .where(shipment_tbl.c.machine_no.in_(machine_nos))
        .group_by(shipment_tbl.c.machine_no)
        .subquery()
    )

    # 생산 시작일: progress > 0 중 가장 이른 updated_at
    start_subq = (
        select(
            progress_tbl.c.machine_no.label("machine_no"),
            func.min(progress_tbl.c.updated_at).label("start_at"),
        )
        .where(
            progress_tbl.c.machine_no.in_(machine_nos),
            progress_tbl.c.progress > 0,
        )
        .group_by(progress_tbl.c.machine_no)
        .subquery()
    )

    # 생산 완료일: progress = 100 중 가장 이른 updated_at
    done_subq = (
        select(
            progress_tbl.c.machine_no.label("machine_no"),
            func.min(progress_tbl.c.updated_at).label("done_at"),
        )
        .where(
            progress_tbl.c.machine_no.in_(machine_nos),
            progress_tbl.c.progress == 100,
        )
        .group_by(progress_tbl.c.machine_no)
        .subquery()
    )

    join_stmt = (
        select(
            rec_subq.c.machine_no,
            rec_subq.c.receive_date,
            ship_subq.c.shipped_date,
            start_subq.c.start_at,
            done_subq.c.done_at,
        )
        .select_from(
            rec_subq.outerjoin(
                ship_subq, ship_subq.c.machine_no == rec_subq.c.machine_no
            )
            .outerjoin(
                start_subq, start_subq.c.machine_no == rec_subq.c.machine_no
            )
            .outerjoin(
                done_subq, done_subq.c.machine_no == rec_subq.c.machine_no
            )
        )
    )

    rows = db.execute(join_stmt).mappings().all()

    items_map: Dict[str, LeadTimeItem] = {}

    for r in rows:
        machine_no = r["machine_no"]
        receive_date = r.get("receive_date")
        shipped_date = r.get("shipped_date")
        start_at = r.get("start_at")
        done_at = r.get("done_at")

        items_map[machine_no] = LeadTimeItem(
            machine_no=machine_no,
            in_to_ship_days=_diff_days(receive_date, shipped_date),
            in_to_done_days=_diff_days(receive_date, done_at),
            in_to_start_days=_diff_days(receive_date, start_at),
        )

    # 사내 입고 로그가 없었던 호기도 None 값으로 채워서 반환
    for m in machine_nos:
        if m not in items_map:
            items_map[m] = LeadTimeItem(machine_no=m)

    return LeadTimeResponse(items=list(items_map.values()))
