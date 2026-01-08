# backend/Main/models.py
from __future__ import annotations

from sqlalchemy import Column, BigInteger, String, Integer, DateTime, ForeignKey, func
from backend.db.database import Base

# 기존 재사용 모델
from backend.MainDashboard.models import EquipProgress, EquipmentLog
from backend.EquipmentInfo.models import EquipmentReceiptLog


class AttendanceLog(Base):
    __tablename__ = "attendance_logs"

    no = Column(BigInteger, primary_key=True, autoincrement=True, index=True)
    user_id = Column(
        String(50),
        ForeignKey("users.id", onupdate="CASCADE", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    record_type = Column(Integer, nullable=False)  # 1=출근, 2=오전 출근, 3=오후 출근
    checked_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


__all__ = ["EquipProgress", "EquipmentLog", "EquipmentReceiptLog", "AttendanceLog"]
