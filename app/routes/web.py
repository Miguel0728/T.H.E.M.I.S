from pathlib import Path
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

TEMPLATES_DIR = Path(__file__).parent.parent / "templates"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

web_router = APIRouter()


@web_router.get("/app", response_class=HTMLResponse)
async def serve_app(request: Request):
    """Sirve la página principal de la aplicación SPA."""
    return templates.TemplateResponse(name="index.html", context={"request": request})


@web_router.get("/")
async def root_redirect():
    """Redirige el tráfico de la raíz a la ruta de la aplicación web."""
    return RedirectResponse(url="/app")
