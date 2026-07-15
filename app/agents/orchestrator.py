"""Orquestador agéntico de T.H.E.M.I.S. — multi-agente sobre UNA sesión de Claude con Tool Use.

Una sola sesión de Claude encarna cuatro roles especializados (Producto/Diseño,
Coder, Integraciones, QA) narrados dentro del system prompt, y ejecuta un loop de
tool-use: transmite texto, llama tools del workspace (write_file, edit_file,
run_tests, ...), el servidor las ejecuta, devuelve resultados, y el loop continúa
hasta que el modelo deja de pedir tools.

Esto es DISTINTO de tener 4 clases de agente que llaman a Claude cada una por su
cuenta: aquí hay una sola llamada de streaming en progreso, y las "fases" son
anuncios (`set_phase`) dentro de esa misma conversación.

Las tools de solo lectura (read_file, list_files, run_tests, fetch_url,
audit_security) se ejecutan en paralelo con asyncio.gather cuando Claude pide
varias juntas — esto reduce significativamente la latencia del loop agéntico.
Las tools de mutación (write_file, edit_file, delete_file, create_directory,
run_command, serve_and_test) se ejecutan en serie para garantizar orden
determinista.
"""
import asyncio
import json

from app.core.llm_client import (
    create_chat, UserMessage, ImageContent,
    TextDelta, ToolCallStart, StreamDone,
)
from app.tools import file_tools as ft
from app.tools.registry import TOOLS, LINKED_TOOLS, MUTATING, READ_ONLY, execute_tool
from app.config.settings import (
    EMERGENT_LLM_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY, MODELS, DEFAULT_MODEL, AGENT_LABELS,
    MAX_TOOL_LOOP_ITERATIONS, MAX_TOKENS,
)
from app.config.prompts import SYSTEM_PROMPT, PROJECT_SYSTEM_PROMPT, LINKED_SYSTEM_PROMPT
from app.database.connection import record_token_usage
from app.routes.shared import now_iso


async def run_agent(pid: str, user_text: str, model: str, history: list, images_b64: list[str] | None = None,
                     project_type: str = "app", external_path: str | None = None):
    """Async generator yielding event dicts (SSE payloads).

    project_type selecciona el workflow: "app" (Modo Construir, un único
    index.html autocontenido) o "proyecto" (Modo Proyecto, estructura
    multi-carpeta con backend FastAPI + frontend HTML/Tailwind/JS). Ambos
    workflows comparten el mismo loop de tool-use y las mismas 4 fases; solo
    cambian las instrucciones del system prompt.

    external_path: si el proyecto es de Modo Carpeta Conectada, apunta a una
    ruta real del disco del señor. En ese caso se usa LINKED_SYSTEM_PROMPT y el
    set de tools LINKED_TOOLS (que añade run_command), y todas las tools de
    archivo operan directamente sobre esa carpeta en vez de workspaces/{pid}.
    """
    model = model if model in MODELS else DEFAULT_MODEL
    provider = MODELS[model]["provider"]

    if provider == "openai" and not OPENAI_API_KEY:
        yield {"type": "error", "message": "Este modelo requiere OPENAI_API_KEY configurada en el servidor."}
        return
    elif provider == "deepseek" and not DEEPSEEK_API_KEY:
        yield {"type": "error", "message": "Este modelo requiere DEEPSEEK_API_KEY configurada en el servidor."}
        return

    if provider == "openai":
        api_key = OPENAI_API_KEY
    elif provider == "deepseek":
        api_key = DEEPSEEK_API_KEY
    else:
        api_key = EMERGENT_LLM_KEY

    if external_path:
        system_prompt = LINKED_SYSTEM_PROMPT
        tools = LINKED_TOOLS
    else:
        system_prompt = PROJECT_SYSTEM_PROMPT if project_type == "proyecto" else SYSTEM_PROMPT
        tools = TOOLS

    files = ft.list_files(pid, external_path)
    ctx = f"\n\n[Contexto del workspace — archivos actuales: {files if files else 'vacío (proyecto nuevo)'}]"
    if external_path:
        ctx += f"\n[Carpeta conectada: {external_path}]"

    initial = [{"role": "system", "content": system_prompt}] + history
    chat = (
        create_chat(provider, api_key=api_key, session_id=pid,
                    system_message=system_prompt, initial_messages=initial)
        .with_model(provider, model)
        .with_tools(tools)
        .with_params(max_tokens=MAX_TOKENS)
    )

    file_ctx = [ImageContent(img) for img in images_b64] if images_b64 else None
    user_msg = UserMessage(text=user_text + ctx, file_contents=file_ctx)

    assistant_text = ""
    preview_dirty = False

    for _ in range(MAX_TOOL_LOOP_ITERATIONS):
        tool_calls = None
        try:
            async for ev in chat.stream_message(user_msg):
                if isinstance(ev, TextDelta):
                    assistant_text += ev.content
                    yield {"type": "text_delta", "content": ev.content}
                elif isinstance(ev, ToolCallStart):
                    yield {"type": "tool_start", "name": ev.name, "id": ev.id}
                elif isinstance(ev, StreamDone):
                    tool_calls = ev.tool_calls
                    if ev.usage:
                        await record_token_usage(model, ev.usage.get("input_tokens", 0),
                                                  ev.usage.get("output_tokens", 0), now_iso())
        except Exception as e:
            yield {"type": "error", "message": f"Error del modelo: {e}"}
            return

        user_msg = None
        if not tool_calls:
            break

        # ── Tool routing inteligente ──────────────────────────────────────
        # Separamos tools de solo lectura (paralelizables) de las de mutación
        # (que deben ejecutarse en serie para mantener orden determinista).
        ro_calls = []   # read-only → paralelo
        mut_calls = []  # mutating  → serie

        for tc in tool_calls:
            if tc.name in READ_ONLY:
                ro_calls.append(tc)
            else:
                mut_calls.append(tc)

        # Fase 1: ejecutar todas las tools de solo lectura en paralelo.
        if ro_calls:
            loop = asyncio.get_running_loop()

            async def _run_readonly(tc):
                result = await loop.run_in_executor(
                    None, execute_tool, pid, tc.name, tc.arguments, project_type, external_path
                )
                return tc, result

            # asyncio.as_completed emite resultados en orden de terminación
            # (el que acaba primero se streamea primero), en vez de esperar
            # a la más lenta para enviar todo junto.
            for coro in asyncio.as_completed([_run_readonly(tc) for tc in ro_calls]):
                tc, result = await coro
                yield {"type": "tool_result", "name": tc.name, "id": tc.id,
                       "path": tc.arguments.get("path"),
                       "ok": result.get("ok", True),
                       "result": result}
                chat.add_tool_result(tc.id, json.dumps(result, ensure_ascii=False))

        # Fase 2: ejecutar tools de mutación en serie (orden determinista).
        for tc in mut_calls:
            result = execute_tool(pid, tc.name, tc.arguments, project_type, external_path)
            if tc.name == "set_phase":
                agent = tc.arguments.get("agent", "coder")
                yield {"type": "phase", "agent": agent,
                       "label": AGENT_LABELS.get(agent, agent),
                       "message": tc.arguments.get("message", "")}
            else:
                yield {"type": "tool_result", "name": tc.name, "id": tc.id,
                       "path": tc.arguments.get("path"),
                       "ok": result.get("ok", True),
                       "result": result}
            if tc.name in MUTATING and result.get("ok"):
                preview_dirty = True
            chat.add_tool_result(tc.id, json.dumps(result, ensure_ascii=False))

        if preview_dirty:
            yield {"type": "preview_update"}
            preview_dirty = False

    yield {"type": "message_done", "content": assistant_text}
    yield {"type": "done"}
