from __future__ import annotations

from typing import List, Tuple
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from sqlalchemy.orm import Session
from sqlalchemy import asc, or_, func
from sqlalchemy.exc import IntegrityError

# --- DB 세션 ---
try:
    from backend.db.database import get_db
except ImportError:
    from backend.db.database import get_db

# --- 모델 ---
try:
    from .models import EquipProgress, EquipmentMoveLog
except ImportError:
    from .models import EquipProgress, EquipmentMoveLog  # 폴백

# --- 스키마 ---
from .schemas import (
    EquipmentListOut,
    EquipmentRowOut,
    MoveBatchIn,
    MoveBatchOut,
    AllowedSite,
    ConflictOut,
    PasteParseIn,
    PasteParseOut,
    PasteParsedRow,
)

router = APIRouter(prefix="/move", tags=["move"])


# ─────────────────────────────────────────────
# 유틸: 안전한 pydantic dump (v1/v2 호환)
# ─────────────────────────────────────────────
def _dump(model):
    return model.model_dump() if hasattr(model, "model_dump") else model.dict()


# ─────────────────────────────────────────────
# 유틸: 컬럼/값 정규화
# ─────────────────────────────────────────────
def _get_slot_col():
    """EquipProgress 슬롯 컬럼 자동 인식: slot_code 우선, 없으면 slot"""
    return getattr(EquipProgress, "slot_code", None) or getattr(EquipProgress, "slot", None)


def _mid(row) -> str:
    """프로젝트별 장비 식별자 컬럼명이 다를 수 있어 공용 접근자 제공"""
    return (
        (getattr(row, "machine_id", None)
         or getattr(row, "machine_no", None)
         or getattr(row, "equip_id", None)
         or "")
    ).strip()


def _norm_site(s: str) -> str:
    """
    사이트 표준화:
      - 공백 제거
      - '본사라인' → '본사', '진우리 라인' → '진우리'
      - ✅ '라인대기'는 훼손되면 안되므로 예외 처리
    """
    s = (s or "").strip().replace(" ", "")
    if s in ("라인대기", "라인대기장", "대기", "라인-대기", "라인_대기"):
        return "라인대기"
    # '본사라인' 같은 케이스만 정리
    s = s.replace("라인", "")
    return s


def _norm_slot(s: str) -> str:
    """
    슬롯 문자열 정규화 (표준형: 'HEAD-XX[-YY]…' 대문자, 2자리 패딩, 하이픈 유지):
      - (e) 제거
      - 특수 대시(–—−) → '-' 통일
      - 공백 제거
      - 대문자화
      - 예: a1 → A-01, a01 → A-01, j1401 → J-14-01, j-11-12 → J-11-12
    """
    s = (s or "").strip().upper()
    s = re.sub(r"\(E\)", "", s, flags=re.I)
    s = s.replace("–", "-").replace("—", "-").replace("−", "-")
    s = re.sub(r"\s+", "", s)

    m = re.match(r"^([A-Z]+)[-]?([0-9\-]*)$", s)
    if not m:
        return s
    head, tail = m.group(1), m.group(2)

    if "-" in tail:
        parts = [p for p in tail.split("-") if p != ""]
        parts = [p.zfill(2) for p in parts]
    else:
        digits = re.sub(r"\D", "", tail)
        if len(digits) == 0:
            parts = []
        elif len(digits) == 1:
            parts = [digits.zfill(2)]
        elif len(digits) == 2:
            parts = [digits]
        elif len(digits) == 3:
            parts = [digits[:1], digits[1:]]
            parts = [p.zfill(2) for p in parts]
        else:
            parts = [digits[:2], digits[2:4]]
            parts = [p.zfill(2) for p in parts]

    return head + ("-" + "-".join(parts) if parts else "")


def _to_compact_slot(s: str) -> str:
    """
    저장용 '컴팩트' 슬롯: 하이픈 제거 + 앞자리 0 제거, 대문자 유지
      - 'D-01'   → 'D1'
      - 'J-14-01'→ 'J1401'
      - 'A'      → 'A'
    """
    norm = _norm_slot(s)
    parts = norm.split("-")
    head, nums = parts[0], parts[1:] if len(parts) > 1 else []
    if not nums:
        return head
    compact = head + "".join(str(int(p)) for p in nums if p != "")
    return compact


def _slot_aliases_all(s: str) -> Tuple[List[str], List[str]]:
    """
    모든 조합 별칭 생성:
      - 각 숫자 파트의 '2자리(원본)'과 '선행 0 제거' 버전 생성
      - 하이픈 제거 버전도 생성 (DB가 'J1401' 식일 때 대비)
    return: (with_hyphen_list, no_hyphen_list)
    """
    parts = s.split("-")
    head, nums = parts[0], parts[1:] if len(parts) > 1 else []
    if not nums:
        return [s], [head]

    options: List[List[str]] = []
    for p in nums:
        base = p.zfill(2)
        no0 = str(int(p))
        options.append(sorted({base, no0}))

    with_hyphen_set: set[str] = set()

    def dfs(i: int, acc: List[str]):
        if i == len(options):
            with_hyphen_set.add(head + "-" + "-".join(acc))
            return
        for v in options[i]:
            dfs(i + 1, acc + [v])

    dfs(0, [])
    with_hyphen = sorted(with_hyphen_set)

    no_hyphen: List[str] = []
    for w in with_hyphen:
        _, *rest = w.split("-")
        no_hyphen.append(head + "".join(rest))
    return with_hyphen, no_hyphen


def _extract_sites(text: str) -> Tuple[str, str]:
    """
    붙여넣기 텍스트에서 "진우리 -> 본사" 같은 방향을 찾아 from/to site 반환
    """
    SITES_RE = re.compile(r"(본사|진우리|부항리|라인대기)")
    for raw in (text or "").splitlines():
        s = raw.strip().replace(" ", "")
        if "->" in s:
            m = re.search(r"(본사|진우리|부항리|라인대기)->(본사|진우리|부항리|라인대기)", s)
            if m:
                return _norm_site(m.group(1)), _norm_site(m.group(2))
        # 혹시 "진우리 본사" 같이 공백 없이 나열된 케이스
        m2 = SITES_RE.search(s)
        if m2:
            # 방향까지는 못 찾으면 기본값
            break
    # 기본값
    return "진우리", "본사"


def _is_slot_occupied(db: Session, site_norm: str, slot_norm: str) -> str | None:
    """
    목적지(site, slot)가 이미 점유되어 있으면 점유 장비 ID 반환, 아니면 None
    """
    slot_col = _get_slot_col()
    if slot_col is None:
        raise HTTPException(status_code=500, detail="EquipProgress 슬롯 컬럼(slot_code/slot) 미정의")

    aliases, aliases_nohy = _slot_aliases_all(slot_norm)
    tgt = (
        db.query(EquipProgress)
        .filter(EquipProgress.site == site_norm)
        .filter(
            or_(
                slot_col.in_(aliases),
                func.replace(slot_col, "-", "").in_(aliases_nohy),
            )
        )
        .first()
    )
    if tgt and _mid(tgt):
        return _mid(tgt)
    return None


# ─────────────────────────────────────────────────────────────
# GET /equipments : 사이트별 장비 목록
# ─────────────────────────────────────────────────────────────
@router.get("/equipments", response_model=EquipmentListOut)
def get_equipments(
    site: AllowedSite = Query("본사", description="사이트(본사/진우리/라인대기/부항리)"),
    db: Session = Depends(get_db),
):
    slot_col = _get_slot_col()
    if slot_col is None:
        raise HTTPException(status_code=500, detail="EquipProgress 슬롯 컬럼(slot_code/slot) 미정의")

    site_norm = _norm_site(site)

    rows = (
        db.query(EquipProgress)
        .filter(EquipProgress.site == site_norm)
        .order_by(asc(slot_col))
        .all()
    )

    items: list[EquipmentRowOut] = []
    for r in rows:
        items.append(
            EquipmentRowOut(
                machine_id=_mid(r),
                site=getattr(r, "site", ""),
                slot=getattr(r, slot_col.key, ""),
                manager=getattr(r, "manager", None),
                progress=getattr(r, "progress", None),
            )
        )
    return EquipmentListOut(site=site, items=items)


# ─────────────────────────────────────────────────────────────
# POST /apply : 장비 이동 일괄 적용 (장비별 목적지 지정)
# ─────────────────────────────────────────────────────────────
@router.post("/apply", response_model=MoveBatchOut)
def apply_move(payload: MoveBatchIn, db: Session = Depends(get_db)):
    slot_col = _get_slot_col()
    if slot_col is None:
        raise HTTPException(status_code=500, detail="EquipProgress 슬롯 컬럼(slot_code/slot) 미정의")

    conflicts: list[ConflictOut] = []
    not_found: list[str] = []
    errors: list[str] = []
    updated = 0

    # (커밋 실패 시 대비) 이번 요청의 목적지들을 저장해 둠
    requested_moves: list[tuple[str, str, str]] = []  # (machine_id, to_site_norm, to_slot_norm)

    for item in payload.items:
        to_site_norm = _norm_site(item.to_site)
        to_slot_norm = _norm_slot(item.to_slot)
        to_slot_comp = _to_compact_slot(item.to_slot)
        requested_moves.append((item.machine_id, to_site_norm, to_slot_norm))

        # 대상 장비(원본) 조회
        conds = []
        for col_name in ("machine_id", "machine_no", "equip_id"):
            col = getattr(EquipProgress, col_name, None)
            if col is not None:
                conds.append(col == item.machine_id)
        if not conds:
            raise HTTPException(
                status_code=500,
                detail="EquipProgress에 machine_id/machine_no/equip_id 컬럼이 없습니다.",
            )

        # one_or_none()는 중복 데이터에서 500을 만들 수 있어 limit 방식으로 안전하게 처리
        srcs = db.query(EquipProgress).filter(or_(*conds)).limit(2).all()
        if len(srcs) == 0:
            not_found.append(item.machine_id)
            continue
        if len(srcs) > 1:
            errors.append(f"[{item.machine_id}] 같은 ID로 EquipProgress가 2개 이상 조회됩니다(데이터 중복).")
            continue

        src = srcs[0]

        # ✅ 모든 사이트에서 목적지 점유 체크 (진우리도 포함) → 500 대신 409로 안내
        occ = _is_slot_occupied(db, to_site_norm, to_slot_norm)
        if to_site_norm != "진우리":
            occ = _is_slot_occupied(db, to_site_norm, to_slot_norm)
            if occ and occ != _mid(src):
                conflicts.append(
                    ConflictOut(site=to_site_norm, slot=to_slot_norm, current_machine_id=occ)
                )
                continue

        # 이동 수행 (저장은 컴팩트)
        prev_site = getattr(src, "site", None)
        prev_slot = getattr(src, slot_col.key, None)

        setattr(src, "site", to_site_norm)
        setattr(src, slot_col.key, to_slot_comp)
        updated += 1

        # 이동 로그
        try:
            db.add(
                EquipmentMoveLog(
                    machine_id=_mid(src) or "",
                    manager=getattr(src, "manager", None),
                    from_site=prev_site,
                    to_site=to_site_norm,
                    from_slot=prev_slot,
                    to_slot=to_slot_comp,
                )
            )
        except Exception:
            # 로그 실패는 전체 트랜잭션 막지 않음
            pass

    # 충돌/에러가 있으면 커밋 전에 409로 반환
    if conflicts or errors:
        out = MoveBatchOut(
            ok=False,
            updated=0,
            not_found=not_found,
            conflicts=conflicts,
            errors=errors,
        )
        return JSONResponse(status_code=409, content=_dump(out))

    if updated > 0:
        try:
            db.commit()
        except IntegrityError:
            # ✅ DB 제약(유니크/체크 등)으로 500 나는 케이스를 409로 변환
            db.rollback()

            # 가능한 한 “현재 점유자”를 다시 계산해 conflicts로 내려줌
            re_conflicts: list[ConflictOut] = []
            for (mid, to_site_norm, to_slot_norm) in requested_moves:
                occ = _is_slot_occupied(db, to_site_norm, to_slot_norm)
                if occ and occ != mid:
                    re_conflicts.append(
                        ConflictOut(site=to_site_norm, slot=to_slot_norm, current_machine_id=occ)
                    )

            out = MoveBatchOut(
                ok=False,
                updated=0,
                not_found=not_found,
                conflicts=re_conflicts,
                errors=["DB 제약으로 이동이 반영되지 않았습니다. 목적지 슬롯 점유/제약조건을 확인하세요."],
            )
            return JSONResponse(status_code=409, content=_dump(out))

    return MoveBatchOut(
        ok=True,
        updated=updated,
        not_found=not_found,
        conflicts=[],
        errors=[],
    )


# ─────────────────────────────────────────────────────────────
# POST /apply-by-slot : (붙여넣기 파서용) from_slot/to_slot 기반 이동
# ─────────────────────────────────────────────────────────────
@router.post("/apply-by-slot", response_model=MoveBatchOut)
def apply_move_by_slot(payload: List[PasteParsedRow], db: Session = Depends(get_db)):
    slot_col = _get_slot_col()
    if slot_col is None:
        raise HTTPException(status_code=500, detail="EquipProgress 슬롯 컬럼(slot_code/slot) 미정의")

    conflicts: list[ConflictOut] = []
    not_found: list[str] = []
    errors: list[str] = []
    updated = 0

    for row in payload:
        if row.status not in ("ok", "conflict", "not_found"):
            continue

        from_site = _norm_site(row.from_site)
        to_site = _norm_site(row.to_site)
        from_slot_norm = _norm_slot(row.from_slot)
        to_slot_norm = _norm_slot(row.to_slot)
        to_slot_comp = _to_compact_slot(row.to_slot)

        # from 조회
        from_aliases, from_aliases_nohy = _slot_aliases_all(from_slot_norm)

        src = (
            db.query(EquipProgress)
            .filter(EquipProgress.site == from_site)
            .filter(
                or_(
                    slot_col.in_(from_aliases),
                    func.replace(slot_col, "-", "").in_(from_aliases_nohy),
                )
            )
            .first()
        )
        if not src or not _mid(src):
            not_found.append(row.machine_id or row.raw)
            continue

        # to 점유 체크 (모든 사이트 동일)
        occ = _is_slot_occupied(db, to_site, to_slot_norm)
        if occ and occ != _mid(src):
            conflicts.append(
                ConflictOut(site=to_site, slot=to_slot_norm, current_machine_id=occ)
            )
            continue

        # 이동 수행
        prev_site = getattr(src, "site", None)
        prev_slot = getattr(src, slot_col.key, None)

        setattr(src, "site", to_site)
        setattr(src, slot_col.key, to_slot_comp)
        updated += 1

        # 로그
        try:
            db.add(
                EquipmentMoveLog(
                    machine_id=_mid(src) or "",
                    manager=getattr(src, "manager", None),
                    from_site=prev_site,
                    to_site=to_site,
                    from_slot=prev_slot,
                    to_slot=to_slot_comp,
                )
            )
        except Exception:
            pass

    if conflicts or errors:
        out = MoveBatchOut(ok=False, updated=0, not_found=not_found, conflicts=conflicts, errors=errors)
        return JSONResponse(status_code=409, content=_dump(out))

    if updated > 0:
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            out = MoveBatchOut(
                ok=False,
                updated=0,
                not_found=not_found,
                conflicts=conflicts,
                errors=["DB 제약으로 이동이 반영되지 않았습니다."],
            )
            return JSONResponse(status_code=409, content=_dump(out))

    return MoveBatchOut(ok=True, updated=updated, not_found=not_found, conflicts=[], errors=[])


# ─────────────────────────────────────────────────────────────
# POST /paste-parse : (디자인만 사용 예정이므로 유지)
# ─────────────────────────────────────────────────────────────
@router.post("/paste-parse", response_model=PasteParseOut)
def paste_parse(payload: PasteParseIn, db: Session = Depends(get_db)):
    from_site, to_site = _extract_sites(payload.text)

    slot_col = _get_slot_col()
    if slot_col is None:
        raise HTTPException(status_code=500, detail="EquipProgress 슬롯 컬럼(slot_code/slot) 미정의")

    items: list[PasteParsedRow] = []
    ok = not_found = conflict = 0

    for raw in (payload.text or "").splitlines():
        line = raw.strip()
        if not line:
            continue

        # 제목/날짜/방향/설명 같은 줄은 스킵
        if "->" in line or "현황" in line or "공유" in line or "라인이동" in line or line == "라인":
            items.append(PasteParsedRow(raw=raw, status="skip", message="skip header"))
            continue

        # 공백 2토큰 기준 파싱
        t = re.sub(r"\(E\)", "", line, flags=re.I)
        t = t.replace("–", "-").replace("—", "-").replace("−", "-")
        t = re.sub(r"\s+", " ", t).strip()
        parts = t.split(" ")
        if len(parts) < 2:
            items.append(PasteParsedRow(raw=raw, status="skip", message="not enough tokens"))
            continue

        machine_id = parts[0].strip()
        from_slot = parts[1].strip()

        from_slot_norm = _norm_slot(from_slot)
        to_slot_norm = from_slot_norm  # 붙여넣기에서는 slot은 동일, site만 이동하는 형태 가정

        # from 조회
        from_aliases, from_aliases_nohy = _slot_aliases_all(from_slot_norm)
        src = (
            db.query(EquipProgress)
            .filter(EquipProgress.site == from_site)
            .filter(
                or_(
                    slot_col.in_(from_aliases),
                    func.replace(slot_col, "-", "").in_(from_aliases_nohy),
                )
            )
            .first()
        )
        if not src or (_mid(src) != machine_id):
            not_found += 1
            items.append(
                PasteParsedRow(
                    raw=raw,
                    machine_id=machine_id,
                    from_site=from_site,
                    to_site=to_site,
                    from_slot=from_slot_norm,
                    to_slot=to_slot_norm,
                    status="not_found",
                    message="source not found/mismatch",
                )
            )
            continue

        # to 점유 체크
        occ = _is_slot_occupied(db, to_site, to_slot_norm)
        if occ and occ != machine_id:
            conflict += 1
            items.append(
                PasteParsedRow(
                    raw=raw,
                    machine_id=machine_id,
                    from_site=from_site,
                    to_site=to_site,
                    from_slot=from_slot_norm,
                    to_slot=to_slot_norm,
                    status="conflict",
                    message=f"occupied by {occ}",
                )
            )
            continue

        ok += 1
        items.append(
            PasteParsedRow(
                raw=raw,
                machine_id=machine_id,
                from_site=from_site,
                to_site=to_site,
                from_slot=from_slot_norm,
                to_slot=to_slot_norm,
                status="ok",
                message="ok",
            )
        )

    return PasteParseOut(from_site=from_site, to_site=to_site, ok=ok, not_found=not_found, conflict=conflict, items=items)
