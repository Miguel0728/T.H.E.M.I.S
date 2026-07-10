"""Endpoints del modo Chat: conversaciones normales (sin herramientas de archivos),
generación de imágenes (funcionalidad directa) — separado de /projects."""
import json
import logging
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel

from app.database.connection import db_execute, db_fetch_all, db_fetch_one
from app.config.settings import MODELS, DEFAULT_MODEL, IMAGE_MODEL, OPENAI_API_KEY
from app.agents.chat_engine import run_chat
from app.core.image_client import generate_image
from app.tools import chat_images as ci
from app.routes.shared import now_iso, load_recent_history

logger = logging.getLogger("cosmo")
chats_router = APIRouter(prefix="/api")


class ChatConversationCreate(BaseModel):
    name: str | None = None
    model: str = DEFAULT_MODEL


class ChatConversationMessage(BaseModel):
    message: str
    model: str | None = None
    images_base64: list[str] | None = None


class ChatImageRequest(BaseModel):
    prompt: str


# ----------------------------- Conversaciones -----------------------------
@chats_router.post("/chats")
async def create_chat_conversation(body: ChatConversationCreate):
    cid = str(uuid.uuid4())
    name = body.name or "Nueva conversación"
    model = body.model if body.model in MODELS else DEFAULT_MODEL
    created_at = now_iso()

    await db_execute(
        "INSERT INTO chats (id, name, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (cid, name, model, created_at, created_at)
    )
    return {"id": cid, "name": name, "model": model, "created_at": created_at, "updated_at": created_at}


@chats_router.get("/chats")
async def list_chat_conversations():
    items = await db_fetch_all("SELECT id, name, model, created_at, updated_at FROM chats ORDER BY updated_at DESC LIMIT 200")
    return items


@chats_router.get("/chats/{cid}")
async def get_chat_conversation(cid: str):
    chat = await db_fetch_one("SELECT id, name, model, created_at, updated_at FROM chats WHERE id = ?", (cid,))
    if not chat:
        raise HTTPException(404, "Conversación no encontrada")
    msgs = await db_fetch_all("SELECT id, chat_id, role, content, created_at FROM chat_messages WHERE chat_id = ? ORDER BY created_at ASC", (cid,))
    return {"chat": chat, "messages": msgs}


@chats_router.delete("/chats/{cid}")
async def delete_chat_conversation(cid: str):
    # El borrado en cascada configurado en SQLite eliminará los mensajes vinculados automáticamente
    await db_execute("DELETE FROM chats WHERE id = ?", (cid,))
    return {"ok": True}


# ----------------------------- Mensaje (SSE streaming) -----------------------------
@chats_router.post("/chats/{cid}/message")
async def send_chat_message(cid: str, body: ChatConversationMessage):
    chat = await db_fetch_one("SELECT id, name, model, created_at, updated_at FROM chats WHERE id = ?", (cid,))
    if not chat:
        raise HTTPException(404, "Conversación no encontrada")

    model = body.model if (body.model in MODELS) else chat.get("model", DEFAULT_MODEL)

    history = await load_recent_history("chat_messages", "chat_id", cid)

    user_msg_id = str(uuid.uuid4())
    await db_execute(
        "INSERT INTO chat_messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
        (user_msg_id, cid, "user", body.message, now_iso())
    )
    await db_execute(
        "UPDATE chats SET updated_at = ?, model = ? WHERE id = ?",
        (now_iso(), model, cid)
    )

    async def event_stream():
        final_text = ""
        try:
            async for ev in run_chat(cid, body.message, model, history, body.images_base64):
                if ev.get("type") == "message_done":
                    final_text = ev.get("content", "")
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.exception("chat error")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

        assistant_msg_id = str(uuid.uuid4())
        await db_execute(
            "INSERT INTO chat_messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
            (assistant_msg_id, cid, "assistant", final_text or "(sin respuesta)", now_iso())
        )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


# ----------------------------- Generación de imágenes (funcionalidad directa) -----------------------------
# El usuario dispara esto explícitamente desde un botón dedicado; el LLM conversacional
# nunca decide invocarlo — no es una tool de agente.

@chats_router.post("/chats/{cid}/image")
async def generate_chat_image(cid: str, body: ChatImageRequest):
    chat = await db_fetch_one("SELECT id FROM chats WHERE id = ?", (cid,))
    if not chat:
        raise HTTPException(404, "Conversación no encontrada")
    if not OPENAI_API_KEY:
        raise HTTPException(400, "La generación de imágenes requiere OPENAI_API_KEY configurada en el servidor.")

    prompt = body.prompt.strip()
    if not prompt:
        raise HTTPException(400, "El prompt no puede estar vacío")

    try:
        png_bytes = await generate_image(OPENAI_API_KEY, IMAGE_MODEL, prompt)
    except Exception as e:
        logger.exception("image generation error")
        raise HTTPException(502, f"Error generando la imagen: {e}")

    filename = f"{uuid.uuid4()}.png"
    ci.save_image(cid, filename, png_bytes)
    image_url = f"/api/chats/{cid}/files/{filename}"

    await db_execute(
        "INSERT INTO chat_messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), cid, "user", f"Imagen: {prompt}", now_iso())
    )
    assistant_content = f'<img src="{image_url}" alt="Imagen generada" class="chat-generated-image">'
    await db_execute(
        "INSERT INTO chat_messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), cid, "assistant", assistant_content, now_iso())
    )
    await db_execute("UPDATE chats SET updated_at = ? WHERE id = ?", (now_iso(), cid))

    return {"ok": True, "image_url": image_url, "prompt": prompt}


@chats_router.get("/chats/{cid}/files/{filename}")
async def get_chat_image(cid: str, filename: str):
    try:
        full = ci.image_path(cid, filename)
    except ValueError:
        raise HTTPException(403, "ruta no permitida")
    if not full.exists():
        raise HTTPException(404, "Imagen no encontrada")
    return FileResponse(str(full), media_type="image/png")
