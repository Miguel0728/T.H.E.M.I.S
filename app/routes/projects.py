"""Endpoints del modo Construir: modelos, proyectos, chat con tools (SSE) y live preview."""
import json
import logging
import mimetypes
import pathlib
import uuid

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse, FileResponse, HTMLResponse, RedirectResponse
from pydantic import BaseModel

from app.database.connection import db_execute, db_fetch_all, db_fetch_one
from app.config.settings import MODELS, DEFAULT_MODEL, OPENAI_API_KEY, DEEPSEEK_API_KEY
from app.agents.orchestrator import run_agent
from app.tools import file_tools as wt
from app.routes.shared import now_iso, load_recent_history

logger = logging.getLogger("cosmo")
projects_router = APIRouter(prefix="/api")


class ProjectCreate(BaseModel):
    name: str | None = None
    model: str = DEFAULT_MODEL
    # "app" = Modo Construir (un único index.html autocontenido, como hoy).
    # "proyecto" = Modo Proyecto (estructura multi-carpeta: backend FastAPI +
    # frontend HTML/Tailwind/JS separados). Ver app/config/prompts.py.
    project_type: str = "app"
    # Modo Carpeta Conectada: ruta absoluta real en el disco del señor. Si se
    # provee, el proyecto NO vive en workspaces/{pid} — todas las tools operan
    # directamente sobre esta carpeta (ver app/tools/file_tools.py).
    external_path: str | None = None


class ChatRequest(BaseModel):
    message: str
    model: str | None = None
    images_base64: list[str] | None = None


# ----------------------------- Models -----------------------------
@projects_router.get("/models")
async def get_models():
    # Ocultamos los modelos de un proveedor si no hay API key configurada para
    # él, así el usuario nunca puede elegir uno que va a fallar al enviarlo.
    available = {
        k: v for k, v in MODELS.items()
        if (v["provider"] != "openai" or OPENAI_API_KEY) and (v["provider"] != "deepseek" or DEEPSEEK_API_KEY)
    }
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
    project_type = body.project_type if body.project_type in ("app", "proyecto") else "app"
    created_at = now_iso()
    updated_at = now_iso()

    external_path = None
    if body.external_path and body.external_path.strip():
        candidate = pathlib.Path(body.external_path.strip()).expanduser()
        if not candidate.is_absolute():
            raise HTTPException(400, "La ruta debe ser absoluta (ej. C:\\Users\\... o /home/...)")
        try:
            resolved = candidate.resolve()
        except OSError as e:
            raise HTTPException(400, f"Ruta inválida: {e}")
        if not resolved.exists() or not resolved.is_dir():
            raise HTTPException(400, f"La carpeta no existe o no es un directorio: {resolved}")
        external_path = str(resolved)
        if not name or name == "Proyecto nuevo":
            name = resolved.name

    await db_execute(
        "INSERT INTO projects (id, name, model, created_at, updated_at, project_type, external_path) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (pid, name, model, created_at, updated_at, project_type, external_path)
    )
    if not external_path:
        wt.proj_dir(pid)
    return {
        "id": pid,
        "name": name,
        "model": model,
        "created_at": created_at,
        "updated_at": updated_at,
        "project_type": project_type,
        "external_path": external_path,
    }


@projects_router.get("/projects")
async def list_projects():
    items = await db_fetch_all("SELECT id, name, model, created_at, updated_at, project_type, external_path FROM projects ORDER BY updated_at DESC LIMIT 200")
    return items


@projects_router.get("/projects/{pid}")
async def get_project(pid: str):
    proj = await db_fetch_one("SELECT id, name, model, created_at, updated_at, project_type, external_path FROM projects WHERE id = ?", (pid,))
    if not proj:
        raise HTTPException(404, "Proyecto no encontrado")
    msgs = await db_fetch_all("SELECT id, project_id, role, content, created_at, has_image FROM messages WHERE project_id = ? ORDER BY created_at ASC", (pid,))
    return {"project": proj, "messages": msgs, "files": wt.list_files(pid, proj.get("external_path"))}


@projects_router.delete("/projects/{pid}")
async def delete_project(pid: str):
    proj = await db_fetch_one("SELECT id, external_path FROM projects WHERE id = ?", (pid,))
    if not proj:
        raise HTTPException(404, "Proyecto no encontrado")
    await db_execute("DELETE FROM projects WHERE id = ?", (pid,))
    # remove_project_files() nunca borra nada si external_path está seteado —
    # borrar el proyecto de THEMIS solo desconecta el registro, jamás toca la
    # carpeta real del señor en disco.
    wt.remove_project_files(pid, proj.get("external_path"))
    return {"ok": True}


@projects_router.get("/projects/{pid}/files")
async def get_files(pid: str):
    proj = await db_fetch_one("SELECT external_path FROM projects WHERE id = ?", (pid,))
    if not proj:
        raise HTTPException(404, "Proyecto no encontrado")
    return {"files": wt.list_files(pid, proj.get("external_path"))}


@projects_router.get("/projects/{pid}/file")
async def get_file(pid: str, path: str):
    proj = await db_fetch_one("SELECT external_path FROM projects WHERE id = ?", (pid,))
    if not proj:
        raise HTTPException(404, "Proyecto no encontrado")
    res = wt.read_file(pid, path, proj.get("external_path"))
    if not res.get("ok"):
        raise HTTPException(404, res.get("error", "no encontrado"))
    return res


# ----------------------------- File Upload -----------------------------
@projects_router.post("/projects/{pid}/upload")
async def upload_file(pid: str, file: UploadFile = File(...)):
    proj = await db_fetch_one("SELECT id, external_path FROM projects WHERE id = ?", (pid,))
    if not proj:
        raise HTTPException(404, "Proyecto no encontrado")
    data = await file.read()
    result = wt.save_upload(pid, file.filename, data, proj.get("external_path"))
    if not result.get("ok"):
        raise HTTPException(500, result.get("error", "Error al guardar archivo"))
    return result


@projects_router.post("/projects/{pid}/import-zip")
async def import_zip(pid: str, file: UploadFile = File(...)):
    """Modo Proyecto: sube un .zip de un proyecto existente para que los
    agentes lo auditen. Los archivos quedan en el workspace antes del primer
    mensaje, así el modelo los ve en el contexto ('archivos actuales') que
    arma run_agent() y puede analizarlos en vez de partir de cero.

    Solo aplica al workspace gestionado — un proyecto de Carpeta Conectada ya
    tiene sus archivos en disco, no tiene sentido (ni es seguro) extraer un
    .zip encima de una carpeta real del señor."""
    proj = await db_fetch_one("SELECT id, external_path FROM projects WHERE id = ?", (pid,))
    if not proj:
        raise HTTPException(404, "Proyecto no encontrado")
    if proj.get("external_path"):
        raise HTTPException(400, "Este proyecto está enlazado a una carpeta real; import-zip no aplica.")
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(400, "Solo se aceptan archivos .zip")
    data = await file.read()
    result = wt.import_zip(pid, data)
    if not result.get("ok"):
        raise HTTPException(400, result.get("error", "Error al importar el .zip"))
    return result


# ----------------------------- Chat (SSE streaming) -----------------------------
@projects_router.post("/projects/{pid}/chat")
async def chat(pid: str, body: ChatRequest):
    proj = await db_fetch_one("SELECT id, name, model, created_at, updated_at, project_type, external_path FROM projects WHERE id = ?", (pid,))
    if not proj:
        raise HTTPException(404, "Proyecto no encontrado")

    model = body.model if (body.model in MODELS) else proj.get("model", DEFAULT_MODEL)
    project_type = proj.get("project_type", "app")
    external_path = proj.get("external_path")

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
            async for ev in run_agent(pid, body.message, model, history, body.images_base64, project_type, external_path):
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
# El Modo Construir genera un único index.html en la raíz del workspace. El
# Modo Proyecto separa backend/frontend, así que la entrada visual vive en
# frontend/index.html — el preview solo puede mostrar el frontend estático
# (el backend FastAPI no se levanta como proceso vivo desde aquí).
async def _entry_file(pid: str) -> str:
    proj = await db_fetch_one("SELECT project_type, external_path FROM projects WHERE id = ?", (pid,))
    if proj and proj.get("project_type") == "proyecto":
        if (wt.proj_dir(pid, proj.get("external_path")) / "frontend" / "index.html").exists():
            return "frontend/index.html"
    return "index.html"


@projects_router.get("/preview/{pid}")
async def preview_root(pid: str):
    entry = await _entry_file(pid)
    return RedirectResponse(url=f"/api/preview/{pid}/{entry}")


@projects_router.get("/preview/{pid}/{path:path}")
async def preview_file(pid: str, path: str):
    proj = await db_fetch_one("SELECT external_path FROM projects WHERE id = ?", (pid,))
    external_path = proj.get("external_path") if proj else None
    try:
        full = wt._safe(pid, path, external_path)
    except ValueError:
        raise HTTPException(403, "ruta no permitida")
    if not full.exists() or not full.is_file():
        entry = await _entry_file(pid)
        if (wt.proj_dir(pid, external_path) / entry).exists():
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
