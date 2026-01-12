# backend/Login/routers.py
# ─────────────────────────────────────────────────────────────
# /api/auth 라우터
# ─────────────────────────────────────────────────────────────
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from jose import JWTError, jwt
from typing import Optional

# ✅ 같은 패키지 내는 ., 상위 패키지는 ..
from .schemas import UserRegister, UserLogin, TokenResponse
from .models  import User
from backend.deps   import get_db
from backend.core.security import (
    hash_password, verify_password, create_access_token, JWT_SECRET, JWT_ALG
)

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post("/register", response_model=TokenResponse, status_code=201)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    exists = db.query(User).filter(User.id == payload.id).first()
    if exists:
        raise HTTPException(status_code=409, detail="이미 가입된 아이디입니다.")
    user = User(id=payload.id, pw=hash_password(payload.pw), name=payload.name)
    db.add(user); db.commit(); db.refresh(user)
    token = create_access_token(subject=user.id, extra={"name": user.name, "auth": int(user.auth)})
    return TokenResponse(access_token=token, name=user.name, auth=int(user.auth), )


@router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user: Optional[User] = db.query(User).filter(User.id == payload.id).first()
    if not user:
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")
    ok = False
    try:
        ok = verify_password(payload.pw, user.pw)
    except Exception:
        ok = False
    if not ok and payload.pw == user.pw:  # 레거시 평문 대비(가능하면 제거 권장)
        ok = True
    if not ok:
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")
    token = create_access_token(subject=user.id, extra={"name": user.name, "auth": int(user.auth)})
    return TokenResponse(access_token=token, name=user.name, auth=int(user.auth),)
