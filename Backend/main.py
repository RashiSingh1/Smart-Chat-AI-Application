import json
import os
import traceback
import uuid
import time
from collections import defaultdict, deque
from threading import Lock
from pathlib import Path
from typing import List

from dotenv import load_dotenv

load_dotenv()

from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.security import (
    OAuth2PasswordBearer,
    OAuth2PasswordRequestForm,
)
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, case, func

import models
from auth_utils import (
    create_access_token,
    hash_password,
    verify_password,
    verify_token,
)
from database import SessionLocal
from schemas import (
    AnalyzeRequest,
    GroupCreate,
    GroupMessageCreate,
    MessageCreate,
    MessageOut,
    UserCreate,
    UserLogin,
)
from services.ai_service import analyze_message
from services.classifier import classify_message
from services.image_analysis import analyze_image
from services.voice_analysis import analyze_voice_message
from websocket_manager import manager


# =========================================================
# APP INITIALIZATION & MIDDLEWARE
# =========================================================

app = FastAPI()

# Gzip compression for all responses > 500 bytes (boosts network throughput)
app.add_middleware(GZipMiddleware, minimum_size=500)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# UPLOADS
# =========================================================

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app.mount(
    "/uploads",
    StaticFiles(directory="uploads"),
    name="uploads",
)


# =========================================================
# OAUTH & DB DEPENDENCIES
# =========================================================

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    payload = verify_token(token)
    if payload is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid Token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=401,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=401,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


# =========================================================
# ROOT & HEALTH
# =========================================================

@app.get("/")
def root():
    return {"message": "SmartChat Backend Running 🚀"}


@app.get("/health")
def health():
    return {"status": "ok"}


# =========================================================
# AUTHENTICATION (SIGNUP / LOGIN / TOKEN)
# =========================================================


def normalize_email(email: str) -> str:
    """Normalize email consistently for signup and authentication."""
    return (email or "").strip().lower()


@app.post("/signup")
def signup(
    user: UserCreate,
    db: Session = Depends(get_db),
):
    """
    Create a new SmartChat account.

    Important:
    - Email is normalized before lookup/save.
    - Username/email duplicates are checked before INSERT.
    - Database errors are logged and returned as a useful 400/500 instead
      of silently making login fail later.
    """
    email = normalize_email(user.email)
    username = (user.username or "").strip()
    password = user.password or ""

    if not username:
        raise HTTPException(
            status_code=400,
            detail="Username is required",
        )

    if not email:
        raise HTTPException(
            status_code=400,
            detail="Email is required",
        )

    if not password:
        raise HTTPException(
            status_code=400,
            detail="Password is required",
        )

    try:
        existing_email = (
            db.query(models.User)
            .filter(models.User.email == email)
            .first()
        )

        if existing_email:
            raise HTTPException(
                status_code=400,
                detail="Email already exists",
            )

        # Username is commonly UNIQUE in the database as well, so check it
        # explicitly to avoid an opaque database IntegrityError.
        existing_username = (
            db.query(models.User)
            .filter(models.User.username == username)
            .first()
        )

        if existing_username:
            raise HTTPException(
                status_code=400,
                detail="Username already exists",
            )

        hashed_password = hash_password(password)

        if not hashed_password:
            raise RuntimeError("Password hashing returned an empty value")

        new_user = models.User(
            username=username,
            email=email,
            password_hash=hashed_password,
        )

        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        return {
            "id": new_user.id,
            "username": new_user.username,
            "email": new_user.email,
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception as exc:
        db.rollback()
        traceback.print_exc()

        # Keep the actual server traceback in the terminal, but give the
        # client a useful message for the most common database failures.
        error_text = str(exc).lower()

        if "unique" in error_text or "duplicate" in error_text:
            raise HTTPException(
                status_code=400,
                detail="Email or username already exists",
            )

        raise HTTPException(
            status_code=500,
            detail="Signup failed. Check the backend terminal for the exact error.",
        )


@app.post("/login")
def login(
    credentials: UserLogin,
    db: Session = Depends(get_db),
):
    email = normalize_email(credentials.email)
    password = credentials.password or ""

    if not email or not password:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user = (
            db.query(models.User)
            .filter(models.User.email == email)
            .first()
        )

        if not user:
            raise HTTPException(
                status_code=401,
                detail="Invalid email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        try:
            password_valid = verify_password(
                password,
                user.password_hash,
            )
        except Exception:
            traceback.print_exc()
            password_valid = False

        if not password_valid:
            raise HTTPException(
                status_code=401,
                detail="Invalid email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        access_token = create_access_token(
            {
                "sub": str(user.id),
            }
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user_id": user.id,
        }

    except HTTPException:
        raise

    except Exception:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Login failed. Check the backend terminal for the exact error.",
        )


@app.post("/token")
def token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    OAuth2 password-flow endpoint used by Swagger's Authorize button.

    OAuth2PasswordRequestForm uses the field name `username`; in this
    application that field contains the user's email address.
    """
    email = normalize_email(form_data.username)
    password = form_data.password or ""

    if not email or not password:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user = (
            db.query(models.User)
            .filter(models.User.email == email)
            .first()
        )

        if not user:
            raise HTTPException(
                status_code=401,
                detail="Invalid email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        try:
            password_valid = verify_password(
                password,
                user.password_hash,
            )
        except Exception:
            traceback.print_exc()
            password_valid = False

        if not password_valid:
            raise HTTPException(
                status_code=401,
                detail="Invalid email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        access_token = create_access_token(
            {
                "sub": str(user.id),
            }
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
        }

    except HTTPException:
        raise

    except Exception:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Token generation failed. Check the backend terminal for the exact error.",
        )


# =========================================================
# USERS & CONTACTS
# =========================================================

@app.get("/users")
def get_users(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Plain user list (no conversation data) -- kept for places like a
    "create group / pick members" screen that just need names, not
    previews. For the sidebar, use /conversations instead (single query,
    no N+1).
    """
    users = (
        db.query(models.User)
        .filter(models.User.id != current_user.id)
        .all()
    )

    return [
        {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "is_online": manager.is_online(user.id),
        }
        for user in users
    ]


@app.get("/users/search")
def search_users(
    q: str = Query("", min_length=1, max_length=50),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Search registered users for starting a new 1:1 chat."""

    term = q.strip()

    if not term:
        return []

    users = (
        db.query(models.User)
        .filter(
            models.User.id != current_user.id,
            or_(
                models.User.username.ilike(f"%{term}%"),
                models.User.email.ilike(f"%{term}%"),
            ),
        )
        .order_by(models.User.username.asc())
        .limit(20)
        .all()
    )

    return [
        {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "is_online": manager.is_online(user.id),
        }
        for user in users
    ]


@app.get("/important-contacts")
def get_important_contacts(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contacts = (
        db.query(models.ImportantContact)
        .filter(models.ImportantContact.user_id == current_user.id)
        .all()
    )

    return [
        {
            "id": contact.id,
            "user_id": contact.user_id,
            "contact_id": contact.contact_id,
            "always_notify": contact.always_notify,
            "created_at": contact.created_at,
        }
        for contact in contacts
    ]


@app.put("/important-contacts/{contact_id}")
def toggle_important_contact(
    contact_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        contact = (
            db.query(models.ImportantContact)
            .filter(
                models.ImportantContact.user_id == current_user.id,
                models.ImportantContact.contact_id == contact_id,
            )
            .first()
        )

        if not contact:
            contact = models.ImportantContact(
                user_id=current_user.id,
                contact_id=contact_id,
                always_notify=True,
            )
            db.add(contact)
        else:
            contact.always_notify = not contact.always_notify

        db.commit()
        db.refresh(contact)

        return {
            "id": contact.id,
            "contact_id": contact.contact_id,
            "always_notify": contact.always_notify,
        }
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to toggle important contact")


# =========================================================
# CONVERSATIONS (SIDEBAR, SINGLE-QUERY -- FIXES OLD N+1)
# =========================================================
#
# Previously the frontend called GET /users, then GET /messages/{id}
# ONCE PER CONTACT just to show a sidebar preview -- N+1 queries on
# every sidebar load. Both endpoints below return everything the
# sidebar needs (contact/group + their last message + AI category)
# in a single database round trip, using a window function to pick
# only the most recent message per conversation.

@app.get("/conversations")
def get_conversations(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Only users who already have a 1:1 conversation with the current user."""

    # "the other participant" depends on message direction, so it has
    # to be computed per-row before we can rank by recency per contact.
    other_user_expr = case(
        (models.Message.sender_id == current_user.id, models.Message.receiver_id),
        else_=models.Message.sender_id,
    ).label("other_user_id")

    row_number_expr = func.row_number().over(
        partition_by=other_user_expr,
        order_by=models.Message.created_at.desc(),
    ).label("rn")

    last_message_subq = (
        db.query(
            models.Message.text,
            models.Message.media_type,
            models.Message.ai_category,
            models.Message.created_at,
            other_user_expr,
            row_number_expr,
        )
        .filter(
            models.Message.group_id.is_(None),
            or_(
                models.Message.sender_id == current_user.id,
                models.Message.receiver_id == current_user.id,
            ),
        )
        .subquery()
    )

    last_message_ranked = (
        db.query(last_message_subq)
        .filter(last_message_subq.c.rn == 1)
        .subquery()
    )

    rows = (
        db.query(
            models.User.id,
            models.User.username,
            models.User.email,
            last_message_ranked.c.text,
            last_message_ranked.c.media_type,
            last_message_ranked.c.ai_category,
            last_message_ranked.c.created_at,
        )
        .join(
            last_message_ranked,
            last_message_ranked.c.other_user_id == models.User.id,
        )
        .filter(models.User.id != current_user.id)
        .all()
    )

    result = []
    for row in rows:
        media_type = row.media_type or ""
        is_image = media_type.startswith("image/")
        is_audio = media_type.startswith("audio/")

        if is_image:
            preview = "📷 Image"
        elif is_audio:
            preview = "🎙️ Voice message"
        else:
            preview = row.text or ""

        result.append(
            {
                "id": row.id,
                "username": row.username,
                "email": row.email,
                "is_online": manager.is_online(row.id),
                "last_message": preview,
                "last_message_created_at": row.created_at.isoformat() if row.created_at else None,
                "ai_category": row.ai_category,
            }
        )

    return result


@app.get("/group-conversations")
def get_group_conversations(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Every group the user is in, each with its last message (if any)."""

    row_number_expr = func.row_number().over(
        partition_by=models.Message.group_id,
        order_by=models.Message.created_at.desc(),
    ).label("rn")

    last_group_message_subq = (
        db.query(
            models.Message.group_id,
            models.Message.text,
            models.Message.media_type,
            models.Message.created_at,
            row_number_expr,
        )
        .filter(models.Message.group_id.isnot(None))
        .subquery()
    )

    last_group_message_ranked = (
        db.query(last_group_message_subq)
        .filter(last_group_message_subq.c.rn == 1)
        .subquery()
    )

    rows = (
        db.query(
            models.Group.id,
            models.Group.name,
            models.Group.created_by,
            models.Group.created_at,
            last_group_message_ranked.c.text,
            last_group_message_ranked.c.media_type,
            last_group_message_ranked.c.created_at.label("last_created_at"),
        )
        .join(models.GroupMember, models.Group.id == models.GroupMember.group_id)
        .outerjoin(
            last_group_message_ranked,
            last_group_message_ranked.c.group_id == models.Group.id,
        )
        .filter(models.GroupMember.user_id == current_user.id)
        .order_by(models.Group.created_at.desc())
        .all()
    )

    result = []
    for row in rows:
        media_type = row.media_type or ""
        is_image = media_type.startswith("image/")
        is_audio = media_type.startswith("audio/")

        if is_image:
            preview = "📷 Image"
        elif is_audio:
            preview = "🎙️ Voice message"
        else:
            preview = row.text or ""

        result.append(
            {
                "id": row.id,
                "name": row.name,
                "created_by": row.created_by,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "last_message": preview,
                "last_message_created_at": row.last_created_at.isoformat() if row.last_created_at else None,
            }
        )

    return result


# =========================================================
# GET CONVERSATION (OPTIMIZED SINGLE-PASS FETCH)
# =========================================================

@app.get("/messages/{user_id}", response_model=List[MessageOut])
def get_messages(
    user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        # 1. Fetch messages directly using compound index
        messages = (
            db.query(models.Message)
            .filter(
                or_(
                    and_(
                        models.Message.sender_id == current_user.id,
                        models.Message.receiver_id == user_id,
                    ),
                    and_(
                        models.Message.sender_id == user_id,
                        models.Message.receiver_id == current_user.id,
                    ),
                )
            )
            .order_by(models.Message.created_at.asc())
            .all()
        )

        # 2. Vectorized bulk update for unread messages
        db.query(models.Message).filter(
            models.Message.sender_id == user_id,
            models.Message.receiver_id == current_user.id,
            models.Message.is_read == False,
        ).update({"is_read": True}, synchronize_session=False)

        db.commit()
        return messages

    except Exception:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to get messages")


# =========================================================
# SEND TEXT MESSAGE
# =========================================================

@app.post("/messages")
async def send_message(
    message: MessageCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        receiver = db.query(models.User).filter(models.User.id == message.receiver_id).first()
        if not receiver:
            raise HTTPException(status_code=404, detail="Receiver not found")

        # AI Classification with Fast Heuristics
        ai_result = analyze_message(message.text)

        # Important Contact Override
        important_contact = (
            db.query(models.ImportantContact)
            .filter(
                models.ImportantContact.user_id == message.receiver_id,
                models.ImportantContact.contact_id == current_user.id,
                models.ImportantContact.always_notify == True,
            )
            .first()
        )

        if important_contact:
            ai_category = "notify"
            ai_reason = "Sender is marked as an important contact."
            ai_confidence = 100.0
        else:
            ai_category = ai_result.category
            ai_reason = ai_result.reason
            ai_confidence = ai_result.confidence

        new_message = models.Message(
            sender_id=current_user.id,
            receiver_id=message.receiver_id,
            group_id=None,
            text=message.text,
            is_read=False,
            ai_category=ai_category,
            ai_reason=ai_reason,
            ai_confidence=ai_confidence,
        )

        db.add(new_message)
        db.commit()
        db.refresh(new_message)

        # WebSocket Broadcast
        await manager.send_personal_message(
            message.receiver_id,
            {
                "type": "message",
                "id": new_message.id,
                "sender_id": new_message.sender_id,
                "sender_username": current_user.username,
                "receiver_id": new_message.receiver_id,
                "text": new_message.text,
                "created_at": new_message.created_at.isoformat() if new_message.created_at else None,
                "ai_category": new_message.ai_category,
                "ai_reason": new_message.ai_reason,
                "ai_confidence": new_message.ai_confidence,
            },
        )

        return {
            "message": "Message Sent",
            "id": new_message.id,
            "sender_id": current_user.id,
            "sender_username": current_user.username,
            "ai_category": new_message.ai_category,
            "ai_reason": new_message.ai_reason,
            "ai_confidence": new_message.ai_confidence,
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to send message")


# =========================================================
# MUTE CONVERSATIONS
# =========================================================

@app.get("/mute/{contact_id}")
def get_mute_status(
    contact_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    muted_conversation = (
        db.query(models.MutedConversation)
        .filter(
            models.MutedConversation.user_id == current_user.id,
            models.MutedConversation.contact_id == contact_id,
            models.MutedConversation.is_muted == True,
        )
        .first()
    )

    return {
        "contact_id": contact_id,
        "is_muted": muted_conversation is not None,
    }


@app.put("/mute/{contact_id}")
def mute_conversation(
    contact_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        existing = (
            db.query(models.MutedConversation)
            .filter(
                models.MutedConversation.user_id == current_user.id,
                models.MutedConversation.contact_id == contact_id,
            )
            .first()
        )

        if existing:
            existing.is_muted = True
        else:
            new_mute = models.MutedConversation(
                user_id=current_user.id,
                contact_id=contact_id,
                is_muted=True,
            )
            db.add(new_mute)

        db.commit()
        return {"message": "Conversation muted", "contact_id": contact_id, "is_muted": True}
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to mute conversation")


@app.delete("/mute/{contact_id}")
def unmute_conversation(
    contact_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        muted_conversation = (
            db.query(models.MutedConversation)
            .filter(
                models.MutedConversation.user_id == current_user.id,
                models.MutedConversation.contact_id == contact_id,
            )
            .first()
        )

        if muted_conversation:
            db.delete(muted_conversation)
            db.commit()

        return {"message": "Conversation unmuted", "contact_id": contact_id, "is_muted": False}
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to unmute conversation")


# =========================================================
# GROUPS & GROUP MESSAGES
# =========================================================

@app.post("/groups")
def create_group(
    group_data: GroupCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        group_name = group_data.name.strip()
        if not group_name:
            raise HTTPException(status_code=400, detail="Group name is required")

        member_ids = list(set([int(uid) for uid in group_data.member_ids] + [current_user.id]))

        group = models.Group(name=group_name, created_by=current_user.id)
        db.add(group)
        db.commit()
        db.refresh(group)

        members = [models.GroupMember(group_id=group.id, user_id=uid) for uid in member_ids]
        db.bulk_save_objects(members)
        db.commit()

        return {
            "message": "Group created successfully",
            "group_id": group.id,
            "name": group.name,
            "created_by": group.created_by,
            "member_ids": member_ids,
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create group")


@app.get("/groups")
def get_my_groups(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Plain group list (no message previews) -- kept for any UI that just
    needs the list itself. For the sidebar, use /group-conversations
    instead (single query, no N+1).
    """
    groups = (
        db.query(models.Group)
        .join(models.GroupMember, models.Group.id == models.GroupMember.group_id)
        .filter(models.GroupMember.user_id == current_user.id)
        .order_by(models.Group.created_at.desc())
        .all()
    )

    return [
        {
            "id": group.id,
            "name": group.name,
            "created_by": group.created_by,
            "created_at": group.created_at.isoformat() if group.created_at else None,
        }
        for group in groups
    ]


@app.get("/groups/{group_id}/messages")
def get_group_messages(
    group_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        group = db.query(models.Group).filter(models.Group.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        messages = (
            db.query(models.Message)
            .filter(models.Message.group_id == group_id)
            .order_by(models.Message.created_at.asc())
            .all()
        )

        sender_ids = {msg.sender_id for msg in messages}
        sender_users = (
            db.query(models.User).filter(models.User.id.in_(sender_ids)).all()
            if sender_ids
            else []
        )
        sender_map = {u.id: u.username for u in sender_users}

        return [
            {
                "id": message.id,
                "group_id": message.group_id,
                "group_name": group.name,
                "sender_id": message.sender_id,
                "sender_username": sender_map.get(message.sender_id, "Unknown"),
                "receiver_id": message.receiver_id,
                "text": message.text,
                "media_type": message.media_type,
                "media_url": message.media_url,
                "is_read": message.is_read,
                "created_at": message.created_at.isoformat() if message.created_at else None,
                "ai_category": message.ai_category,
                "ai_reason": message.ai_reason,
                "ai_confidence": message.ai_confidence,
            }
            for message in messages
        ]
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to get group messages")


@app.post("/groups/{group_id}/messages")
async def send_group_message(
    group_id: int,
    message: GroupMessageCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send a text message to a group.

    This route is intentionally separate from the 1-to-1 /messages route.
    It validates group membership, stores the message with group_id, runs
    the same AI classification used by direct messages, and broadcasts the
    created message to every other group member over WebSocket.
    """
    try:
        # -----------------------------------------------------
        # 1. Validate group
        # -----------------------------------------------------
        group = (
            db.query(models.Group)
            .filter(models.Group.id == group_id)
            .first()
        )

        if not group:
            raise HTTPException(
                status_code=404,
                detail="Group not found",
            )

        # -----------------------------------------------------
        # 2. Validate that sender belongs to the group
        # -----------------------------------------------------
        membership = (
            db.query(models.GroupMember)
            .filter(
                models.GroupMember.group_id == group_id,
                models.GroupMember.user_id == current_user.id,
            )
            .first()
        )

        if not membership:
            raise HTTPException(
                status_code=403,
                detail="You are not a member of this group",
            )

        # -----------------------------------------------------
        # 3. Validate message text
        # -----------------------------------------------------
        text = (message.text or "").strip()

        if not text:
            raise HTTPException(
                status_code=400,
                detail="Message text cannot be empty",
            )

        # -----------------------------------------------------
        # 4. AI classification
        # -----------------------------------------------------
        try:
            ai_result = analyze_message(text)
            ai_category = ai_result.category
            ai_reason = ai_result.reason
            ai_confidence = ai_result.confidence
        except Exception:
            traceback.print_exc()
            ai_category = "digest"
            ai_reason = "Group message received"
            ai_confidence = 0.0

        # -----------------------------------------------------
        # 5. Save message
        # -----------------------------------------------------
        new_message = models.Message(
            sender_id=current_user.id,
            receiver_id=None,
            group_id=group_id,
            text=text,
            media_type=None,
            media_url=None,
            is_read=False,
            ai_category=ai_category,
            ai_reason=ai_reason,
            ai_confidence=ai_confidence,
        )

        db.add(new_message)
        db.commit()
        db.refresh(new_message)

        created_at = (
            new_message.created_at.isoformat()
            if new_message.created_at
            else None
        )

        # -----------------------------------------------------
        # 6. Payload used by the frontend WebSocket listener
        # -----------------------------------------------------
        websocket_payload = {
            "type": "group_message",
            "id": new_message.id,
            "group_id": group_id,
            "group_name": group.name,
            "sender_id": current_user.id,
            "sender_username": current_user.username,
            "receiver_id": None,
            "text": new_message.text,
            "media_type": None,
            "media_url": None,
            "created_at": created_at,
            "ai_category": new_message.ai_category,
            "ai_reason": new_message.ai_reason,
            "ai_confidence": new_message.ai_confidence,
        }

        # -----------------------------------------------------
        # 7. Broadcast to every OTHER member of the group
        # -----------------------------------------------------
        group_members = (
            db.query(models.GroupMember)
            .filter(models.GroupMember.group_id == group_id)
            .all()
        )

        for member in group_members:
            if int(member.user_id) == int(current_user.id):
                continue

            try:
                await manager.send_personal_message(
                    int(member.user_id),
                    websocket_payload,
                )
            except Exception:
                # A disconnected member should not make the sender's
                # message fail after it has already been saved.
                traceback.print_exc()

        # -----------------------------------------------------
        # 8. Return the created message to Chat.jsx
        # -----------------------------------------------------
        return {
            "message": "Group message sent",
            "id": new_message.id,
            "group_id": group_id,
            "group_name": group.name,
            "sender_id": current_user.id,
            "sender_username": current_user.username,
            "receiver_id": None,
            "text": new_message.text,
            "media_type": None,
            "media_url": None,
            "created_at": created_at,
            "ai_category": new_message.ai_category,
            "ai_reason": new_message.ai_reason,
            "ai_confidence": new_message.ai_confidence,
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Failed to send group message",
        )


@app.get("/groups/{group_id}/members")
def get_group_members(
    group_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    members = (
        db.query(models.User)
        .join(models.GroupMember, models.User.id == models.GroupMember.user_id)
        .filter(models.GroupMember.group_id == group_id)
        .all()
    )

    return [
        {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "is_online": manager.is_online(user.id),
        }
        for user in members
    ]


@app.get("/mute/group/{group_id}")
def get_group_mute_status(
    group_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    muted = (
        db.query(models.GroupMute)
        .filter(
            models.GroupMute.user_id == current_user.id,
            models.GroupMute.group_id == group_id,
            models.GroupMute.is_muted == True,
        )
        .first()
    )

    return {
        "group_id": group_id,
        "is_muted": muted is not None,
    }


@app.put("/mute/group/{group_id}")
def mute_group(
    group_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        existing = (
            db.query(models.GroupMute)
            .filter(
                models.GroupMute.user_id == current_user.id,
                models.GroupMute.group_id == group_id,
            )
            .first()
        )

        if existing:
            existing.is_muted = True
        else:
            db.add(models.GroupMute(user_id=current_user.id, group_id=group_id, is_muted=True))

        db.commit()
        return {"message": "Group muted", "group_id": group_id, "is_muted": True}
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to mute group")


@app.delete("/mute/group/{group_id}")
def unmute_group(
    group_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        muted = (
            db.query(models.GroupMute)
            .filter(
                models.GroupMute.user_id == current_user.id,
                models.GroupMute.group_id == group_id,
            )
            .first()
        )

        if muted:
            db.delete(muted)
            db.commit()

        return {"message": "Group unmuted", "group_id": group_id, "is_muted": False}
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to unmute group")


# =========================================================
# FILE UPLOADS & MEDIA MESSAGES
# =========================================================

@app.post("/upload-audio")
async def upload_audio(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
):
    extension = Path(file.filename or "").suffix or ".webm"
    filename = f"{uuid.uuid4()}{extension}"
    file_path = UPLOAD_DIR / filename

    with open(file_path, "wb") as buffer:
        while chunk := await file.read(1024 * 1024):
            buffer.write(chunk)

    return {
        "message": "Audio uploaded successfully",
        "media_type": file.content_type,
        "media_url": f"/uploads/{filename}",
    }


@app.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
):
    extension = Path(file.filename or "").suffix.lower() or ".jpg"
    filename = f"{uuid.uuid4()}{extension}"
    file_path = UPLOAD_DIR / filename

    with open(file_path, "wb") as buffer:
        while chunk := await file.read(1024 * 1024):
            buffer.write(chunk)

    return {
        "message": "Image uploaded successfully",
        "media_type": file.content_type,
        "media_url": f"/uploads/{filename}",
    }


@app.post("/messages/audio")
async def send_audio_message(
    receiver_id: int = Form(...),
    media_type: str = Form(...),
    media_url: str = Form(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    audio_path = UPLOAD_DIR / Path(media_url).name
    try:
        ai_result = analyze_voice_message(str(audio_path))
        ai_category, ai_reason, ai_confidence = ai_result.category, ai_result.reason, ai_result.confidence
    except Exception:
        ai_category, ai_reason, ai_confidence = "digest", "Voice message received", 0.0

    new_message = models.Message(
        sender_id=current_user.id,
        receiver_id=receiver_id,
        group_id=None,
        text="",
        media_type=media_type,
        media_url=media_url,
        is_read=False,
        ai_category=ai_category,
        ai_reason=ai_reason,
        ai_confidence=ai_confidence,
    )
    db.add(new_message)
    db.commit()
    db.refresh(new_message)

    await manager.send_personal_message(
        receiver_id,
        {
            "type": "message",
            "id": new_message.id,
            "sender_id": new_message.sender_id,
            "sender_username": current_user.username,
            "receiver_id": new_message.receiver_id,
            "text": new_message.text,
            "media_type": new_message.media_type,
            "media_url": new_message.media_url,
            "created_at": new_message.created_at.isoformat() if new_message.created_at else None,
            "ai_category": new_message.ai_category,
            "ai_reason": new_message.ai_reason,
            "ai_confidence": new_message.ai_confidence,
        },
    )

    return {
        "message": "Voice message sent",
        "id": new_message.id,
        "sender_id": current_user.id,
        "sender_username": current_user.username,
        "media_type": new_message.media_type,
        "media_url": new_message.media_url,
        "ai_category": new_message.ai_category,
        "ai_reason": new_message.ai_reason,
        "ai_confidence": new_message.ai_confidence,
    }


@app.post("/messages/image")
async def send_image_message(
    receiver_id: int = Form(...),
    media_type: str = Form(...),
    media_url: str = Form(...),
    text: str = Form(""),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    image_path = UPLOAD_DIR / Path(media_url).name
    try:
        ai_result = analyze_image(str(image_path))
        ai_category, ai_reason, ai_confidence = ai_result.category, ai_result.reason, ai_result.confidence
    except Exception:
        ai_category, ai_reason, ai_confidence = "digest", "Image received", 0.0

    new_message = models.Message(
        sender_id=current_user.id,
        receiver_id=receiver_id,
        group_id=None,
        text=(text or "").strip(),
        media_type=media_type,
        media_url=media_url,
        is_read=False,
        ai_category=ai_category,
        ai_reason=ai_reason,
        ai_confidence=ai_confidence,
    )
    db.add(new_message)
    db.commit()
    db.refresh(new_message)

    await manager.send_personal_message(
        receiver_id,
        {
            "type": "message",
            "id": new_message.id,
            "sender_id": new_message.sender_id,
            "sender_username": current_user.username,
            "receiver_id": new_message.receiver_id,
            "text": new_message.text,
            "media_type": new_message.media_type,
            "media_url": new_message.media_url,
            "created_at": new_message.created_at.isoformat() if new_message.created_at else None,
            "ai_category": new_message.ai_category,
            "ai_reason": new_message.ai_reason,
            "ai_confidence": new_message.ai_confidence,
        },
    )

    return {
        "message": "Image message sent",
        "id": new_message.id,
        "sender_id": current_user.id,
        "sender_username": current_user.username,
        "text": new_message.text,
        "media_type": new_message.media_type,
        "media_url": new_message.media_url,
        "ai_category": new_message.ai_category,
        "ai_reason": new_message.ai_reason,
        "ai_confidence": new_message.ai_confidence,
    }


# =========================================================
# WEBSOCKET RATE LIMITING
# =========================================================

# Maximum incoming WebSocket events allowed per authenticated user
# during a rolling window. This protects the socket from spam/abuse
# without affecting normal chat usage.
WS_MAX_EVENTS_PER_MINUTE = int(
    os.getenv("WS_MAX_EVENTS_PER_MINUTE", "120")
)
WS_RATE_WINDOW = 60

_ws_events = defaultdict(deque)
_ws_rate_lock = Lock()


def allow_websocket_event(user_id: int) -> bool:
    """Return True when this user is below the WebSocket event limit."""
    now = time.monotonic()

    with _ws_rate_lock:
        events = _ws_events[user_id]

        while events and now - events[0] >= WS_RATE_WINDOW:
            events.popleft()

        if len(events) >= WS_MAX_EVENTS_PER_MINUTE:
            return False

        events.append(now)
        return True


def cleanup_websocket_rate_limit(user_id: int) -> None:
    """Remove empty rate-limit state after a socket disconnects."""
    with _ws_rate_lock:
        events = _ws_events.get(user_id)
        if events is not None and not events:
            _ws_events.pop(user_id, None)


# =========================================================
# WEBSOCKET
# =========================================================

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: int,
):
    # ---------------------------------------------------------
    # 1. Authenticate socket before accepting it
    # ---------------------------------------------------------
    token = websocket.query_params.get("token")

    if not token:
        await websocket.close(
            code=1008,
            reason="Authentication token required",
        )
        return

    payload = verify_token(token)

    if payload is None:
        await websocket.close(
            code=1008,
            reason="Invalid authentication token",
        )
        return

    try:
        authenticated_user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        await websocket.close(
            code=1008,
            reason="Invalid token payload",
        )
        return

    if authenticated_user_id != user_id:
        await websocket.close(
            code=1008,
            reason="User ID does not match token",
        )
        return

    await manager.connect(
        authenticated_user_id,
        websocket,
    )

    print(
        f"[WS] Connected: user={authenticated_user_id}"
    )

    try:
        while True:
            # -------------------------------------------------
            # 2. WebSocket abuse/rate-limit protection
            # -------------------------------------------------
            if not allow_websocket_event(
                authenticated_user_id
            ):
                print(
                    f"[WS RATE LIMIT] user={authenticated_user_id} "
                    f"exceeded {WS_MAX_EVENTS_PER_MINUTE} events/minute"
                )

                await websocket.send_json(
                    {
                        "type": "rate_limit",
                        "message": (
                            "Too many WebSocket requests. "
                            "Please slow down."
                        ),
                    }
                )

                await websocket.close(
                    code=1008,
                    reason="WebSocket rate limit exceeded",
                )
                break

            # -------------------------------------------------
            # 3. Receive event
            # -------------------------------------------------
            data = await websocket.receive_text()

            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                print(
                    f"[WS] Invalid JSON from user={authenticated_user_id}"
                )
                continue

            if not isinstance(message, dict):
                continue

            message_type = message.get("type")

            # -------------------------------------------------
            # 4. Typing event
            # -------------------------------------------------
            if message_type == "typing":
                receiver_id = message.get("receiver_id")

                try:
                    receiver_id = int(receiver_id)
                except (TypeError, ValueError):
                    continue

                if receiver_id <= 0:
                    continue

                await manager.send_personal_message(
                    receiver_id,
                    {
                        "type": "typing",
                        "sender_id": authenticated_user_id,
                        "receiver_id": receiver_id,
                    },
                )
                continue

            # -------------------------------------------------
            # 5. Message event
            # -------------------------------------------------
            if message_type == "message":
                receiver_id = message.get("receiver_id")

                try:
                    receiver_id = int(receiver_id)
                except (TypeError, ValueError):
                    continue

                if receiver_id <= 0:
                    continue

                await manager.send_personal_message(
                    receiver_id,
                    {
                        "type": "message",
                        "sender_id": authenticated_user_id,
                        "receiver_id": receiver_id,
                        "text": message.get("text"),
                        "media_type": message.get("media_type"),
                        "media_url": message.get("media_url"),
                        "created_at": message.get("created_at"),
                        "ai_category": message.get("ai_category"),
                        "ai_reason": message.get("ai_reason"),
                        "ai_confidence": message.get("ai_confidence"),
                    },
                )
                continue

    except WebSocketDisconnect:
        print(
            f"[WS] Disconnected: user={authenticated_user_id}"
        )

    except Exception:
        traceback.print_exc()

    finally:
        await manager.disconnect(
            authenticated_user_id,
            websocket,
        )
        cleanup_websocket_rate_limit(
            authenticated_user_id
        )
