"""Motor del modo Chat de Kinetix — conversación normal, con una única tool
de consulta (noticias).

A diferencia de `orchestrator.run_agent` (que corre un loop de tool-use de hasta
MAX_TOOL_LOOP_ITERATIONS turnos con las tools de workspace: write_file, edit_file,
etc.), aquí no hay archivos, fases ni preview — solo se le da al modelo la tool
`get_news` para que pueda resumir noticias bajo pedido, reusando el feed que ya
alimenta la pestaña dedicada de Noticias. Misma interfaz de eventos
(text_delta / message_done / done / error) para que el frontend reutilice el
mismo parser de SSE; tool_start/tool_result se emiten también por si el
frontend quiere mostrarlos, pero son opcionales (se ignoran si no se manejan).
"""
import json

from app.core.llm_client import create_chat, UserMessage, ImageContent, TextDelta, ToolCallStart, StreamDone
from app.config.settings import EMERGENT_LLM_KEY, OPENAI_API_KEY, MODELS, DEFAULT_MODEL, MAX_TOKENS, MAX_TOOL_LOOP_ITERATIONS
from app.config.prompts import CHAT_SYSTEM_PROMPT
from app.tools import news_tools

CHAT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_news",
            "description": "Obtiene titulares recientes para resumirlos o comentarlos con el usuario. "
                            "Úsala cuando el usuario pida un resumen de noticias, últimas noticias o "
                            "novedades de gobierno/actualidad.",
            "parameters": {
                "type": "object",
                "properties": {
                    "region": {"type": "string", "enum": ["all", "pr", "us"],
                                "description": "'pr' para noticias de gobierno de Puerto Rico, "
                                                "'us' para titulares de Estados Unidos, 'all' para ambas."},
                    "limit": {"type": "integer",
                              "description": f"Máximo de artículos a devolver (por defecto {news_tools.MAX_ARTICLES_FOR_CHAT})."},
                },
                "required": ["region"],
            },
        },
    },
]


async def _execute_chat_tool(name: str, args: dict) -> dict:
    if name == "get_news":
        return await news_tools.get_news(args.get("region", "all"), args.get("limit"))
    return {"ok": False, "error": f"Herramienta desconocida: {name}"}


async def run_chat(cid: str, user_text: str, model: str, history: list, images_b64: list[str] | None = None):
    """Async generator yielding event dicts (SSE payloads) para una conversación normal."""
    model = model if model in MODELS else DEFAULT_MODEL
    provider = MODELS[model]["provider"]

    if provider == "openai" and not OPENAI_API_KEY:
        yield {"type": "error", "message": "Este modelo requiere OPENAI_API_KEY configurada en el servidor."}
        return

    api_key = OPENAI_API_KEY if provider == "openai" else EMERGENT_LLM_KEY

    initial = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}] + history
    chat = (
        create_chat(provider, api_key=api_key, session_id=cid,
                    system_message=CHAT_SYSTEM_PROMPT, initial_messages=initial)
        .with_model(provider, model)
        .with_tools(CHAT_TOOLS)
        .with_params(max_tokens=MAX_TOKENS)
    )

    file_ctx = [ImageContent(img) for img in images_b64] if images_b64 else None
    user_msg = UserMessage(text=user_text, file_contents=file_ctx)

    assistant_text = ""
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
            result = await _execute_chat_tool(tc.name, tc.arguments)
            yield {"type": "tool_result", "name": tc.name, "id": tc.id, "ok": result.get("ok", True)}
            chat.add_tool_result(tc.id, json.dumps(result, ensure_ascii=False))

    yield {"type": "message_done", "content": assistant_text}
    yield {"type": "done"}
