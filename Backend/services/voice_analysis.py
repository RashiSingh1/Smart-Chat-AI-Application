import os
from pathlib import Path
from typing import Literal

from google import genai
from pydantic import BaseModel


client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)


class VoiceAnalysis(BaseModel):
    category: Literal[
        "notify",
        "digest",
        "muted"
    ]
    reason: str
    confidence: float


def analyze_voice_message(
    audio_path: str,
) -> VoiceAnalysis:
    path = Path(audio_path)

    if not path.exists():
        raise FileNotFoundError(
            "Audio file not found"
        )

    uploaded_file = client.files.upload(
        file=str(path)
    )

    prompt = """
You are the AI voice message classification system for a smart messaging app.

Analyze the uploaded voice message and classify it into exactly one category:

1. notify
   - urgent/time-sensitive requests
   - OTP, payment/security warnings
   - emergencies or critical instructions
   - anything that needs immediate attention

2. digest
   - useful updates, work or meeting details
   - informational content that can be reviewed later
   - non-urgent but relevant voice updates

3. muted
   - casual chatter, greetings, jokes, and small talk
   - low-priority voice notes that do not require attention

Important:
- Base the classification only on audible content.
- Choose exactly one category.
- Confidence must be between 0 and 100.
- Reason must be short and clear.

Return:
- category
- reason
- confidence
"""

    response = client.models.generate_content(
        model="gemini-3.6-flash",
        contents=[
            uploaded_file,
            prompt,
        ],
        config={
            "response_mime_type": "application/json",
            "response_schema": VoiceAnalysis,
        },
    )

    result = VoiceAnalysis.model_validate_json(
        response.text
    )

    if not 0 <= result.confidence <= 100:
        result.confidence = max(
            0,
            min(
                100,
                result.confidence,
            ),
        )

    return result
