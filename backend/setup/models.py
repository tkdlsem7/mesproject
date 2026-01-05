# models.py
from __future__ import annotations
from sqlalchemy import Column, BigInteger, Text, Date, Numeric, Integer, DateTime, func
from backend.db.database import Base  # 프로젝트의 Base import 경로에 맞춰 수정


class SetupSheetAll(Base):
    __tablename__ = "setup_sheet_all"

    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    sheet_id = Column(BigInteger, nullable=False, index=True)

    # 공통(헤더 역할)
    step_name = Column(Text, nullable=True)
    machine_no = Column(Text, nullable=True)
    sn = Column(Text, nullable=True)
    chiller_sn = Column(Text, nullable=True)
    setup_start_date = Column(Date, nullable=True)
    setup_end_date = Column(Date, nullable=True)

    # 스텝별 값
    setup_hours = Column(Numeric(6, 2), nullable=True)
    defect_detail = Column(Text, nullable=True)
    quality_score = Column(Integer, nullable=True)
    # 주의: 현재 '분' 단위를 저장 중(프론트와 합의된 상태)
    ts_hours = Column(Numeric(6, 2), nullable=True)

    # 새로 추가한 컬럼들
    hw_sw = Column(Text, nullable=True)            # hw/sw
    defect = Column(Text, nullable=True)           # 불량
    defect_type = Column(Text, nullable=True)      # 불량유형
    defect_group = Column(Text, nullable=True)     # 불량구분
    defect_location = Column(Text, nullable=True)  # 불량위치

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
