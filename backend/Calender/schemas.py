from __future__ import annotations

from datetime import date, datetime
from typing import Optional, List

from pydantic import BaseModel, ConfigDict


class UploadScheduleResult(BaseModel):
    deleted_count: int
    inserted_count: int


class CalendarEvent(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int

    source_key: Optional[str] = None
    file_name: Optional[str] = None
    uploaded_at: Optional[datetime] = None

    machine_no: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None

    owner: Optional[str] = None
    note: Optional[str] = None


class CalendarEventUpdate(BaseModel):
    """
    ✅ 수정 가능 3개:
    - 담당자(owner)
    - 일정(start_date, end_date)
    - 내용(note)
    """
    owner: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    note: Optional[str] = None


class DeleteResult(BaseModel):
    deleted: bool
