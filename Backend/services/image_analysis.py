import os
from pathlib import Path
from typing import Literal

from google import genai
from pydantic import BaseModel


# ---------------------------------------------------------
# GEMINI CLIENT
# ---------------------------------------------------------

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)


# ---------------------------------------------------------
# AI RESPONSE STRUCTURE
# ---------------------------------------------------------

class ImageAnalysis(BaseModel):

    category: Literal[
        "notify",
        "digest",
        "muted"
    ]

    reason: str

    confidence: float


# ---------------------------------------------------------
# ANALYZE IMAGE
# ---------------------------------------------------------

def analyze_image(
    image_path: str,
) -> ImageAnalysis:

    path = Path(image_path)

    # -----------------------------------------------------
    # CHECK IMAGE
    # -----------------------------------------------------

    if not path.exists():

        raise FileNotFoundError(
            "Image file not found"
        )

    # -----------------------------------------------------
    # UPLOAD IMAGE TO GEMINI
    # -----------------------------------------------------

    uploaded_file = client.files.upload(
        file=str(path)
    )

    # -----------------------------------------------------
    # PROMPT
    # -----------------------------------------------------

    prompt = """
You are the AI image classification system
for a smart messaging application.

Analyze the uploaded image and classify it
into exactly ONE category.

1. notify
   - Urgent or critical information
   - Emergency situations
   - Important documents
   - OTP/security information
   - Medical emergency
   - Accident or dangerous situation
   - Time-sensitive information
   - Anything that clearly requires immediate attention

2. digest
   - Useful information
   - Normal documents
   - Screenshots containing useful information
   - Work/project information
   - Meeting or event information
   - General informational images
   - Something that can be reviewed later

3. muted
   - Casual photos
   - Memes
   - Random pictures
   - Non-important screenshots
   - Entertainment
   - Greetings or casual visual content
   - Images that normally do not require attention

Important:
- Do NOT identify a person.
- Do NOT make assumptions about private information.
- Base the classification only on visible content.
- Choose exactly one category.
- Confidence must be between 0 and 100.
- Reason must be short and clear.

Return:
- category
- reason
- confidence
"""

    # -----------------------------------------------------
    # GEMINI VISION ANALYSIS
    # -----------------------------------------------------

    response = client.models.generate_content(

        model="gemini-3.6-flash",

        contents=[
            uploaded_file,
            prompt,
        ],

        config={
            "response_mime_type": "application/json",
            "response_schema": ImageAnalysis,
        },
    )

    # -----------------------------------------------------
    # PARSE RESPONSE
    # -----------------------------------------------------

    result = ImageAnalysis.model_validate_json(
        response.text
    )

    # -----------------------------------------------------
    # SAFETY CHECK
    # -----------------------------------------------------

    if not 0 <= result.confidence <= 100:

        result.confidence = max(
            0,
            min(
                100,
                result.confidence
            )
        )

    return result