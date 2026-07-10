"""Helpers compartidos entre los routers de /api (fechas, historial de LLM)."""
from datetime import datetime, timezone

from app.database.connection import db_fetch_all
from app.config.settings import MAX_HISTORY_MESSAGES


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def load_recent_history(table: str, fk_column: str, fk_value: str) -> list[dict]:
    """Carga los últimos MAX_HISTORY_MESSAGES mensajes (en orden cronológico)
    para reenviar como contexto al LLM, evitando que conversaciones largas
    crezcan en costo/latencia sin límite."""
    rows = await db_fetch_all(
        f"""SELECT role, content FROM (
                SELECT role, content, created_at FROM {table}
                WHERE {fk_column} = ? ORDER BY created_at DESC LIMIT ?
            ) ORDER BY created_at ASC""",
        (fk_value, MAX_HISTORY_MESSAGES),
    )
    return [{"role": r["role"], "content": r["content"]} for r in rows if r.get("content")]
