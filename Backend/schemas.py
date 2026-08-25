from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    
class GroupCreate(BaseModel):
    name: str
    member_ids: list[int]


class MessageCreate(BaseModel):
    receiver_id: int
    text: str


class MessageOut(BaseModel):
    id: int
    sender_id: int
    receiver_id: int | None
    group_id: int | None

    text: str | None

    media_type: str | None
    media_url: str | None

    is_read: bool

    ai_category: str | None
    ai_reason: str | None
    ai_confidence: float | None

    created_at: datetime | None

    class Config:
        from_attributes = True


class AnalyzeRequest(BaseModel):
    text: str

class GroupMessageCreate(BaseModel):
    text: str