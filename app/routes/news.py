"""Feed de Noticias del modo Chat — pestaña dedicada: el usuario elige la región
y cuándo recargar. El LLM conversacional consulta el mismo feed bajo pedido a
través de la tool `get_news` (app/tools/news_tools.py + app/agents/chat_engine.py)."""
import logging

import httpx
from fastapi import APIRouter, HTTPException

from app.config.settings import NEWS_API_KEY
from app.core import news_client

logger = logging.getLogger("cosmo")
news_router = APIRouter(prefix="/api")


@news_router.get("/news")
async def get_news(region: str = "all"):
    if not NEWS_API_KEY:
        raise HTTPException(400, "La sección de Noticias requiere NEWS_API configurada en el servidor.")

    try:
        if region == "pr":
            articles = await news_client.get_pr_news(NEWS_API_KEY)
        elif region == "us":
            articles = await news_client.get_us_headlines(NEWS_API_KEY)
        else:
            # "all": combina ambas fuentes y ordena por fecha descendente
            us = await news_client.get_us_headlines(NEWS_API_KEY)
            pr = await news_client.get_pr_news(NEWS_API_KEY)
            combined = us + pr
            combined.sort(key=lambda a: a.get("publishedAt") or "", reverse=True)
            articles = combined
    except httpx.HTTPStatusError as e:
        logger.exception("news api error")
        raise HTTPException(502, f"Error de NewsAPI ({e.response.status_code}): {e.response.text[:200]}")
    except Exception as e:
        logger.exception("news error")
        raise HTTPException(502, f"Error cargando noticias: {e}")

    return {"region": region, "articles": articles}
