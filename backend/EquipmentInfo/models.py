# backend/EquipmentInfo/models.py
# ------------------------------------------------------------
# equip_progress ORM은 MainDashboard/models.py의 것을 재사용하여
# 동일 테이블 중복 선언을 방지한다.
# ------------------------------------------------------------
from backend.MainDashboard.models import EquipProgress  # 기존 선언 재사용
from sqlalchemy import Column, BigInteger, Integer, String, DateTime, SmallInteger, text ,Date
from backend.db.database import Base
from backend.Calender.models import EquipmentSchedule

__all__ = ["EquipProgress", "EquipmentSchedule"]



class EquipmentReceiptLog(Base):
    __tablename__ = "equipment_receipt_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    machine_no = Column(String(20), nullable=False)
    manager = Column(String(50), nullable=False)
    receive_date = Column(Date, nullable=False)
    site = Column(String(30), nullable=False)
    slot = Column(String(5), nullable=True)


class EquipmentOption(Base):
    __tablename__ = "equipment_option"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    machine_id = Column(String(20), nullable=False)
    option_id = Column(String(50), nullable=False)   # ← varchar(50)로 변경된 컬럼
    manager = Column(String(50), nullable=False)
    selected_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    sort_order = Column(SmallInteger, nullable=False, server_default=text("0"))    