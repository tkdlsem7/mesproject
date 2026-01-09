# backend/Account/schemas.py
from pydantic import BaseModel, Field
from typing import Optional


class UserMeOut(BaseModel):
    id: str
    name: str
    dept: Optional[str] = None
    auth: int


class UserMeUpdateIn(BaseModel):
    # 일반 수정
    name: Optional[str] = Field(None, description="이름")
    dept: Optional[str] = Field(None, description="부서(null 허용)")

    # 아이디/비번 변경 (조건부)
    new_id: Optional[str] = Field(None, description="변경할 아이디")
    new_pw: Optional[str] = Field(None, description="변경할 비밀번호")
    current_pw: Optional[str] = Field(None, description="현재 비밀번호(아이디/비번 변경 시 필수)")


class UserMeUpdateOut(BaseModel):
    user: UserMeOut
    access_token: Optional[str] = None
