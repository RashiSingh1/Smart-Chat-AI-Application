from dotenv import load_dotenv
load_dotenv()

from services.ai_service import analyze_message


result = analyze_message(
    "Send me the OTP for Twitter urgently"
)

print(result)