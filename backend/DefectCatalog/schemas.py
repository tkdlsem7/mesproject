from __future__ import annotations
from typing import List
from pydantic import BaseModel, ConfigDict, Field

class DefectCatalogUpsert(BaseModel):
    defect: str = Field(min_length=1)
    defect_types: List[str] = Field(default_factory=list)

class DefectCatalogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    defect: str
    defect_types: List[str]
