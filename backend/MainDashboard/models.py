# ------------------------------------------------------------
# MainDashboard/models.py  (또는 Dashboard/models.py)
# - equip_progress 테이블 및 간단 로그 테이블 매핑
# - DB 스키마 스냅샷에 맞춰 'status' 컬럼 추가 ★
# - 프로젝트 공용 Base 사용 (..db.database.Base)
# ------------------------------------------------------------
from __future__ import annotations

from decimal import Decimal
from sqlalchemy import Column, Integer, String, Numeric, Date, Text, func, DateTime, text
from backend.db.database import Base  # ✅ 공용 Base


class EquipProgress(Base):
    __tablename__ = "equip_progress"

    no = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # DB 스냅샷 기준 다수 NOT NULL이지만, 기존 데이터 호환을 위해 nullable=True도 허용.
    # (테이블이 이미 만들어져 있으면 create_all은 변경하지 않으므로 실제 제약은 DB가 우선)
    machine_id     = Column(String(20), nullable=True,  index=True)
    progress       = Column(Numeric(5, 2), nullable=False, default=Decimal("0.00"))
    manager        = Column(String(50), nullable=True)
    shipping_date  = Column(Date,        nullable=True)
    customer       = Column(String(50),  nullable=True)
    slot_code      = Column(String(5),   nullable=False, index=True)  # A1, B10 등
    note           = Column(Text,        nullable=True)
    site           = Column(String(30),  nullable=True)               # 본사/...
    serial_number  = Column(String(50),  nullable=True)
    status         = Column(String(20),  nullable=True)               # ★ 추가: '가능' | '불가능'
    chiller_serial_number = Column(String(50), nullable=True)

    def __repr__(self) -> str:
        return f"<EquipProgress slot={self.slot_code} machine={self.machine_id} status={getattr(self, 'status', None)}>"

# --- 최소 로그: 실제 DB 타입에 맞춰 Date/DateTime 조정 필요 시 수정 ---
class EquipmentLog(Base):
    __tablename__ = "equipment_log"
    id        = Column(Integer, primary_key=True, autoincrement=True)
    action    = Column(String(20), nullable=False)          # 'SHIP' 등
    slot_code = Column(String(10), nullable=False)
    machine_id= Column(String(20), nullable=True)
    at        = Column(Date, nullable=False, server_default=func.now())
    # DB가 timestamptz면: Column(DateTime(timezone=True), server_default=func.now())

class EquipmentMoveLog(Base):
    __tablename__ = "equipment_move_log"

    id         = Column(Integer, primary_key=True, index=True, autoincrement=True)
    # ✅ 파이썬 속성명은 machine_id로, 실제 DB 컬럼명은 "machine_no"로 매핑
    machine_id = Column("machine_no", String(20), nullable=False)
    manager    = Column(String(50), nullable=False, default="")
    move_date  = Column(DateTime(timezone=False), nullable=False, server_default=func.now())
    from_slot  = Column(String(10), nullable=False)
    to_slot    = Column(String(10), nullable=False)
    from_site  = Column(String(50), nullable=True)
    to_site    = Column(String(50), nullable=True)

class EquipmentProgressLog(Base):
    __tablename__ = "equipment_progress_log"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    machine_no = Column(String(20), nullable=False)
    manager    = Column(String(50), nullable=False)
    progress   = Column(Numeric(5, 2), nullable=False, server_default=text("0"))  # ✅ 추가
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class EquipmentShipmentLog(Base):
    __tablename__ = "equipment_shipment_log"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    machine_no = Column(String(20), nullable=False)
    manager = Column(String(50), nullable=False)
    shipped_date = Column(Date, nullable=False)
    site = Column(String(30), nullable=False)
    slot = Column(String(5), nullable=True)      # 스샷 기준 nullable
    customer = Column(String(50), nullable=False)
    progress = Column(Numeric(5,2), nullable=True)
    serial_number = Column(String(50), nullable=True)