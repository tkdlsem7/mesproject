# backend/Login/schemas.py
# ─────────────────────────────────────────────────────────────
# Pydantic 스키마: 요청/응답 바디 정의
# ─────────────────────────────────────────────────────────────
from pydantic import BaseModel, Field

class UserRegister(BaseModel):
    id: str = Field(..., description="로그인 ID")
    pw: str = Field(..., description="비밀번호(평문, 서버에서 해시 저장)")
    name: str = Field(..., description="표시 이름")

class UserLogin(BaseModel):
    id: str
    pw: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    name: str       # 프론트가 다른 폼에서 쓰도록 같이 반환
    auth : int

    

