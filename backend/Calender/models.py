# backend/EquipmentSchedule/models.py
from __future__ import annotations

from sqlalchemy import Column, BigInteger, Text, Date, DateTime, func
from backend.db.database import Base


class EquipmentSchedule(Base):
    __tablename__ = "equipment_schedule"

    id = Column(BigInteger, primary_key=True, index=True)
    source_key = Column(Text, nullable=False)
    file_name = Column(Text, nullable=False)

    uploaded_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    machine_no = Column(Text, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)

    owner = Column(Text, nullable=True)
    note = Column(Text, nullable=True)
