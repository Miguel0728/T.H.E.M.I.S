import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

# Cargamos el archivo .env tempranamente
load_dotenv()

# Robustez: Mapeamos la API Key de Anthropic a la variable esperada por el motor de integración si es necesario
if "EMERGENT_LLM_KEY" not in os.environ and "ANTHROPIC_API_KEY" in os.environ:
    os.environ["EMERGENT_LLM_KEY"] = os.environ["ANTHROPIC_API_KEY"]

# Importamos los routers después de haber cargado el entorno
from app.routes.web import web_router
from app.routes.projects import projects_router
from app.routes.chats import chats_router
from app.routes.news import news_router
from app.routes.gallery import gallery_router
from app.routes.dashboard import dashboard_router
from app.routes.tts import router as tts_router

# Inicialización de la aplicación FastAPI
app = FastAPI(
    title="T.H.E.M.I.S. · Studio de Vibe-Coding Agéntico",
    description="Construye aplicaciones web completas en vivo mediante agentes de IA y Claude.",
    version="2.0.0"
)

# Inclusión de enrutadores: uno por dominio (modo Construir, modo Chat, Noticias)
# en vez de un único api.py monolítico, para que cada archivo se mantenga corto.
app.include_router(web_router)
app.include_router(projects_router)
app.include_router(chats_router)
app.include_router(news_router)
app.include_router(gallery_router)
app.include_router(dashboard_router)
app.include_router(tts_router)

# Evitamos que el navegador cachee los estáticos (JS/CSS) durante desarrollo,
# para que los cambios se reflejen siempre al recargar sin caché heurística.
# Al mismo tiempo inyectamos cabeceras de seguridad básicas en todas las
# respuestas HTTP (X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
# Permissions-Policy), sin romper la carga de recursos CDN (Tailwind, marked.js)
# ni la comunicación SSE entre frontend y backend en localhost.
@app.middleware("http")
async def no_cache_static(request, call_next):
    response = await call_next(request)

    # ── Cabeceras de seguridad ────────────────────────────────────────────
    response.headers["X-Content-Type-Options"] = "nosniff"
    # En desarrollo no fijamos X-Frame-Options para permitir que la Vista Previa
    # (que embebe la app desde otro origen) pueda renderizarla dentro de su iframe.
    # En producción conviene reintroducir una política CSP frame-ancestors acotada.
    response.headers["Content-Security-Policy"] = "frame-ancestors *"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # No se captura cámara, micrófono ni geolocalización desde el navegador.
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"

    # ── Cache-Control para estáticos ──────────────────────────────────────
    if request.url.path.startswith("/api/static"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"

    return response


# Montaje de archivos estáticos
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/api/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
