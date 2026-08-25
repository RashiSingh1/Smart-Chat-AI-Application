import os
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from dotenv import load_dotenv
from jose import jwt, JWTError


# =========================================================
# ENVIRONMENT
# =========================================================

# Always load Backend/.env even if this module is imported
# directly from another file.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

load_dotenv(
    os.path.join(BASE_DIR, ".env")
)


# =========================================================
# JWT CONFIGURATION
# =========================================================

SECRET_KEY = os.getenv("SECRET_KEY")

if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY is not set in Backend/.env"
    )


# Refuse obviously weak development keys.
# A real secret should be generated randomly and kept private.
if len(SECRET_KEY) < 32:
    raise RuntimeError(
        "SECRET_KEY must be at least 32 characters long"
    )


ALGORITHM = "HS256"

# Token lifetime
ACCESS_TOKEN_EXPIRE_MINUTES = 60


# Unique application identifier for JWT tokens.
JWT_ISSUER = os.getenv(
    "JWT_ISSUER",
    "smartchat-api",
)

JWT_AUDIENCE = os.getenv(
    "JWT_AUDIENCE",
    "smartchat-client",
)


# =========================================================
# PASSWORD HASHING
# =========================================================

def hash_password(password: str) -> str:
    """
    Hash a user's password using bcrypt.

    Passwords are NEVER stored in plaintext.
    """

    if not isinstance(password, str):
        raise ValueError(
            "Password must be a string"
        )

    if not password:
        raise ValueError(
            "Password cannot be empty"
        )

    # bcrypt works with bytes
    password_bytes = password.encode("utf-8")

    # Generate a secure random salt
    salt = bcrypt.gensalt()

    # Generate bcrypt password hash
    hashed = bcrypt.hashpw(
        password_bytes,
        salt,
    )

    # Store hash as normal string in database
    return hashed.decode("utf-8")


# =========================================================
# PASSWORD VERIFICATION
# =========================================================

def verify_password(
    plain_password: str,
    hashed_password: str,
) -> bool:
    """
    Verify a plaintext password against a bcrypt hash.

    Returns:
        True  -> password is correct
        False -> password is incorrect or hash is invalid
    """

    if not plain_password:
        return False

    if not hashed_password:
        return False

    try:
        plain_password_bytes = (
            plain_password.encode("utf-8")
        )

        hashed_password_bytes = (
            hashed_password.encode("utf-8")
        )

        return bcrypt.checkpw(
            plain_password_bytes,
            hashed_password_bytes,
        )

    except (
        ValueError,
        TypeError,
        bcrypt.Error,
    ):
        return False

    except Exception:
        return False


# =========================================================
# JWT CREATION
# =========================================================

def create_access_token(data: dict) -> str:
    """
    Create a signed JWT access token.

    Required:
        data["sub"] = user ID
    """

    if not isinstance(data, dict):
        raise ValueError(
            "Token data must be a dictionary"
        )

    if "sub" not in data:
        raise ValueError(
            "JWT subject (sub) is required"
        )

    now = datetime.now(timezone.utc)

    expire = now + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    # Copy caller data so original dictionary
    # remains untouched.
    to_encode = data.copy()

    # Standard JWT claims + application-specific
    # token information.
    to_encode.update(
        {
            "iat": now,
            "exp": expire,
            "iss": JWT_ISSUER,
            "aud": JWT_AUDIENCE,
            "jti": secrets.token_urlsafe(16),
            "type": "access",
        }
    )

    return jwt.encode(
        to_encode,
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


# =========================================================
# JWT VERIFICATION
# =========================================================

def verify_token(token: str):
    """
    Verify and decode an access token.

    Returns:
        payload dict if valid
        None if invalid/expired
    """

    if not token or not isinstance(
        token,
        str,
    ):
        return None

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            issuer=JWT_ISSUER,
            audience=JWT_AUDIENCE,
        )

        # Explicitly require a subject
        subject = payload.get("sub")

        if subject is None:
            return None

        # Only accept access tokens
        if payload.get("type") != "access":
            return None

        return payload

    except JWTError:
        return None

    except Exception:
        return None