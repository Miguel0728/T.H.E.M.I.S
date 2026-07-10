"""Orquestador agéntico de Kinetix — multi-agente sobre UNA sesión de Claude con Tool Use.

Una sola sesión de Claude encarna cuatro roles especializados (Producto/Diseño,
Coder, Integraciones, QA) narrados dentro del system prompt, y ejecuta un loop de
tool-use: transmite texto, llama tools del workspace (write_file, edit_file,
run_tests, ...), el servidor las ejecuta, devuelve resultados, y el loop continúa
hasta que el modelo deja de pedir tools.

Esto es DISTINTO de tener 4 clases de agente que llaman a Claude cada una por su
cuenta: aquí hay una sola llamada de streaming en progreso, y las "fases" son
anuncios (`set_phase`) dentro de esa misma conversación.
"""
import json

from app.core.llm_client import (
    create_chat, UserMessage, ImageContent,
    TextDelta, ToolCallStart, ToolCallReady, StreamDone,
)
from app.tools import file_tools as ft
from app.tools.registry import TOOLS, MUTATING, execute_tool
from app.config.settings import (
    EMERGENT_LLM_KEY, OPENAI_API_KEY, MODELS, DEFAULT_MODEL, AGENT_LABELS,
    MAX_TOOL_LOOP_ITERATIONS, MAX_TOKENS,
)
from app.config.prompts import SYSTEM_PROMPT


async def run_agent(pid: str, user_text: str, model: str, history: list, images_b64: list[str] | None = None):
    """Async generator yielding event dicts (SSE payloads)."""
    model = model if model in MODELS else DEFAULT_MODEL
    provider = MODELS[model]["provider"]

    if provider == "openai" and not OPENAI_API_KEY:
        yield {"type": "error", "message": "Este modelo requiere OPENAI_API_KEY configurada en el servidor."}
        return

    api_key = OPENAI_API_KEY if provider == "openai" else EMERGENT_LLM_KEY

    files = ft.list_files(pid)
    ctx = f"\n\n[Contexto del workspace — archivos actuales: {files if files else 'vacío (proyecto nuevo)'}]"

    initial = [{"role": "system", "content": SYSTEM_PROMPT}] + history
    chat = (
        create_chat(provider, api_key=api_key, session_id=pid,
                    system_message=SYSTEM_PROMPT, initial_messages=initial)
        .with_model(provider, model)
        .with_tools(TOOLS)
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
        except Exception as e:
            yield {"type": "error", "message": f"Error del modelo: {e}"}
            return

        user_msg = None
        if not tool_calls:
            break

        for tc in tool_calls:
            result = execute_tool(pid, tc.name, tc.arguments)
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
