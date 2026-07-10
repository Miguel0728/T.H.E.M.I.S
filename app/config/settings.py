"""Configuración central de Kinetix: credenciales, modelos y metadata de fases."""
import os

EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
# OPENAI_API_KEY es opcional: si no está configurada, los modelos GPT simplemente
# no funcionarán (se avisa en tiempo de ejecución), pero Claude sigue operando igual.
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

# Cada modelo declara su proveedor para que el orquestador sepa qué cliente instanciar
# (ver app.core.llm_client.create_chat) y qué API key usar. `tagline` es una
# etiqueta amigable para usuarios no técnicos que no saben qué significa
# "Sonnet" u "Opus"; `recommended` marca el default sugerido en el menú.
MODELS = {
    "claude-haiku-4-5-20251001": {"name": "Claude Haiku 4.5", "provider": "anthropic", "tagline": "Más rápido"},
    "claude-sonnet-4-6": {"name": "Claude Sonnet 4.6", "provider": "anthropic", "tagline": "Equilibrado", "recommended": True},
    "claude-opus-4-8": {"name": "Claude Opus 4.8", "provider": "anthropic", "tagline": "Más capaz"},
    "gpt-5.5": {"name": "GPT-5.5", "provider": "openai", "tagline": "Equilibrado"},
    "gpt-5.4": {"name": "GPT-5.4", "provider": "openai", "tagline": "Más capaz"},
    "gpt-5.4-mini": {"name": "GPT-5.4-mini", "provider": "openai", "tagline": "Más rápido"},
}
DEFAULT_MODEL = "claude-sonnet-4-6"

# Modelo de generación de imágenes del modo Chat. Es una funcionalidad fija
# (botón dedicado), NO una tool que el LLM decide invocar — el usuario controla
# explícitamente cuándo se genera una imagen.
IMAGE_MODEL = "gpt-image-2"

# NewsAPI.org — feed de Noticias del modo Chat. Alimenta tanto la pestaña dedicada
# (app/routes/news.py) como la tool `get_news` del chat conversacional
# (app/agents/chat_engine.py + app/tools/news_tools.py), ambas comparten el mismo
# cliente/caché en app/core/news_client.py.
NEWS_API_KEY = os.environ.get("NEWS_API", "")

# Etiquetas legibles para cada fase/rol que Claude anuncia vía la tool `set_phase`.
# No son agentes/objetos separados: son roles narrados dentro de UNA sola sesión de Claude.
AGENT_LABELS = {
    "producto": "Agente de Producto / Diseño",
    "coder": "Agente de Desarrollo (Coder)",
    "integraciones": "Agente de Integraciones",
    "qa": "Agente de Calidad (QA)",
}

MAX_TOOL_LOOP_ITERATIONS = 28
MAX_TOKENS = 16000

# Tope de mensajes de historial reenviados al LLM en cada turno. Sin esto, una
# conversación larga crece en costo/latencia sin límite hasta romper el
# contexto del modelo.
MAX_HISTORY_MESSAGES = 30
