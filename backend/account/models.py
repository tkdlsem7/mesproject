# backend/Account/models.py
from sqlalchemy import Column, Integer, String, SmallInteger, text
from backend.Login.models import User

__all__ = [
    "User",
]