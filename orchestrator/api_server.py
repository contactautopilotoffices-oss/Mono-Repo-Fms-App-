"""
Cassandra Orchestrator API Server — Simplified for Go-Live
==========================================================

FastAPI server. One endpoint that matters: /chat/stream
Auth: Simple membership-based session tokens.
Deploy: `uvicorn cassandra.orchestrator.api_server:app --host 0.0.0.0 --port $PORT`

Architecture:
    Mobile App → Python API (this file)
                     ↓
              Query Queue (background worker)
                     ↓
              LLM Orchestrator (GPT-4o)
                     ↓
              Tool Execution (query_tickets, sql_query, create_ticket)
"""

from __future__ import annotations

import os
import sys

# Load .env from project root
_project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_env_file = os.path.join(_project_root, ".env.shared.local")
if not os.path.exists(_env_file):
    _env_file = os.path.join(_project_root, ".env")
if os.path.exists(_env_file):
    with open(_env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())

import base64
import json
import logging
import time
import uuid
from typing import Any, List, Optional

import asyncio
import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# SQLite for chat session persistence
from sqlalchemy import Column, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

# ---------------------------------------------------------------------------
# Auto-sync schema at import time (before any SQL tool loads it)
# ---------------------------------------------------------------------------
from cassandra.tools.schema_sync import sync_schema

_schema_updated = sync_schema()

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("cassandra.api")

# ---------------------------------------------------------------------------
# SQLite — Chat Session Storage
# ---------------------------------------------------------------------------

_db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cassandra_sessions.db")
_engine = create_engine(f"sqlite:///{_db_path}", connect_args={"check_same_thread": False})
_SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


class _Base(DeclarativeBase):
    pass


class _ChatSession(_Base):
    __tablename__ = "chat_sessions"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, index=True, nullable=False)
    org_id = Column(String, index=True, nullable=False)
    property_id = Column(String, nullable=True)
    title = Column(String, default="New Chat")
    created_at = Column(Integer, default=lambda: int(time.time()))
    updated_at = Column(Integer, default=lambda: int(time.time()))


class _ChatMessage(_Base):
    __tablename__ = "chat_messages"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, index=True, nullable=False)
    role = Column(String, nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(Integer, default=lambda: int(time.time()))


_Base.metadata.create_all(bind=_engine)


def get_db():
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

# FMS Supabase — where tickets, properties, memberships live
FMS_SUPABASE_URL = os.environ.get(
    "FMS_SUPABASE_URL",
    os.environ.get("AUTH_SUPABASE_URL", os.environ.get("EXPO_PUBLIC_SUPABASE_URL", "")),
)
FMS_SUPABASE_SERVICE_ROLE_KEY = os.environ.get(
    "FMS_SUPABASE_SERVICE_ROLE_KEY",
    os.environ.get("AUTH_SUPABASE_SERVICE_ROLE_KEY", ""),
)

# ---------------------------------------------------------------------------
# Auth — Simple Session Tokens (NO JWT, NO JWKS, NO complexity)
# ---------------------------------------------------------------------------
# Flow:
#   1. Mobile calls POST /cassandra/session {user_id, property_id}
#   2. Server validates property_memberships in FMS Supabase
#   3. Server returns session_token (base64-encoded user/org/property/expiry)
#   4. Mobile sends session_token as Bearer on all calls
#   5. Server decodes token, uses embedded IDs — NO further lookups needed
# ---------------------------------------------------------------------------


def encode_session_token(user_id: str, org_id: str, property_id: str, role: str = "tenant", ttl: int = 21600) -> str:
    """Encode a session token. Base64 JSON. 6-hour default TTL."""
    payload = {
        "u": user_id,
        "o": org_id,
        "p": property_id,
        "r": role,
        "e": int(time.time()) + ttl,
    }
    return base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")


def decode_session_token(token: str) -> Optional[dict]:
    """Decode session token. Returns dict or None if invalid/expired."""
    try:
        # Add padding
        padding = 4 - (len(token) % 4)
        if padding != 4:
            token += "=" * padding
        payload = json.loads(base64.urlsafe_b64decode(token.encode()).decode())
        if payload.get("e", 0) < time.time():
            return None  # Expired
        return {
            "user_id": payload["u"],
            "org_id": payload["o"],
            "property_id": payload.get("p", ""),
            "role": payload.get("r", "tenant"),
        }
    except Exception:
        return None


async def validate_membership(user_id: str, property_id: str) -> Optional[dict]:
    """Validate user belongs to property via FMS Supabase property_memberships."""
    if not FMS_SUPABASE_URL or not FMS_SUPABASE_SERVICE_ROLE_KEY:
        logger.error("[AUTH] FMS Supabase not configured")
        return None

    url = f"{FMS_SUPABASE_URL}/rest/v1/property_memberships"
    headers = {
        "apikey": FMS_SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {FMS_SUPABASE_SERVICE_ROLE_KEY}",
        "Accept": "application/json",
    }
    params = {
        "select": "organization_id,properties(name),organizations(name,organization_members(role))",
        "user_id": f"eq.{user_id}",
        "property_id": f"eq.{property_id}",
        "limit": "1",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers, params=params)
        if resp.status_code == 200:
            data = resp.json()
            if data and len(data) > 0:
                return data[0]
        return None
    except Exception as exc:
        logger.error(f"[AUTH] Membership validation error: {exc}")
        return None


def resolve_auth(request: Request) -> dict:
    """
    Resolve identity from request.

    Returns dict with user_id, org_id, property_id, role.
    Raises HTTPException(401) if invalid.
    """
    auth_header = request.headers.get("authorization", "")
    token = auth_header.replace("Bearer ", "").strip()

    if not token:
        raise HTTPException(status_code=401, detail="Missing session token. Call POST /cassandra/session first.")

    session = decode_session_token(token)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session token. Re-authenticate via POST /cassandra/session.")

    return session


# ---------------------------------------------------------------------------
# Query Queue
# ---------------------------------------------------------------------------

from cassandra.queue.query_queue import QueryQueue, QueuedJob, init_queue

query_queue = init_queue(max_workers=1)

# ---------------------------------------------------------------------------
# LLM Orchestrator
# ---------------------------------------------------------------------------

_orchestrator = None


def get_orchestrator():
    global _orchestrator
    if _orchestrator is None:
        from cassandra.llm.orchestrator import LLMOrchestrator
        _orchestrator = LLMOrchestrator()
    return _orchestrator


def queue_handler(job: QueuedJob) -> dict:
    """Process a queued chat job."""
    orch = get_orchestrator()
    ctx = job.context
    return orch.run(
        message=job.message,
        org_id=ctx.get("org_id", ""),
        user_id=ctx.get("user_id", ""),
        property_id=ctx.get("property_id", ""),  # Added 2026-06-01
        role=ctx.get("role", "tenant"),
        photo_url=ctx.get("photo_url"),
        conversation_history=ctx.get("conversation_history"),
        allowed_property_ids=ctx.get("allowed_property_ids"),
        property_metadata=ctx.get("property_metadata"),
    )


# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------

app = FastAPI(title="Cassandra API", version="3.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    # Log schema sync status (actual sync happens at import time)
    from cassandra.tools.schema_sync import get_table_count
    logger.info(f"[STARTUP] Schema synced: {get_table_count()} tables from database.types.ts")
    query_queue.start_worker(queue_handler)
    logger.info("[STARTUP] Queue worker started")


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class StreamChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    context: dict[str, Any] = Field(default_factory=dict)
    conversation_history: list[dict[str, Any]] = Field(default_factory=list)
    photo_url: Optional[str] = None


class SimpleSessionRequest(BaseModel):
    user_id: str
    property_id: str


class SimpleSessionResponse(BaseModel):
    session_token: str
    org_id: str
    property_id: str
    user_id: str
    role: Optional[str] = None
    expires_at: int
    org_name: Optional[str] = None
    property_name: Optional[str] = None


# ---------------------------------------------------------------------------
# SSE Helper
# ---------------------------------------------------------------------------

def sse_format(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "cassandra",
        "version": "3.1.0",
        "queue": query_queue.get_queue_stats(),
    }


@app.get("/")
async def root():
    return {"service": "Cassandra", "status": "running", "version": "3.1.0"}


# ─── Auth: Simple Session ─────────────────────────────────────────────────────

@app.post("/cassandra/session", response_model=SimpleSessionResponse)
async def create_session_token(req: SimpleSessionRequest):
    """
    Create a session token via membership validation.

    Mobile calls this after user selects a property.
    Returns a session_token used as Bearer for all subsequent calls.
    """
    membership = await validate_membership(req.user_id, req.property_id)
    if not membership:
        raise HTTPException(status_code=401, detail="User does not belong to this property")

    org_id = membership.get("organization_id", "")
    # role lives in organization_members, not property_memberships
    role = "member"
    try:
        org_members = (membership.get("organizations") or {}).get("organization_members") or []
        if org_members:
            role = org_members[0].get("role", "member")
    except Exception:
        pass
    org_name = None
    property_name = None

    if isinstance(membership.get("organizations"), dict):
        org_name = membership["organizations"].get("name")
    if isinstance(membership.get("properties"), dict):
        property_name = membership["properties"].get("name")

    if not org_id:
        raise HTTPException(status_code=500, detail="Membership has no organization_id")

    ttl = int(os.environ.get("SESSION_TTL_SECONDS", "21600"))
    token = encode_session_token(req.user_id, org_id, req.property_id, role, ttl)

    logger.info(f"[AUTH] Session created: user={req.user_id[:8]}... org={org_id[:8]}... property={req.property_id[:8]}...")

    return SimpleSessionResponse(
        session_token=token,
        org_id=org_id,
        property_id=req.property_id,
        user_id=req.user_id,
        role=role,
        expires_at=int(time.time()) + ttl,
        org_name=org_name,
        property_name=property_name,
    )


# ─── Chat: Streaming (Main Endpoint) ──────────────────────────────────────────

@app.post("/chat/stream")
async def chat_stream(request: Request):
    """
    Streaming chat via SSE. The main endpoint mobile uses.

    Auth: Bearer session_token from /cassandra/session
    Body: { message, context, conversation_history, photo_url }
    """
    # Auth
    identity = resolve_auth(request)
    org_id = identity["org_id"]
    user_id = identity["user_id"]
    property_id = identity.get("property_id", "")
    role = identity.get("role", "tenant")

    # Parse body
    body = await request.json()
    message = body.get("message", "").strip()
    if not message:
        return StreamingResponse(
            iter([sse_format("error", {"code": "EMPTY_MESSAGE", "message": "Message is required"})]),
            media_type="text/event-stream",
            status_code=400,
        )

    context_from_body = body.get("context", {})
    conversation_history = body.get("conversation_history", [])
    photo_url = body.get("photo_url")

    logger.info(f"[CHAT] stream: '{message[:60]}' user={user_id[:8]}... org={org_id[:8]}...")

    # Enqueue
    try:
        job_id = query_queue.enqueue(
            message=message,
            context={
                "org_id": org_id,
                "user_id": user_id,
                "role": role,
                "property_id": property_id,
                "photo_url": photo_url,
                "conversation_history": conversation_history,
                "allowed_property_ids": context_from_body.get("allowed_property_ids", [property_id] if property_id else []),
                "property_metadata": context_from_body.get("property_metadata", {}),
            },
        )
    except Exception as exc:
        return StreamingResponse(
            iter([sse_format("error", {"code": "QUEUE_ERROR", "message": str(exc)})]),
            media_type="text/event-stream",
            status_code=503,
        )

    # Stream results as SSE
    async def event_generator():
        import re
        max_wait = 120
        waited = 0.0

        while waited < max_wait:
            await asyncio.sleep(0.5)
            waited += 0.5

            job = query_queue.get_job(job_id)
            if not job:
                yield sse_format("error", {"code": "JOB_NOT_FOUND", "message": "Job expired"})
                break

            if job.status == "queued":
                yield sse_format("queued", {"job_id": job_id, "message": "Queued..."})
            elif job.status == "processing":
                yield sse_format("processing", {"job_id": job_id, "message": "Cassandra is thinking..."})
            elif job.status == "done":
                result = job.result or {}
                response = result.get("response", "")

                # Stream reasoning
                reasoning_steps = re.findall(r"<reasoning>(.*?)</reasoning>", response, re.DOTALL)
                for step in reasoning_steps:
                    if step.strip():
                        yield sse_format("reasoning", {"message": step.strip()})

                # Stream answer (without reasoning tags)
                clean = re.sub(r"<reasoning>.*?</reasoning>", "", response, flags=re.DOTALL).strip()
                # Stream word-by-word for typing effect
                words = clean.split()
                chunk_size = 5  # Send 5 words at a time for smoother streaming
                for i in range(0, len(words), chunk_size):
                    chunk = " ".join(words[i:i + chunk_size]) + " "
                    yield sse_format("answer", {"token": chunk})

                # Tool results
                for tr in result.get("tool_results", []):
                    yield sse_format("tool_result", {
                        "tool": tr.get("tool_name", ""),
                        "success": tr.get("success", False),
                    })

                # Done
                yield sse_format("done", {
                    "response": response,
                    "tool_results": result.get("tool_results", []),
                    "confidence": result.get("confidence", 0.0),
                })
                break

            elif job.status == "failed":
                yield sse_format("error", {"code": "FAILED", "message": job.error or "Unknown error"})
                break
        else:
            yield sse_format("error", {"code": "TIMEOUT", "message": "Request timed out (120s)"})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


# ─── Chat: Non-Streaming ──────────────────────────────────────────────────────

@app.post("/chat")
async def chat(request: Request):
    """Non-streaming chat. Returns full response after processing."""
    identity = resolve_auth(request)

    body = await request.json()
    message = body.get("message", "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required")

    context_from_body = body.get("context", {})
    orch = get_orchestrator()

    # Get property_id from identity or context
    property_id = identity.get("property_id", "") or context_from_body.get("property_id", "")

    result = orch.run(
        message=message,
        org_id=identity["org_id"],
        user_id=identity["user_id"],
        property_id=property_id,  # Added 2026-06-01
        role=identity.get("role", "tenant"),
        photo_url=body.get("photo_url"),
        conversation_history=body.get("conversation_history", []),
        allowed_property_ids=context_from_body.get("allowed_property_ids", []),
        property_metadata=context_from_body.get("property_metadata", {}),
    )

    return {
        "response": result["response"],
        "tool_results": result.get("tool_results", []),
        "confidence": result.get("confidence", 0.0),
    }


# ─── Chat Sessions CRUD ───────────────────────────────────────────────────────


class _CreateSessionBody(BaseModel):
    user_id: str
    org_id: str
    title: Optional[str] = "New Chat"
    property_id: Optional[str] = None


class _AddMessageBody(BaseModel):
    role: str
    text: str


class _UpdateTitleBody(BaseModel):
    title: str


@app.post("/chat/sessions")
async def create_session_endpoint(body: _CreateSessionBody, db: Session = Depends(get_db)):
    """Create a new chat session."""
    session = _ChatSession(
        id=str(uuid.uuid4()),
        user_id=body.user_id,
        org_id=body.org_id,
        property_id=body.property_id,
        title=body.title or "New Chat",
        created_at=int(time.time()),
        updated_at=int(time.time()),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return {
        "id": session.id, "user_id": session.user_id, "org_id": session.org_id,
        "property_id": session.property_id, "title": session.title,
        "created_at": session.created_at, "updated_at": session.updated_at,
    }


@app.get("/chat/sessions")
async def list_sessions_endpoint(
    user_id: str = Query(...),
    org_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """List chat sessions for a user."""
    q = db.query(_ChatSession).filter(_ChatSession.user_id == user_id)
    if org_id:
        q = q.filter(_ChatSession.org_id == org_id)
    sessions = q.order_by(_ChatSession.updated_at.desc()).limit(50).all()
    return [
        {
            "id": s.id, "user_id": s.user_id, "org_id": s.org_id,
            "property_id": s.property_id, "title": s.title,
            "created_at": s.created_at, "updated_at": s.updated_at,
        }
        for s in sessions
    ]


@app.get("/chat/sessions/{session_id}")
async def get_session_endpoint(session_id: str, db: Session = Depends(get_db)):
    """Get a chat session with all messages."""
    session = db.query(_ChatSession).filter(_ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    messages = db.query(_ChatMessage).filter(_ChatMessage.session_id == session_id).order_by(_ChatMessage.created_at).all()
    return {
        "id": session.id, "user_id": session.user_id, "org_id": session.org_id,
        "property_id": session.property_id, "title": session.title,
        "created_at": session.created_at, "updated_at": session.updated_at,
        "messages": [
            {"id": m.id, "session_id": m.session_id, "role": m.role, "text": m.text, "created_at": m.created_at}
            for m in messages
        ],
    }


@app.put("/chat/sessions/{session_id}/messages")
async def add_message_endpoint(session_id: str, body: _AddMessageBody, db: Session = Depends(get_db)):
    """Add a message to a session."""
    session = db.query(_ChatSession).filter(_ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    msg = _ChatMessage(
        id=str(uuid.uuid4()),
        session_id=session_id,
        role=body.role,
        text=body.text,
        created_at=int(time.time()),
    )
    db.add(msg)
    session.updated_at = int(time.time())
    db.commit()
    db.refresh(msg)
    return {"id": msg.id, "session_id": msg.session_id, "role": msg.role, "text": msg.text, "created_at": msg.created_at}


@app.put("/chat/sessions/{session_id}/title")
async def update_title_endpoint(session_id: str, body: _UpdateTitleBody, db: Session = Depends(get_db)):
    """Update session title."""
    session = db.query(_ChatSession).filter(_ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.title = body.title
    session.updated_at = int(time.time())
    db.commit()
    return {"ok": True}


@app.delete("/chat/sessions/{session_id}")
async def delete_session_endpoint(session_id: str, db: Session = Depends(get_db)):
    """Delete a session and all its messages."""
    db.query(_ChatMessage).filter(_ChatMessage.session_id == session_id).delete()
    db.query(_ChatSession).filter(_ChatSession.id == session_id).delete()
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------

def main():
    import uvicorn

    if not os.environ.get("OPENAI_API_KEY"):
        logger.warning("OPENAI_API_KEY not set! LLM calls will fail.")

    # CASSANDRA_PORT takes priority locally; PORT is for Render deploy
    port = int(os.environ.get("CASSANDRA_PORT", os.environ.get("PORT", "8001")))
    host = os.environ.get("HOST", "0.0.0.0")

    logger.info("=" * 50)
    logger.info(f"  Cassandra 3.1 — Simplified")
    logger.info(f"  Listening: http://{host}:{port}")
    logger.info(f"  Auth: Simple session tokens")
    logger.info(f"  LLM: GPT-4o via OpenAI")
    logger.info("=" * 50)

    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
