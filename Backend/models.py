from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    DateTime,
    Text,
    Boolean,
    Float,
    Index,
)
from sqlalchemy.sql import func
from database import Base


# ==========================
# USER TABLE
# ==========================

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


# ==========================
# MESSAGE TABLE
# ==========================

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True, index=True)
    
    text = Column(Text, nullable=True)
    media_type = Column(String, nullable=True)
    media_url = Column(String, nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)

    # AI ANALYSIS
    ai_category = Column(String, nullable=True, index=True)
    ai_reason = Column(Text, nullable=True)
    ai_confidence = Column(Float, nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True,
    )

    # Composite indexes for sub-millisecond chat history queries
    __table_args__ = (
        Index("ix_messages_direct_chat", "sender_id", "receiver_id", "created_at"),
        Index("ix_messages_reverse_chat", "receiver_id", "sender_id", "created_at"),
        Index("ix_messages_group_chat", "group_id", "created_at"),
    )


# ==========================
# IMPORTANT CONTACTS TABLE
# ==========================

class ImportantContact(Base):
    __tablename__ = "important_contacts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    contact_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    always_notify = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_important_lookup", "user_id", "contact_id"),
    )


# ==========================
# MUTED CONVERSATIONS TABLE
# ==========================

class MutedConversation(Base):
    __tablename__ = "muted_conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    contact_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    is_muted = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_muted_lookup", "user_id", "contact_id"),
    )


# ==========================
# GROUP TABLE
# ==========================

class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ==========================
# GROUP MEMBERS TABLE
# ==========================

class GroupMember(Base):
    __tablename__ = "group_members"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    joined_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_group_members_lookup", "group_id", "user_id"),
    )


# ==========================
# GROUP MUTES TABLE
# ==========================

class GroupMute(Base):
    __tablename__ = "group_mutes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False, index=True)
    is_muted = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_group_mute_lookup", "user_id", "group_id"),
    )