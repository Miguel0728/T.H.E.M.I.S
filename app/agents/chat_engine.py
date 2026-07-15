"""Motor del modo Chat de T.H.E.M.I.S. — conversación normal, con una única tool
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
from app.config.settings import EMERGENT_LLM_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY, MODELS, DEFAULT_MODEL, MAX_TOKENS, MAX_TOOL_LOOP_ITERATIONS
from app.config.prompts import CHAT_SYSTEM_PROMPT
from app.tools.registry import CHAT_TOOLS, execute_chat_tool
from app.database.connection import record_token_usage
from app.routes.shared import now_iso


async def run_chat(cid: str, user_text: str, model: str, history: list, images_b64: list[str] | None = None):
    """Async generator yielding event dicts (SSE payloads) para una conversación normal."""
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
                    if ev.usage:
                        await record_token_usage(model, ev.usage.get("input_tokens", 0),
                                                  ev.usage.get("output_tokens", 0), now_iso())
        except Exception as e:
            yield {"type": "error", "message": f"Error del modelo: {e}"}
            return

        user_msg = None
        if not tool_calls:
            break

        for tc in tool_calls:
            result = await execute_chat_tool(tc.name, tc.arguments)
            yield {"type": "tool_result", "name": tc.name, "id": tc.id,
                   "query": tc.arguments.get("query") or tc.arguments.get("region")
                            or tc.arguments.get("url") or tc.arguments.get("location"),
                   "ok": result.get("ok", True), "result": result}
            chat.add_tool_result(tc.id, json.dumps(result, ensure_ascii=False))

    yield {"type": "message_done", "content": assistant_text}
    yield {"type": "done"}
