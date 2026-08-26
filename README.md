# Smart Chat AI

A real-time messaging platform that uses AI to triage incoming messages — so the important ones interrupt you, and the rest wait until you're ready for them.

**Live app:** https://smart-chat-ai-application-1.onrender.com
**API docs:** https://smart-chat-ai-application.onrender.com/docs

---

## Overview

Most chat apps treat every message the same, which means either you miss something urgent or you're constantly interrupted by things that could have waited. Smart Chat AI runs every incoming message through a classification layer that sorts it into **Notify** (needs attention now), **Digest** (fine to read later), or **Muted** (low-value or noise) — with a stated reason and a confidence score, not just a black-box label.

It's a full-stack build: React on the frontend, FastAPI + PostgreSQL on the backend, real-time delivery over WebSockets, and Gemini for the classification layer, handling text, image, and voice messages, 1:1 and group conversations.

---

## Engineering Highlights

A few things in this build were deliberate design decisions worth calling out, not just "the tutorial said so":

**Cost-aware AI pipeline.** An earlier version of this classification system hit Google's free-tier rate limit mid-run and lost work because of it. This version runs every message through a rule-based pre-filter and a response cache before it ever reaches the Gemini API — only genuinely ambiguous messages get a real API call — combined with a client-side rate limiter so a burst of traffic degrades gracefully instead of throwing 429s.

**Fixed an N+1 query pattern.** The conversation sidebar originally made one database query per contact just to show a last-message preview — fine with five test users, painfully slow with fifty. Replaced it with a single windowed SQL query (`ROW_NUMBER() OVER (PARTITION BY ...)`) that returns every contact's latest message in one round trip.

**WebSocket connections are authenticated, not just accepted.** The initial version accepted a WebSocket connection with a `user_id` from the URL alone — meaning anyone who guessed an ID could listen on someone else's channel. Connections now verify the JWT against the requested user ID *before* the handshake completes.

**"Muted" doesn't mean "blind."** A manually muted conversation still surfaces a message if the AI classifies it as genuinely urgent — mirroring how people actually want notifications to work: a muted group chat shouldn't bury a direct, time-sensitive mention.

**Invite-gated signup.** Since real people use the deployed instance (not just test accounts), signup requires an invite code rather than being open to anyone who finds the link.

---

## Features

**Real-time messaging** — 1:1 and group conversations, WebSocket delivery, typing indicators, online/offline presence, optimistic UI (messages appear instantly, then reconcile with the server response).

**AI classification** — every message gets a category, a plain-language reason, and a confidence score:

```json
{
  "category": "notify",
  "reason": "Message contains an urgent request.",
  "confidence": 95
}
```

**Media messages** — image and voice messages, each independently analyzed by the same classification pipeline.

**Groups** — creation, membership, group-level mute, real-time group delivery.

**Important contacts** — mark specific people so their messages are always prioritized, independent of content.

**Security** — JWT authentication (including on WebSocket connections), password hashing, WebSocket-level rate limiting, CORS restricted to known origins, database-backed authorization checks.

---

## Architecture

```text
                    React Frontend
                    (Vite, WebSocket client)
                          │
                REST API  /  WebSocket
                          │
                          ▼
                    FastAPI Backend
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   Auth (JWT)      Messaging (REST +    AI Classification
                     WebSocket)          (text/image/voice)
        │                 │                 │
        └─────────────────┼─────────────────┘
                          ▼
                  SQLAlchemy ORM
                          ▼
              PostgreSQL (Neon)
```

**Message flow:** client sends → FastAPI validates and persists → classification pipeline runs (rules → cache → Gemini) → category/reason/confidence stored alongside the message → recipient notified over their authenticated WebSocket connection in real time.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, Axios |
| Backend | FastAPI, Pydantic, SQLAlchemy |
| Real-time | WebSockets |
| Database | PostgreSQL (Neon) |
| Auth | JWT, password hashing |
| AI | Gemini (text/image/voice classification) |
| Deployment | Render (backend web service + frontend static site) |

---

## API Reference

**Auth**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/signup` | Create an account (invite-gated) |
| POST | `/login` | Authenticate, receive a JWT |
| POST | `/token` | OAuth2-compatible token endpoint (used by `/docs`) |

**Users & contacts**

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/users` | List other users |
| GET | `/important-contacts` | List important-contact settings |
| PUT | `/important-contacts/{id}` | Toggle always-notify for a contact |

**Conversations**

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/conversations` | Sidebar preview for every 1:1 contact (single query) |
| GET | `/messages/{user_id}` | Full message history with a contact |
| POST | `/messages` | Send a text message |
| POST | `/messages/image` | Send an image message |
| POST | `/messages/audio` | Send a voice message |

**Groups**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/groups` | Create a group |
| GET | `/group-conversations` | Sidebar preview for every group (single query) |
| GET | `/groups/{id}/members` | List members |
| GET / POST | `/groups/{id}/messages` | Fetch / send group messages |

**Mute**

| Method | Endpoint | Purpose |
|---|---|---|
| GET / PUT / DELETE | `/mute/{contact_id}` | Get, set, or clear a 1:1 mute |
| GET / PUT / DELETE | `/mute/group/{group_id}` | Get, set, or clear a group mute |

**WebSocket**

```
wss://<backend-domain>/ws/{user_id}?token=<JWT>
```
Rejected unless the token's subject matches `user_id`.

---

## Local Setup

**Backend**

```bash
cd Backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
```

Create `Backend/.env`:

```env
DATABASE_URL=your_neon_postgresql_url
SECRET_KEY=your_secret_key
GEMINI_API_KEY=your_gemini_key
SIGNUP_INVITE_CODE=your_invite_code
```

```bash
uvicorn main:app --reload
```

Runs at `http://127.0.0.1:8000`; interactive docs at `/docs`.

**Frontend**

```bash
cd Frontend
npm install
npm run dev
```

Set `VITE_API_URL` and `VITE_WS_URL` in `Frontend/.env` to point at the backend.

---

## Deployment

Deployed on Render: the backend as a Python web service, the frontend as a static site, PostgreSQL on Neon. The static site uses a rewrite rule (`/* → /index.html`) so client-side routes survive a direct load or refresh. Free-tier backend instances spin down after inactivity, so the first request after idle time can take up to a minute.

---

## Project Structure

```text
Smart-Chat-AI-Application/
├── Backend/
│   ├── main.py
│   ├── models.py
│   ├── schemas.py
│   ├── database.py
│   ├── auth_utils.py
│   ├── websocket_manager.py
│   └── services/
│       ├── ai_service.py
│       ├── classifier.py
│       ├── image_analysis.py
│       └── voice_analysis.py
├── Frontend/
│   ├── src/
│   ├── public/
│   └── package.json
├── .gitignore
├── README.md
└── LICENSE
```

---

## Roadmap

- Conversation-level AI summarization
- Semantic search across chat history
- Cloud object storage for media (currently local disk, which doesn't persist across free-tier redeploys)
- Precision/recall/F1 evaluation of the classification pipeline against a labeled test set
- More granular notification preferences

---

## Author

**Rashi Kumari**

- GitHub: [@RashiSingh1](https://github.com/RashiSingh1)
- LinkedIn: [linkedin.com/in/rashi-kumari-15987a321](https://www.linkedin.com/in/rashi-kumari-15987a321/)

---

## License

MIT
