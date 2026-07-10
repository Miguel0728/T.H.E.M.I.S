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

# Inicialización de la aplicación FastAPI
app = FastAPI(
    title="Kinetix · Studio de Vibe-Coding Agéntico",
    description="Construye aplicaciones web completas en vivo mediante agentes de IA y Claude.",
    version="2.0.0"
)

# Inclusión de enrutadores: uno por dominio (modo Construir, modo Chat, Noticias)
# en vez de un único api.py monolítico, para que cada archivo se mantenga corto.
app.include_router(web_router)
app.include_router(projects_router)
app.include_router(chats_router)
app.include_router(news_router)

# Evitamos que el navegador cachee los estáticos (JS/CSS) durante desarrollo,
# para que los cambios se reflejen siempre al recargar sin caché heurística.
@app.middleware("http")
async def no_cache_static(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/static"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


# Montaje de archivos estáticos
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/api/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
