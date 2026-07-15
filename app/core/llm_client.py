import asyncio
import json
from typing import Protocol, runtime_checkable
from anthropic import AsyncAnthropic
from openai import AsyncOpenAI


# Los modelos GPT-5.6 (sol/terra/luna) devuelven de forma intermitente
# 401 "insufficient permissions" o 429/5xx en la llamada inicial —
# comportamiento transitorio de OpenAI (verificación de organización /
# rate-limiting en modelos recién lanzados), no un error real de la petición:
# el MISMO request idéntico funciona al reintentar. Como el error ocurre al
# abrir el stream (antes de emitir cualquier token), reintentar es seguro.
_RETRYABLE_STATUS = {401, 429, 500, 502, 503, 529}
_MAX_STREAM_RETRIES = 4


def _is_transient_openai_error(exc: Exception) -> bool:
    status = getattr(exc, "status_code", None)
    if status in _RETRYABLE_STATUS:
        return True
    msg = str(exc).lower()
    return "insufficient permissions" in msg or "rate limit" in msg or "overloaded" in msg


@runtime_checkable
class ChatSession(Protocol):
    """Contrato explícito que deben cumplir los clientes de LLM (LlmChat, OpenAiChat).

    El orquestador y el motor de chat consumen esta interfaz sin saber qué
    proveedor hay debajo — solo llaman a estos 5 métodos y reciben estos
    3 eventos (TextDelta, ToolCallStart, StreamDone) del generador asíncrono
    `stream_message()`.
    """

    def with_model(self, provider: str, model: str) -> "ChatSession": ...
    def with_tools(self, tools: list) -> "ChatSession": ...
    def with_params(self, **kwargs) -> "ChatSession": ...
    def add_tool_result(self, tool_use_id: str, content: str) -> None: ...
    async def stream_message(self, user_msg: "UserMessage | None" = None): ...


class ImageContent:
    def __init__(self, image_base64: str):
        self.image_base64 = image_base64


class UserMessage:
    def __init__(self, text: str, file_contents: list[ImageContent] | None = None):
        self.text = text
        self.file_contents = file_contents


class TextDelta:
    def __init__(self, content: str):
        self.content = content


class ToolCallStart:
    def __init__(self, name: str, id: str):
        self.name = name
        self.id = id


class ToolCallReady:
    pass


class StreamDone:
    def __init__(self, tool_calls: list = None, usage: dict | None = None):
        self.tool_calls = tool_calls or []
        # {"input_tokens": int, "output_tokens": int} cuando el proveedor lo reporta;
        # None si no vino (p.ej. algún error de streaming a mitad de camino).
        self.usage = usage


class ToolCall:
    def __init__(self, id: str, name: str, arguments: dict):
        self.id = id
        self.name = name
        self.arguments = arguments


class LlmChat:
    """Sesión de chat con Claude con soporte para historial y Tool Use."""

    def __init__(self, api_key: str, session_id: str, system_message: str, initial_messages: list):
        self.api_key = api_key
        self.session_id = session_id
        self.system_message = system_message
        self.tools = []
        self.params = {}
        self.model_name = "claude-sonnet-4-6"
        self.client = AsyncAnthropic(api_key=api_key)
        self.pending_tool_results = []

        self.messages = []
        for msg in initial_messages:
            role = msg.get("role")
            if role == "system":
                continue
            self.messages.append({"role": role, "content": msg.get("content", "")})

    def with_model(self, provider: str, model: str):
        self.model_name = model
        return self

    def with_tools(self, tools: list):
        self.tools = tools
        return self

    def with_params(self, **kwargs):
        self.params.update(kwargs)
        return self

    def add_tool_result(self, tool_use_id: str, content: str):
        self.pending_tool_results.append({
            "type": "tool_result",
            "tool_use_id": tool_use_id,
            "content": content,
        })

    async def stream_message(self, user_msg: UserMessage | None = None):
        """Generador asíncrono que emite TextDelta, ToolCallStart y StreamDone."""
        if self.pending_tool_results:
            self.messages.append({
                "role": "user",
                "content": list(self.pending_tool_results),
            })
            self.pending_tool_results.clear()
        elif user_msg is not None:
            if user_msg.file_contents:
                content = []
                for item in user_msg.file_contents:
                    content.append({
                        "type": "image",
                        "source": {"type": "base64", "media_type": "image/jpeg", "data": item.image_base64},
                    })
                content.append({"type": "text", "text": user_msg.text})
            else:
                content = user_msg.text
            self.messages.append({"role": "user", "content": content})

        anthropic_tools = []
        for t in self.tools:
            if t.get("type") == "function":
                func = t["function"]
                anthropic_tools.append({
                    "name": func["name"],
                    "description": func["description"],
                    "input_schema": func["parameters"],
                })
            else:
                anthropic_tools.append(t)

        assistant_text = ""
        tool_uses = []
        current_tool = None
        usage = {"input_tokens": 0, "output_tokens": 0}

        create_kwargs = dict(
            model=self.model_name,
            max_tokens=self.params.get("max_tokens", 4096),
            system=self.system_message,
            messages=self.messages,
            stream=True,
        )
        if anthropic_tools:
            # Omitimos la clave por completo si no hay tools: la API de Anthropic
            # rechaza "tools": null (espera un array u omitir el parámetro).
            create_kwargs["tools"] = anthropic_tools

        async for event in await self.client.messages.create(**create_kwargs):
            if event.type == "message_start":
                # Anthropic reporta los input_tokens reales (incluye caché) aquí.
                msg_usage = getattr(event.message, "usage", None)
                if msg_usage is not None:
                    usage["input_tokens"] = getattr(msg_usage, "input_tokens", 0) or 0
            elif event.type == "content_block_start":
                cb = event.content_block
                if cb.type == "tool_use":
                    current_tool = {"id": cb.id, "name": cb.name, "input_str": ""}
                    yield ToolCallStart(name=cb.name, id=cb.id)
            elif event.type == "content_block_delta":
                delta = event.delta
                if delta.type == "text_delta":
                    assistant_text += delta.text
                    yield TextDelta(content=delta.text)
                elif delta.type == "input_json_delta" and current_tool is not None:
                    current_tool["input_str"] += delta.partial_json
            elif event.type == "content_block_stop":
                if current_tool is not None:
                    tool_uses.append(current_tool)
                    current_tool = None
            elif event.type == "message_delta":
                # Si el modelo llegó al límite de tokens con un tool en progreso, cerrarlo
                if getattr(event.delta, "stop_reason", None) == "max_tokens" and current_tool is not None:
                    tool_uses.append(current_tool)
                    current_tool = None
                # message_delta.usage.output_tokens es acumulativo (el último valor recibido es el total)
                delta_usage = getattr(event, "usage", None)
                if delta_usage is not None:
                    usage["output_tokens"] = getattr(delta_usage, "output_tokens", 0) or usage["output_tokens"]

        content_blocks = []
        if assistant_text:
            content_blocks.append({"type": "text", "text": assistant_text})

        tool_call_objs = []
        for tc in tool_uses:
            try:
                args = json.loads(tc["input_str"])
            except Exception:
                args = {}
            content_blocks.append({"type": "tool_use", "id": tc["id"], "name": tc["name"], "input": args})
            tool_call_objs.append(ToolCall(tc["id"], tc["name"], args))

        self.messages.append({"role": "assistant", "content": content_blocks})
        yield StreamDone(tool_calls=tool_call_objs, usage=usage)


class OpenAiChat:
    """Sesión de chat con modelos GPT (OpenAI). Misma interfaz pública que LlmChat
    (with_model/with_tools/with_params/add_tool_result/stream_message) y los mismos
    eventos (TextDelta/ToolCallStart/StreamDone) — el orquestador no distingue entre
    ambas clases, solo consume estos eventos.
    """

    def __init__(self, api_key: str, session_id: str, system_message: str, initial_messages: list, base_url: str | None = None):
        self.api_key = api_key
        self.session_id = session_id
        self.system_message = system_message
        self.tools = []
        self.params = {}
        self.model_name = "gpt-5.5"
        self.provider = "openai"
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self.pending_tool_results = []

        self.messages = [{"role": "system", "content": system_message}]
        for msg in initial_messages:
            role = msg.get("role")
            if role == "system":
                continue
            self.messages.append({"role": role, "content": msg.get("content", "")})

    def with_model(self, provider: str, model: str):
        self.model_name = model
        self.provider = provider
        return self

    def with_tools(self, tools: list):
        # El registro de tools de T.H.E.M.I.S. (app/tools/registry.py) ya está en formato
        # OpenAI ({"type": "function", "function": {...}}) — a diferencia de LlmChat
        # (Claude), aquí no hace falta convertir nada.
        self.tools = tools
        return self

    def with_params(self, **kwargs):
        self.params.update(kwargs)
        return self

    def add_tool_result(self, tool_use_id: str, content: str):
        self.pending_tool_results.append({
            "role": "tool",
            "tool_call_id": tool_use_id,
            "content": content,
        })

    async def stream_message(self, user_msg: UserMessage | None = None):
        """Generador asíncrono que emite TextDelta, ToolCallStart y StreamDone."""
        if self.pending_tool_results:
            # A diferencia de Claude (que agrupa todos los tool_result en UN mensaje user),
            # OpenAI espera un mensaje separado con role="tool" por cada tool_call_id.
            self.messages.extend(self.pending_tool_results)
            self.pending_tool_results.clear()
        elif user_msg is not None:
            if user_msg.file_contents:
                content = [{"type": "text", "text": user_msg.text}]
                for item in user_msg.file_contents:
                    content.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{item.image_base64}"},
                    })
            else:
                content = user_msg.text
            self.messages.append({"role": "user", "content": content})

        assistant_text = ""
        tool_calls_acc: dict[int, dict] = {}
        started_indexes = set()
        usage = {"input_tokens": 0, "output_tokens": 0}

        create_kwargs = dict(
            model=self.model_name,
            max_completion_tokens=self.params.get("max_tokens", 4096),
            messages=self.messages,
            stream=True,
            stream_options={"include_usage": True},
        )
        if self.tools:
            create_kwargs["tools"] = self.tools
            if self.provider == "openai":
                # Modelos GPT-5.x no permiten tools con reasoning_effort distinto de
                # 'none' en /v1/chat/completions. El SDK puede enviarlo por defecto
                # para estos modelos, así que lo explicitamos.
                create_kwargs["reasoning_effort"] = "none"
            elif self.provider == "deepseek":
                # La API de DeepSeek no reconoce 'none' como valor de reasoning_effort
                # (solo high/low/medium/max/xhigh) — a diferencia de OpenAI, aquí un
                # valor inválido devuelve 400 y rompe toda llamada con tools. 'low'
                # mantiene el modelo rápido para tool-calling sin desactivar el campo.
                create_kwargs["reasoning_effort"] = "low"

        # Reintenta la apertura del stream ante errores transitorios de OpenAI
        # (401/429/5xx intermitentes en modelos GPT-5.6). Seguro porque aún no
        # se ha emitido ningún token. El último intento re-lanza la excepción.
        for attempt in range(_MAX_STREAM_RETRIES):
            try:
                stream = await self.client.chat.completions.create(**create_kwargs)
                break
            except Exception as exc:
                if not _is_transient_openai_error(exc) or attempt == _MAX_STREAM_RETRIES - 1:
                    raise
                await asyncio.sleep(0.6 * (attempt + 1))

        async for chunk in stream:
            # El chunk final (con include_usage) trae el conteo real y choices vacío.
            if chunk.usage:
                usage["input_tokens"] = chunk.usage.prompt_tokens or 0
                usage["output_tokens"] = chunk.usage.completion_tokens or 0
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta.content:
                assistant_text += delta.content
                yield TextDelta(content=delta.content)
            if delta.tool_calls:
                for tc_delta in delta.tool_calls:
                    idx = tc_delta.index
                    entry = tool_calls_acc.setdefault(idx, {"id": None, "name": None, "arguments": ""})
                    if tc_delta.id:
                        entry["id"] = tc_delta.id
                    if tc_delta.function and tc_delta.function.name:
                        entry["name"] = tc_delta.function.name
                    if tc_delta.function and tc_delta.function.arguments:
                        entry["arguments"] += tc_delta.function.arguments
                    if idx not in started_indexes and entry["id"] and entry["name"]:
                        started_indexes.add(idx)
                        yield ToolCallStart(name=entry["name"], id=entry["id"])

        assistant_msg = {"role": "assistant", "content": assistant_text or None}

        tool_call_objs = []
        if tool_calls_acc:
            openai_tool_calls = []
            for entry in tool_calls_acc.values():
                try:
                    args = json.loads(entry["arguments"]) if entry["arguments"] else {}
                except Exception:
                    args = {}
                openai_tool_calls.append({
                    "id": entry["id"],
                    "type": "function",
                    "function": {"name": entry["name"], "arguments": entry["arguments"] or "{}"},
                })
                tool_call_objs.append(ToolCall(entry["id"], entry["name"], args))
            assistant_msg["tool_calls"] = openai_tool_calls

        self.messages.append(assistant_msg)
        yield StreamDone(tool_calls=tool_call_objs, usage=usage)


def create_chat(provider: str, api_key: str, session_id: str, system_message: str, initial_messages: list):
    """Fábrica: instancia el cliente correcto (Claude u OpenAI) detrás de la misma interfaz pública."""
    if provider == "deepseek":
        return OpenAiChat(api_key=api_key, session_id=session_id, system_message=system_message, initial_messages=initial_messages, base_url="https://api.deepseek.com")
    cls = OpenAiChat if provider == "openai" else LlmChat
    return cls(api_key=api_key, session_id=session_id, system_message=system_message, initial_messages=initial_messages)
