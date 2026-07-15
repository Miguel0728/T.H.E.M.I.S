"""Tool para que Claude descargue páginas externas como referencia de diseño/contenido,
y tool de búsqueda web general para el chat conversacional."""
import urllib.request

from app.core import web_search_client

MAX_WEB_SEARCH_RESULTS = 6


def fetch_url(url: str) -> dict:
    """Descarga el HTML de una URL para que Claude lo use como referencia visual/estructural."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            html = r.read().decode("utf-8", errors="ignore")
            return {"ok": True, "url": url, "content": html[:25000]}
    except Exception as e:
        return {"ok": False, "url": url, "error": str(e)}


async def web_search(query: str, limit: int = MAX_WEB_SEARCH_RESULTS) -> dict:
    """Búsqueda web general (no acotada a noticias) para que el chat pueda
    responder con información que no tiene de memoria o que necesita verificar
    en tiempo real."""
    query = (query or "").strip()
    if not query:
        return {"ok": False, "error": "Falta el término de búsqueda."}

    limit = max(1, min(limit or MAX_WEB_SEARCH_RESULTS, MAX_WEB_SEARCH_RESULTS))

    try:
        results = await web_search_client.web_search(query, max_results=limit)
    except Exception as e:
        return {"ok": False, "error": f"Error buscando '{query}': {e}"}

    return {"ok": True, "query": query, "count": len(results), "results": results}


async def fetch_page(url: str) -> dict:
    """Lee el texto legible de una URL (normalmente un resultado de `web_search`)
    cuando el snippet de la búsqueda no trae el dato concreto que se necesita."""
    url = (url or "").strip()
    if not url:
        return {"ok": False, "error": "Falta la URL a leer."}

    try:
        text = await web_search_client.fetch_page_text(url)
    except Exception as e:
        return {"ok": False, "url": url, "error": f"Error leyendo '{url}': {e}"}

    return {"ok": True, "url": url, "content": text}
