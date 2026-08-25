import os
import time
from collections import deque
from threading import Lock
from typing import Literal

from google import genai
from pydantic import BaseModel

from services.classifier import classify_message


# =========================================================
# GEMINI CLIENT
# =========================================================

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    print("[GEMINI] WARNING: GEMINI_API_KEY is not configured")

client = genai.Client(
    api_key=GEMINI_API_KEY
)


# =========================================================
# AI RESPONSE STRUCTURE
# =========================================================

class MessageAnalysis(BaseModel):

    category: Literal[
        "notify",
        "digest",
        "muted",
    ]

    reason: str
    confidence: float


# =========================================================
# GEMINI RATE LIMIT
# =========================================================

# Maximum Gemini API calls allowed globally
# during the rolling time window.

GEMINI_MAX_CALLS = int(
    os.getenv(
        "GEMINI_MAX_CALLS_PER_MINUTE",
        "10",
    )
)

GEMINI_RATE_WINDOW = 60


_gemini_calls = deque()

_gemini_rate_lock = Lock()


def can_call_gemini() -> bool:
    """
    Global in-memory Gemini rate limiter.

    Example:

        GEMINI_MAX_CALLS_PER_MINUTE=10

    means maximum 10 Gemini API calls
    inside a rolling 60-second window.
    """

    now = time.monotonic()

    with _gemini_rate_lock:

        # Remove calls older than the window.
        while (
            _gemini_calls
            and now - _gemini_calls[0]
            >= GEMINI_RATE_WINDOW
        ):
            _gemini_calls.popleft()

        # Rate limit reached.
        if len(_gemini_calls) >= GEMINI_MAX_CALLS:
            return False

        # Reserve this API call.
        _gemini_calls.append(now)

        return True


# =========================================================
# SIMPLE MESSAGE CACHE
# =========================================================

# Prevent Gemini from being called repeatedly
# for exactly the same message.

CACHE_MAX_SIZE = 500

_analysis_cache = {}

_cache_lock = Lock()


def get_cached_analysis(
    text: str,
):
    key = text.strip().lower()

    with _cache_lock:
        return _analysis_cache.get(key)


def save_cached_analysis(
    text: str,
    result: MessageAnalysis,
):

    key = text.strip().lower()

    with _cache_lock:

        if len(_analysis_cache) >= CACHE_MAX_SIZE:

            # Remove oldest inserted item.
            oldest_key = next(
                iter(_analysis_cache)
            )

            del _analysis_cache[
                oldest_key
            ]

        _analysis_cache[key] = result


# =========================================================
# GEMINI ANALYSIS
# =========================================================

def analyze_with_gemini(
    text: str,
) -> MessageAnalysis:

    prompt = f"""
You are the AI classification system for a smart
messaging application.

Classify the following message into exactly ONE category.

1. notify
   - Urgent
   - Emergency
   - OTP
   - Security alert
   - Critical request
   - Immediate attention required

2. digest
   - Useful information
   - Work/project updates
   - Meeting information
   - Announcements
   - Information that can be reviewed later

3. muted
   - Casual conversation
   - Greetings
   - Small talk
   - Unimportant messages

Message:
"{text}"

Return:
- category
- short clear reason
- confidence from 0 to 100
"""

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "response_schema": MessageAnalysis,
        },
    )

    return MessageAnalysis.model_validate_json(
        response.text
    )


# =========================================================
# CHECK TRANSIENT GEMINI ERROR
# =========================================================

def is_retryable_gemini_error(
    error: Exception,
) -> bool:
    """
    Detect temporary Gemini errors such as:

        503 UNAVAILABLE
        429 RESOURCE_EXHAUSTED

    These errors can be temporary and are worth retrying.
    """

    error_text = str(error).upper()

    retryable_errors = (
        "503",
        "UNAVAILABLE",
        "429",
        "RESOURCE_EXHAUSTED",
        "SERVICE UNAVAILABLE",
        "TEMPORARILY UNAVAILABLE",
    )

    return any(
        error_code in error_text
        for error_code in retryable_errors
    )


# =========================================================
# GEMINI RETRY CONFIGURATION
# =========================================================

# Initial attempt + 2 retries = 3 total attempts.

GEMINI_MAX_ATTEMPTS = 3

GEMINI_RETRY_DELAYS = [
    1.5,
    3.0,
]


# =========================================================
# GEMINI WITH RETRY
# =========================================================

def analyze_with_gemini_retry(
    text: str,
) -> MessageAnalysis | None:

    for attempt in range(
        1,
        GEMINI_MAX_ATTEMPTS + 1,
    ):

        # -------------------------------------------------
        # RATE LIMIT CHECK
        # -------------------------------------------------

        if not can_call_gemini():

            print(
                "[GEMINI] Rate limit reached "
                f"before attempt {attempt}. "
                "Gemini NOT called."
            )

            return None


        # -------------------------------------------------
        # API CALL
        # -------------------------------------------------

        print(
            f"[GEMINI] Calling Gemini "
            f"(attempt {attempt}/{GEMINI_MAX_ATTEMPTS}) "
            f"for: {text!r}"
        )

        try:

            result = analyze_with_gemini(
                text
            )

            print(
                "[GEMINI] SUCCESS:",
                result.category,
                "|",
                result.confidence,
            )

            return result


        except Exception as error:

            print(
                f"[GEMINI ERROR] "
                f"Attempt {attempt}/{GEMINI_MAX_ATTEMPTS}:",
                repr(error),
            )


            # -------------------------------------------------
            # NON-RETRYABLE ERROR
            # -------------------------------------------------

            if not is_retryable_gemini_error(
                error
            ):

                print(
                    "[GEMINI] Non-retryable error. "
                    "Using fallback."
                )

                return None


            # -------------------------------------------------
            # RETRY
            # -------------------------------------------------

            if attempt < GEMINI_MAX_ATTEMPTS:

                delay = GEMINI_RETRY_DELAYS[
                    attempt - 1
                ]

                print(
                    f"[GEMINI] Temporary Gemini error. "
                    f"Retrying in {delay} seconds..."
                )

                time.sleep(
                    delay
                )

            else:

                print(
                    "[GEMINI] All retry attempts failed. "
                    "Using fallback."
                )


    return None


# =========================================================
# MAIN ANALYSIS FUNCTION
# =========================================================

def analyze_message(
    text: str,
) -> MessageAnalysis:

    cleaned = (
        text or ""
    ).strip()


    # =====================================================
    # EMPTY MESSAGE
    # =====================================================

    if not cleaned:

        print(
            "[AI] Empty message -> "
            "Gemini NOT called"
        )

        return MessageAnalysis(
            category="muted",
            reason="Empty message",
            confidence=100.0,
        )


    print(
        f"[AI] Analysing message: {cleaned!r}"
    )


    # =====================================================
    # 1. LOCAL CLASSIFIER
    # =====================================================

    local_result = classify_message(
        cleaned
    )


    # =====================================================
    # LOCAL RESULT FOUND
    # =====================================================

    if local_result is not None:

        result = MessageAnalysis(
            category=local_result[
                "category"
            ],
            reason=local_result[
                "reason"
            ],
            confidence=float(
                local_result[
                    "confidence"
                ]
            ),
        )

        print(
            "[LOCAL]",
            result.category,
            "|",
            result.confidence,
            "| Gemini NOT called",
        )

        return result


    # =====================================================
    # 2. CACHE CHECK
    # =====================================================

    cached = get_cached_analysis(
        cleaned
    )

    if cached is not None:

        print(
            "[CACHE] Found previous analysis "
            "| Gemini NOT called"
        )

        return cached


    print(
        "[AI] Message requires context analysis "
        "-> Gemini fallback"
    )


    # =====================================================
    # 3. GEMINI WITH RETRY
    # =====================================================

    result = analyze_with_gemini_retry(
        cleaned
    )


    # =====================================================
    # 4. GEMINI SUCCESS
    # =====================================================

    if result is not None:

        save_cached_analysis(
            cleaned,
            result,
        )

        print(
            "[CACHE] Gemini result saved"
        )

        return result


    # =====================================================
    # 5. SAFE FALLBACK
    # =====================================================

    print(
        "[AI] Gemini unavailable. "
        "Using fallback classifier."
    )

    return MessageAnalysis(
        category="digest",
        reason=(
            "AI analysis unavailable; "
            "processed with fallback classifier"
        ),
        confidence=50.0,
    )

