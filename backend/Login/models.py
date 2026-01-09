# backend/Login/models.py
# ─────────────────────────────────────────────────────────────
# 사용자 테이블 정의 (PostgreSQL)
#  - 스키마는 화면 캡처에 맞춤: no(PK), id(로그인ID), pw(해시), name
#  - 이미 테이블이 있으면 이 모델로 매핑만 됩니다.
# ─────────────────────────────────────────────────────────────
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy import Column, Integer, String, Index, SmallInteger,text

Base = declarative_base()

class User(Base):

    __tablename__ = "users"

    no   = Column(Integer, primary_key=True, index=True, autoincrement=True)
    id   = Column(String(50), unique=True, nullable=False)   # 로그인용 ID
    pw   = Column(String(100), nullable=False)                            # 비밀번호 해시
    name = Column(String(50), nullable=False)
    dept = Column(String(50), nullable=True)
    auth = Column(SmallInteger, nullable=False, server_default=text("0"))

# 자주 쓰는 조회 최적화 인덱스
Index("ix_users_id", User.id)
