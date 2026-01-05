# backend/board_post/routers.py
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, status, Header
from sqlalchemy.orm import Session
from . import models, schemas
from backend.db.database import get_db
from urllib.parse import unquote

router = APIRouter(prefix="/board", tags=["board"])

@router.get("", response_model=List[schemas.BoardOut])
def list_posts(db: Session = Depends(get_db)):
    return db.query(models.BoardPost).order_by(models.BoardPost.no.desc()).all()

@router.post("", response_model=schemas.BoardOut)
def create_post(
    payload: schemas.BoardCreate,
    db: Session = Depends(get_db),
    x_user_name: str | None = Header(default=None),
):
    # ✅ URL 디코딩 + 공백 제거 + 기본값
    author = (unquote(x_user_name) if x_user_name else "").strip() or "미등록"

    post = models.BoardPost(
        title=payload.title.strip(),
        content=payload.content.strip(),
        category=payload.category.strip(),
        author_name=author,
    )
    db.add(post); db.commit(); db.refresh(post)
    return post

# ✅ 반드시 동적 경로보다 위에 둡니다.
@router.get("/summary", response_model=schemas.BoardSummary)
def board_summary(
    limit: int = Query(6, ge=1, le=20, description="가져올 개수(1~20)"),
    db: Session = Depends(get_db),
):
    notices = (
        db.query(models.BoardPost)
        .filter(models.BoardPost.category == "공지사항")
        .order_by(models.BoardPost.created_at.desc(), models.BoardPost.no.desc())
        .limit(limit).all()
    )
    changes = (
        db.query(models.BoardPost)
        .filter(models.BoardPost.category == "적용사항")
        .order_by(models.BoardPost.created_at.desc(), models.BoardPost.no.desc())
        .limit(limit).all()
    )
    return {"notices": notices, "changes": changes}

@router.get("/{no}", response_model=schemas.BoardOut)
def get_post(no: int, db: Session = Depends(get_db)):
    post = db.query(models.BoardPost).get(no)
    if not post:
        raise HTTPException(status_code=404, detail="not found")
    return post

@router.put("/{no}", response_model=schemas.BoardOut)
def update_post(no: int, payload: schemas.BoardUpdate, db: Session = Depends(get_db)):
    post = db.query(models.BoardPost).get(no)
    if not post:
        raise HTTPException(status_code=404, detail="not found")
    post.title = payload.title.strip()
    post.content = payload.content.strip()
    post.category = payload.category.strip()
    db.commit(); db.refresh(post)
    return post

@router.delete("/{no}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(no: int, db: Session = Depends(get_db)):
    post = db.query(models.BoardPost).get(no)
    if not post:
        raise HTTPException(status_code=404, detail="not found")
    db.delete(post); db.commit()
    return
