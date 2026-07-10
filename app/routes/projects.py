"""Endpoints del modo Construir: modelos, proyectos, chat con tools (SSE) y live preview."""
import json
import logging
import mimetypes
import uuid

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse, FileResponse, HTMLResponse, RedirectResponse
from pydantic import BaseModel

from app.database.connection import db_execute, db_fetch_all, db_fetch_one
from app.config.settings import MODELS, DEFAULT_MODEL, OPENAI_API_KEY
from app.agents.orchestrator import run_agent
from app.tools import file_tools as wt
from app.routes.shared import now_iso, load_recent_history

logger = logging.getLogger("cosmo")
projects_router = APIRouter(prefix="/api")


class ProjectCreate(BaseModel):
    name: str | None = None
    model: str = DEFAULT_MODEL


class ChatRequest(BaseModel):
    message: str
    model: str | None = None
    images_base64: list[str] | None = None


# ----------------------------- Models -----------------------------
@projects_router.get("/models")
async def get_models():
    # Ocultamos los modelos de un proveedor si no hay API key configurada para
    # él, así el usuario nunca puede elegir uno que va a fallar al enviarlo.
    available = {k: v for k, v in MODELS.items() if v["provider"] != "openai" or OPENAI_API_KEY}
    models = [
        {"id": k, "name": v["name"], "provider": v["provider"],
         "tagline": v.get("tagline", ""), "recommended": v.get("recommended", False)}
        for k, v in available.items()
    ]
    default = DEFAULT_MODEL if DEFAULT_MODEL in available else next(iter(available))
    return {"models": models, "default": default}


# ----------------------------- Project CRUD -----------------------------
@projects_router.post("/projects")
async def create_project(body: ProjectCreate):
    pid = str(uuid.uuid4())
    name = body.name or "Proyecto nuevo"
    model = body.model if body.model in MODELS else DEFAULT_MODEL
    created_at = now_iso()
    updated_at = now_iso()

    await db_execute(
        "INSERT INTO projects (id, name, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (pid, name, model, created_at, updated_at)
    )
    wt.proj_dir(pid)
    return {
        "id": pid,
        "name": name,
        "model": model,
        "created_at": created_at,
        "updated_at": updated_at
    }


@projects_router.get("/projects")
async def list_projects():
    items = await db_fetch_all("SELECT id, name, model, created_at, updated_at FROM projects ORDER BY updated_at DESC LIMIT 200")
    return items


@projects_router.get("/projects/{pid}")
async def get_project(pid: str):
    proj = await db_fetch_one("SELECT id, name, model, created_at, updated_at FROM projects WHERE id = ?", (pid,))
    if not proj:
        raise HTTPException(404, "Proyecto no encontrado")
    msgs = await db_fetch_all("SELECT id, project_id, role, content, created_at, has_image FROM messages WHERE project_id = ? ORDER BY created_at ASC", (pid,))
    return {"project": proj, "messages": msgs, "files": wt.list_files(pid)}


@projects_router.delete("/projects/{pid}")
async def delete_project(pid: str):
    # El borrado en cascada configurado en SQLite eliminará los mensajes vinculados automáticamente
    await db_execute("DELETE FROM projects WHERE id = ?", (pid,))
    return {"ok": True}


@projects_router.get("/projects/{pid}/files")
async def get_files(pid: str):
    return {"files": wt.list_files(pid)}


@projects_router.get("/projects/{pid}/file")
async def get_file(pid: str, path: str):
    res = wt.read_file(pid, path)
    if not res.get("ok"):
        raise HTTPException(404, res.get("error", "no encontrado"))
    return res


# ----------------------------- File Upload -----------------------------
@projects_router.post("/projects/{pid}/upload")
async def upload_file(pid: str, file: UploadFile = File(...)):
    proj = await db_fetch_one("SELECT id FROM projects WHERE id = ?", (pid,))
    if not proj:
        raise HTTPException(404, "Proyecto no encontrado")
    data = await file.read()
    result = wt.save_upload(pid, file.filename, data)
    if not result.get("ok"):
        raise HTTPException(500, result.get("error", "Error al guardar archivo"))
    return result


# ----------------------------- Chat (SSE streaming) -----------------------------
@projects_router.post("/projects/{pid}/chat")
async def chat(pid: str, body: ChatRequest):
    proj = await db_fetch_one("SELECT id, name, model, created_at, updated_at FROM projects WHERE id = ?", (pid,))
    if not proj:
        raise HTTPException(404, "Proyecto no encontrado")

    model = body.model if (body.model in MODELS) else proj.get("model", DEFAULT_MODEL)

    history = await load_recent_history("messages", "project_id", pid)

    user_msg_id = str(uuid.uuid4())
    await db_execute(
        "INSERT INTO messages (id, project_id, role, content, created_at, has_image) VALUES (?, ?, ?, ?, ?, ?)",
        (user_msg_id, pid, "user", body.message, now_iso(), int(bool(body.images_base64)))
    )
    await db_execute(
        "UPDATE projects SET updated_at = ?, model = ? WHERE id = ?",
        (now_iso(), model, pid)
    )

    async def event_stream():
        final_text = ""
        try:
            async for ev in run_agent(pid, body.message, model, history, body.images_base64):
                if ev.get("type") == "message_done":
                    final_text = ev.get("content", "")
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.exception("agent error")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

        assistant_msg_id = str(uuid.uuid4())
        await db_execute(
            "INSERT INTO messages (id, project_id, role, content, created_at, has_image) VALUES (?, ?, ?, ?, ?, ?)",
            (assistant_msg_id, pid, "assistant", final_text or "(acción completada)", now_iso(), 0)
        )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


# ----------------------------- Live Preview -----------------------------
@projects_router.get("/preview/{pid}")
async def preview_root(pid: str):
    return RedirectResponse(url=f"/api/preview/{pid}/index.html")


@projects_router.get("/preview/{pid}/{path:path}")
async def preview_file(pid: str, path: str):
    try:
        full = wt._safe(pid, path)
    except ValueError:
        raise HTTPException(403, "ruta no permitida")
    if not full.exists() or not full.is_file():
        index = wt.proj_dir(pid) / "index.html"
        if index.exists():
            return HTMLResponse(
                "<html><body style='font-family:sans-serif;background:#09090b;color:#fff;padding:40px'>"
                f"<h2>Recurso no encontrado</h2><p>{path}</p></body></html>",
                status_code=404,
            )
        return HTMLResponse(
            "<html><body style='font-family:sans-serif;background:#09090b;color:#a1a1aa;"
            "display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center'>"
            "<div><div style='font-size:48px;margin-bottom:16px'>✦</div>"
            "<p>La vista previa aparecerá aquí<br>mientras el agente construye tu app.</p></div></body></html>"
        )
    mime, _ = mimetypes.guess_type(str(full))
    return FileResponse(str(full), media_type=mime or "application/octet-stream")
