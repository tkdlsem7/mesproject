from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional, List
from pydantic import BaseModel, Field

PersonType = Literal["EMP", "VISITOR"]
EventType = Literal["ENTER", "EXIT"]


class LineAccessEnterIn(BaseModel):
    person_type: PersonType
    person_key: str = Field(min_length=1)
    name: str = Field(min_length=1)
    dept_or_company: str = Field(min_length=1)
    site: str = Field(min_length=1)
    building: str = Field(min_length=1)
    memo: Optional[str] = None


class LineAccessExitIn(BaseModel):
    person_type: PersonType
    person_key: str = Field(min_length=1)


class LineAccessCurrentOut(BaseModel):
    id: int
    person_type: PersonType
    person_key: str
    name: str
    dept_or_company: str
    site: str
    building: str
    memo: Optional[str] = None
    entered_at: datetime

    class Config:
        from_attributes = True


class EmployeeOut(BaseModel):
    id: str
    name: str
    dept: Optional[str] = None


# ✅ 로그 응답
class LineAccessLogOut(BaseModel):
    id: int
    person_type: PersonType
    person_key: str
    name: str
    dept_or_company: str
    site: str
    building: str
    event_type: EventType
    occurred_at: datetime
    memo: Optional[str] = None

    class Config:
        from_attributes = True
