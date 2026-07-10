from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import HTMLResponse, RedirectResponse

TEMPLATES_DIR = Path(__file__).parent.parent / "templates"

web_router = APIRouter()


@web_router.get("/app", response_class=HTMLResponse)
async def serve_app():
    """Sirve la página principal de la aplicación SPA."""
    index_file = TEMPLATES_DIR / "index.html"
    return HTMLResponse(index_file.read_text(encoding="utf-8"))


@web_router.get("/")
async def root_redirect():
    """Redirige el tráfico de la raíz a la ruta de la aplicación web."""
    return RedirectResponse(url="/app")
