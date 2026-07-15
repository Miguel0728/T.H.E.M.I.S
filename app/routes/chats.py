"""Endpoints del modo Chat: conversaciones normales (sin herramientas de archivos),
generación de imágenes (funcionalidad directa) — separado de /projects."""
import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel

from app.database.connection import db_execute, db_fetch_all, db_fetch_one
from app.config.settings import EMERGENT_LLM_KEY, MODELS, DEFAULT_MODEL, IMAGE_MODEL, OPENAI_API_KEY, NEWS_API_KEY
from app.agents.chat_engine import run_chat
from app.core.image_client import generate_image
from app.core.llm_client import ImageContent, TextDelta, UserMessage, create_chat
from app.core import news_client
from app.tools import chat_images as ci
from app.routes.shared import now_iso, load_recent_history

logger = logging.getLogger("cosmo")
chats_router = APIRouter(prefix="/api")

_REFERENCE_IMAGE_PROMPT = (
    "Eres un asistente experto en análisis visual. Describe de manera muy detallada, "
    "precisa y concisa el objeto o elementos principales de la imagen (tipo de artículo, "
    "colores, estilo, texturas, formas, estampados, marcas y detalles distintivos) para "
    "que DALL-E pueda recrearlo en un diseño o escena. Devuelve solo la descripción."
)


class ChatConversationCreate(BaseModel):
    name: str | None = None
    model: str = DEFAULT_MODEL


class ChatConversationMessage(BaseModel):
    message: str
    model: str | None = None
    images_base64: list[str] | None = None


class ChatImageRequest(BaseModel):
    prompt: str
    images_base64: list[str] | None = None


async def _describe_reference_images(images: list[str]) -> str:
    chat = create_chat(
        provider="anthropic", api_key=EMERGENT_LLM_KEY, session_id="image-describer",
        system_message=_REFERENCE_IMAGE_PROMPT, initial_messages=[],
    ).with_model("anthropic", "claude-sonnet-4-6")
    message = UserMessage("Describe este objeto detalladamente para recrearlo en DALL-E.",
                          [ImageContent(image) for image in images])
    parts = []
    async for event in chat.stream_message(message):
        if isinstance(event, TextDelta):
            parts.append(event.content)
    return "".join(parts).strip()


async def _enrich_image_prompt(prompt: str, images: list[str] | None) -> str:
    if not images:
        return prompt
    try:
        description = await _describe_reference_images(images)
    except Exception:
        logger.exception("Error describiendo la imagen adjunta")
        return prompt
    return f"{prompt} (el elemento principal de referencia debe ser: {description})" if description else prompt


def _image_error_detail(error: Exception) -> str:
    if any(code in str(error) for code in ("billing_hard_limit_reached", "insufficient_quota")):
        return "La cuenta de OpenAI configurada en el servidor no tiene saldo de facturación activo."
    return f"Error generando la imagen: {error}"


async def _store_image_messages(cid: str, prompt: str, response: str) -> None:
    for role, content in (("user", f"Imagen: {prompt}"), ("assistant", response)):
        await db_execute(
            "INSERT INTO chat_messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), cid, role, content, now_iso()),
        )
    await db_execute("UPDATE chats SET updated_at = ? WHERE id = ?", (now_iso(), cid))


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
    if not await db_fetch_one("SELECT id FROM chats WHERE id = ?", (cid,)):
        raise HTTPException(404, "Conversación no encontrada")
    await db_execute("DELETE FROM gallery WHERE chat_id = ?", (cid,))
    await db_execute("DELETE FROM chats WHERE id = ?", (cid,))
    ci.remove_chat_files(cid)
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

    prompt = await _enrich_image_prompt(prompt, body.images_base64)

    try:
        png_bytes = await generate_image(OPENAI_API_KEY, IMAGE_MODEL, prompt)
    except Exception as e:
        logger.exception("image generation error")
        detail = _image_error_detail(e)
        await _store_image_messages(cid, prompt, f"⚠ {detail}")
        raise HTTPException(502, detail)

    filename = f"{uuid.uuid4()}.png"
    ci.save_image(cid, filename, png_bytes)
    image_url = f"/api/chats/{cid}/files/{filename}"

    # Auto-guardar en la galería global de creaciones
    await db_execute(
        "INSERT INTO gallery (id, chat_id, image_url, prompt, created_at) VALUES (?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), cid, image_url, prompt, now_iso())
    )

    assistant_content = f'<img src="{image_url}" alt="Imagen generada" class="chat-generated-image">'
    await _store_image_messages(cid, prompt, assistant_content)

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


# ─── Banner informativo del Modo Chat ────────────────────────────────────────
# Endpoint que alimenta el pop-up "Informe de Situación" del Modo Chat:
# un carrusel de noticias (con imagen y descripción) de varias secciones.

# Etiqueta legible del "departamento"/sección de cada noticia, mostrada como
# chip en el pop-up. Las de PR traen `topic` (gobierno/tecnologia/farandula) de
# los feeds RSS; las de EE. UU. no, así que se rotulan "Internacional".
_NEWS_TOPIC_LABELS = {
    "gobierno": "Gobierno",
    "tecnologia": "Tecnología",
    "farandula": "Farándula",
}


def _banner_news_item(article: dict, default_label: str) -> dict:
    topic = article.get("topic")
    return {
        "title": article.get("title"),
        "description": article.get("description"),
        "source": article.get("source"),
        "url": article.get("url"),
        "image": article.get("image") or article.get("urlToImage"),
        "category": _NEWS_TOPIC_LABELS.get(topic, default_label),
        "publishedAt": article.get("publishedAt"),
    }


@chats_router.get("/chat/banner")
async def get_chat_banner():
    # ── Noticias: varias de distintas secciones/departamentos, con imagen ──
    # Intercalamos EE. UU. y Puerto Rico (round-robin) para que el pop-up
    # muestre variedad en vez de tres titulares del mismo medio/tema.
    news_items = []
    if NEWS_API_KEY:
        try:
            us = await news_client.get_us_headlines(NEWS_API_KEY, page_size=5)
            pr = await news_client.get_pr_news(NEWS_API_KEY, page_size=5)
            us_items = [_banner_news_item(a, "Internacional") for a in us]
            pr_items = [_banner_news_item(a, "Puerto Rico") for a in pr]
            # Round-robin PR/US para alternar procedencia y sección.
            interleaved = []
            for i in range(max(len(pr_items), len(us_items))):
                if i < len(pr_items):
                    interleaved.append(pr_items[i])
                if i < len(us_items):
                    interleaved.append(us_items[i])
            # El pop-up es 100% visual: priorizamos noticias con imagen Y
            # descripción, luego solo-imagen, y por último el resto.
            def _rank(n):
                return (bool(n.get("image")), bool(n.get("description")))
            interleaved.sort(key=_rank, reverse=True)
            news_items = interleaved[:8]
        except Exception:
            pass
    # Compat: `news` sigue siendo el titular destacado (primero de la lista).
    news_item = news_items[0] if news_items else None

    return {
        "news": news_item,
        "news_items": news_items,
    }
