"""Tool de noticias del modo Chat — permite que el LLM conversacional resuma
noticias bajo pedido, reusando el mismo cliente/caché de app/core/news_client.py
que ya usa la pestaña dedicada de Noticias (app/routes/news.py)."""
from app.config.settings import NEWS_API_KEY
from app.core import news_client

# Tope de artículos que se le pasan al LLM: evita inflar el contexto de la
# conversación con decenas de artículos cuando solo pide un resumen.
MAX_ARTICLES_FOR_CHAT = 10


async def get_news(region: str = "all", limit: int = MAX_ARTICLES_FOR_CHAT) -> dict:
    if not NEWS_API_KEY:
        return {"ok": False, "error": "La sección de Noticias no está configurada en el servidor (falta NEWS_API)."}

    limit = max(1, min(limit or MAX_ARTICLES_FOR_CHAT, MAX_ARTICLES_FOR_CHAT))

    try:
        if region == "pr":
            articles = await news_client.get_pr_news(NEWS_API_KEY)
        elif region == "us":
            articles = await news_client.get_us_headlines(NEWS_API_KEY)
        else:
            region = "all"
            us = await news_client.get_us_headlines(NEWS_API_KEY)
            pr = await news_client.get_pr_news(NEWS_API_KEY)
            combined = us + pr
            combined.sort(key=lambda a: a.get("publishedAt") or "", reverse=True)
            articles = combined
    except Exception as e:
        return {"ok": False, "error": f"Error cargando noticias: {e}"}

    items = [
        {
            "title": a.get("title"),
            "description": a.get("description"),
            "source": a.get("source"),
            "publishedAt": a.get("publishedAt"),
            "url": a.get("url"),
        }
        for a in articles[:limit]
    ]
    return {"ok": True, "region": region, "count": len(items), "articles": items}
