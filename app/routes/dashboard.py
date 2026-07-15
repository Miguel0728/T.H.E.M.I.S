"""Endpoint de métricas para la sección de Dashboard: agrega conteos de las
distintas tablas (proyectos, chats, galería), estado de salud del sistema
(API keys configuradas) y clima/hora en vivo. No agrega tools nuevas al LLM —
es lectura directa para la UI, en el mismo espíritu que /api/gallery o
/api/news (datos servidos directo, no vía agente)."""
import time
from datetime import datetime, timezone

from fastapi import APIRouter

from app.config.settings import EMERGENT_LLM_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY, NEWS_API_KEY, MODELS, MODEL_TOKEN_BUDGET
from app.core import news_client, weather_client
from app.database.connection import db_fetch_one, db_fetch_all

dashboard_router = APIRouter(prefix="/api")

_START_TIME = time.monotonic()

DEFAULT_WEATHER_LOCATION = "San Juan, Puerto Rico"


async def _today_token_usage() -> list[dict]:
    """Tokens consumidos hoy (UTC) por modelo, contra el presupuesto configurado
    en MODEL_TOKEN_BUDGET — alimenta los gauges de la sección de salud del sistema."""
    today_start = datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00")
    rows = await db_fetch_all(
        """SELECT model, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens
           FROM token_usage WHERE created_at >= ? GROUP BY model""",
        (today_start,),
    )
    usage_by_model = {r["model"]: (r["input_tokens"] or 0) + (r["output_tokens"] or 0) for r in rows}

    result = []
    for model_id, meta in MODELS.items():
        budget = MODEL_TOKEN_BUDGET.get(model_id)
        used = usage_by_model.get(model_id, 0)
        result.append({
            "model": model_id,
            "name": meta["name"],
            "provider": meta["provider"],
            "used": used,
            "budget": budget,
            "pct": round(min(used / budget, 1) * 100, 1) if budget else None,
        })
    return result


@dashboard_router.get("/dashboard/stats")
async def get_dashboard_stats(location: str = DEFAULT_WEATHER_LOCATION):
    projects_row = await db_fetch_one("SELECT COUNT(*) AS n FROM projects")
    chats_row = await db_fetch_one("SELECT COUNT(*) AS n FROM chats")
    images_row = await db_fetch_one("SELECT COUNT(*) AS n FROM gallery")

    news_count = None
    news_error = None
    if NEWS_API_KEY:
        try:
            us = await news_client.get_us_headlines(NEWS_API_KEY)
            pr = await news_client.get_pr_news(NEWS_API_KEY)
            news_count = len(us) + len(pr)
        except Exception as e:
            news_error = str(e)

    weather = None
    try:
        weather = await weather_client.get_weather(location)
    except Exception as e:
        weather = {"ok": False, "error": str(e)}

    token_usage = await _today_token_usage()

    return {
        "counts": {
            "projects": projects_row["n"] if projects_row else 0,
            "chats": chats_row["n"] if chats_row else 0,
            "images": images_row["n"] if images_row else 0,
            "news": news_count,
        },
        "health": {
            "anthropic": bool(EMERGENT_LLM_KEY),
            "openai": bool(OPENAI_API_KEY),
            "deepseek": bool(DEEPSEEK_API_KEY),
            "news_api": bool(NEWS_API_KEY),
            "news_error": news_error,
            "uptime_seconds": round(time.monotonic() - _START_TIME),
        },
        "weather": weather,
        "token_usage": token_usage,
    }
