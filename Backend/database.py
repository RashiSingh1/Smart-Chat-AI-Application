import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


# =========================================================
# ENVIRONMENT
# =========================================================

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set in Backend/.env"
    )


# =========================================================
# DATABASE POOL CONFIGURATION
# =========================================================

DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "10"))
DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "20"))
DB_POOL_TIMEOUT = int(os.getenv("DB_POOL_TIMEOUT", "30"))
DB_POOL_RECYCLE = int(os.getenv("DB_POOL_RECYCLE", "1800"))


# =========================================================
# ENGINE
# =========================================================

is_sqlite = DATABASE_URL.startswith("sqlite")

engine_kwargs = {
    # Detect stale/dead connections before handing them to a request.
    "pool_pre_ping": True,
}

if is_sqlite:
    # SQLite uses a different pool configuration for local development.
    engine_kwargs["connect_args"] = {
        "check_same_thread": False,
    }
else:
    # Bound the number of simultaneous DB connections.
    engine_kwargs.update(
        {
            "pool_size": DB_POOL_SIZE,
            "max_overflow": DB_MAX_OVERFLOW,
            "pool_timeout": DB_POOL_TIMEOUT,
            "pool_recycle": DB_POOL_RECYCLE,
        }
    )


engine = create_engine(
    DATABASE_URL,
    **engine_kwargs,
)


# =========================================================
# SESSION FACTORY
# =========================================================

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False,
)


# =========================================================
# ORM BASE
# =========================================================

Base = declarative_base()