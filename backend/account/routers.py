# backend/Account/routers.py
import os
from datetime import datetime, timedelta
from typing import Optional
from backend.core.security import create_access_token, JWT_SECRET, JWT_ALG

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.Login.models import User as Users# ✅ users 테이블 모델이 여기 있다고 가정 (이미 프로젝트에 존재)

from backend.account import schemas

router = APIRouter(prefix="/account", tags=["account"])

security = HTTPBearer(auto_error=False)

# ✅ 로그인에서 사용하는 값과 반드시 동일해야 함
SECRET_KEY = JWT_SECRET
ALGORITHM = JWT_ALG
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MIN", "10080"))  # 기본 7일


def create_access_token(sub: str, name: Optional[str] = None) -> str:
    now = datetime.utcnow()
    payload = {
        "sub": sub,
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    if name:
        payload["name"] = name
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    db: Session = Depends(get_db),
    creds: HTTPAuthorizationCredentials = Depends(security),
) -> Users:
    if not creds or not creds.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token = creds.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user_id = payload.get("sub") or payload.get("user_id") or payload.get("id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = db.query(Users).filter(Users.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


@router.get("/me", response_model=schemas.UserMeOut)
def read_me(me: Users = Depends(get_current_user)):
    return schemas.UserMeOut(
        id=me.id,
        name=me.name,
        dept=me.dept,
        auth=int(me.auth or 0),
    )


@router.put("/me", response_model=schemas.UserMeUpdateOut)
def update_me(
    body: schemas.UserMeUpdateIn,
    db: Session = Depends(get_db),
    me: Users = Depends(get_current_user),
):
    # --- 정리: 어떤 변경이 발생하는지 ---
    wants_id_change = bool(body.new_id and body.new_id.strip() and body.new_id.strip() != me.id)
    wants_pw_change = bool(body.new_pw and body.new_pw.strip())

    # --- 아이디/비번 바꾸면 현재 비번 필수 ---
    if wants_id_change or wants_pw_change:
        if not body.current_pw:
            raise HTTPException(status_code=400, detail="현재 비밀번호가 필요합니다.")
        # ⚠️ 현재 프로젝트가 평문 pw 저장이라면 단순 비교
        # (해시 적용 시에는 여기만 교체하면 됨)
        if me.pw != body.current_pw:
            raise HTTPException(status_code=400, detail="현재 비밀번호가 올바르지 않습니다.")

    # --- 아이디 중복 체크 ---
    if wants_id_change:
        new_id = body.new_id.strip()
        exists = db.query(Users).filter(Users.id == new_id).first()
        if exists:
            raise HTTPException(status_code=409, detail="이미 사용 중인 아이디입니다.")
        me.id = new_id

    # --- 비밀번호 변경 ---
    if wants_pw_change:
        me.pw = body.new_pw  # 평문 저장 기준

    # --- 이름/부서 변경 ---
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="이름은 비울 수 없습니다.")
        me.name = name

    if body.dept is not None:
        # dept는 null 허용
        dept = body.dept.strip() if body.dept else None
        me.dept = dept if dept else None

    db.commit()
    db.refresh(me)

    # 아이디가 바뀌면 토큰도 새로 발급해서 프론트가 교체 저장할 수 있게
    new_token = None
    if wants_id_change:
        new_token = create_access_token(sub=me.id, name=me.name)

    return schemas.UserMeUpdateOut(
        user=schemas.UserMeOut(id=me.id, name=me.name, dept=me.dept, auth=int(me.auth or 0)),
        access_token=new_token,
    )
