from __future__ import annotations

from sqlalchemy import Column, BigInteger, Text, DateTime, UniqueConstraint, Index, func
from backend.db.database import Base
from backend.Modifyoption.models import Checklist
from backend.Login.models import User

__all__ = ["User"]

class LineAccessCurrent(Base):
    __tablename__ = "line_access_current"

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    person_type = Column(Text, nullable=False)  # "EMP" | "VISITOR"
    person_key = Column(Text, nullable=False)

    name = Column(Text, nullable=False)

    # DB 컬럼은 dept_or_con 이지만, API/프론트는 dept_or_company로 쓰기 위해 매핑
    dept_or_company = Column(Text, nullable=False)

    site = Column(Text, nullable=False)
    building = Column(Text, nullable=False)
    memo = Column(Text, nullable=True)

    entered_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("person_type", "person_key", name="uq_line_access_current_person"),
        Index("ix_line_access_current_site", "site"),
        Index("ix_line_access_current_building", "building"),
        Index("ix_line_access_current_entered_at", "entered_at"),
    )

class LineAccessLog(Base):
    __tablename__ = "line_access_logs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    person_type = Column(Text, nullable=False)
    person_key = Column(Text, nullable=False)
    name = Column(Text, nullable=False)

    # ✅ logs 테이블은 컬럼명이 dept_or_company 그대로인 것으로 보임(스크린샷)
    dept_or_company = Column(Text, nullable=False)

    site = Column(Text, nullable=False)
    building = Column(Text, nullable=False)

    event_type = Column(Text, nullable=False)  # "ENTER" | "EXIT"
    occurred_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    memo = Column(Text, nullable=True)

    __table_args__ = (
        Index("ix_line_access_logs_occurred_at", "occurred_at"),
        Index("ix_line_access_logs_person", "person_type", "person_key"),
        Index("ix_line_access_logs_event", "event_type"),
    )