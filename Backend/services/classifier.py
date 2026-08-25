import re


# =========================================================
# CALL / CALLBACK PATTERNS
# =========================================================

CALL_PATTERNS = [
    r"\bcall me\b",
    r"\bcall\s+me\b",
    r"\bplease call\b",
    r"\bcan you call\b",
    r"\bcould you call\b",
    r"\bcan u call\b",
    r"\bpls call\b",
    r"\bplz call\b",
    r"\bcall back\b",
    r"\bcall me back\b",
]


URGENT_PATTERNS = [
    r"\burgent\b",
    r"\burgently\b",
    r"\basap\b",
    r"\bimmediately\b",
    r"\bimmediate\b",
    r"\bcritical\b",
    r"\bemergency\b",
    r"\bimportant\b",
    r"\bright now\b",
    r"\bneed you now\b",
]


def contains_pattern(text, patterns):
    return any(
        re.search(pattern, text, re.IGNORECASE)
        for pattern in patterns
    )


def classify_message(text):

    cleaned = (text or "").strip()

    if not cleaned:
        return {
            "category": "muted",
            "reason": "Message is empty.",
            "confidence": 100,
        }

    # =====================================================
    # NORMALIZED TEXT
    # =====================================================

    normalized = re.sub(
        r"\s+",
        " ",
        cleaned.lower(),
    ).strip()

    # =====================================================
    # CALL REQUEST
    # =====================================================

    is_call_request = contains_pattern(
        normalized,
        CALL_PATTERNS,
    )

    # =====================================================
    # URGENCY
    # =====================================================

    is_urgent = contains_pattern(
        normalized,
        URGENT_PATTERNS,
    )

    # =====================================================
    # CALL + URGENT
    # =====================================================

    if is_call_request and is_urgent:

        return {
            "category": "notify",
            "reason": (
                "Message contains a request to call "
                "and indicates that the matter is urgent."
            ),
            "confidence": 98,
        }

    # =====================================================
    # URGENT WITHOUT CALL
    # =====================================================

    if is_urgent:

        return {
            "category": "notify",
            "reason": (
                "Message indicates that the matter "
                "requires immediate attention."
            ),
            "confidence": 95,
        }

    # =====================================================
    # CALL REQUEST WITHOUT URGENCY
    # =====================================================

    if is_call_request:

        return {
            "category": "digest",
            "reason": (
                "Message contains a request to make "
                "a call, but does not indicate urgency."
            ),
            "confidence": 82,
        }

    # =====================================================
    # NO LOCAL MATCH
    # =====================================================

    return None