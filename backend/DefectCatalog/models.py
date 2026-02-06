from sqlalchemy import Column, BigInteger, Text, text
from sqlalchemy.dialects.postgresql import ARRAY
from backend.db.database import Base

class DefectCatalog(Base):
    __tablename__ = "defect_catalog"

    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    defect = Column(Text, nullable=False, unique=True, index=True)

    # ✅ text[] 배열로 저장
    defect_types = Column(
        ARRAY(Text),
        nullable=False,
        server_default=text("'{}'::text[]"),
    )
