# backend/Attendance_history/schemas.py
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel


class AttendanceLogRow(BaseModel):
    no: int
    user_id: str
    user_name: Optional[str] = None
    dept: Optional[str] = None  # 팀
    record_type: int
    record_label: Optional[str] = None  # '출근'/'오전 출근'/'오후 출근'
    checked_at: datetime


class AttendanceLogsResponse(BaseModel):
    # 단일일 조회 호환용(있으면 주고, 없으면 None)
    day: Optional[date] = None

    # 기간 조회용(프론트에서 from/to로 조회할 때 필요)
    from_date: date
    to_date: date

    items: List[AttendanceLogRow]


class DeptAttendanceSummaryRow(BaseModel):
    dept: str
    present: int  # 당일 출근(출근/오전/오후 중 하나라도 찍힌 유저 수)


class DeptAttendanceSummaryResponse(BaseModel):
    day: date
    items: List[DeptAttendanceSummaryRow]

class DeptUserRow(BaseModel):
    user_id: str
    user_name: Optional[str] = None
    dept: Optional[str] = None


class AttendanceRosterResponse(BaseModel):
    items: List[DeptUserRow]