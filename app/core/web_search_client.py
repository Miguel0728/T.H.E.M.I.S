"""Cliente de búsqueda web general (sin API key) — usado por la tool `web_search`
del chat conversacional para que T.H.E.M.I.S. pueda consultar la web abierta
cuando no tiene la información (a diferencia de `search_news`/`get_news`, que
están acotadas a artículos de NewsAPI).

Usa el endpoint HTML de DuckDuckGo (https://html.duckduckgo.com/html/), que no
requiere registro ni API key, a costa de resultados algo menos ricos que un
proveedor dedicado (Tavily/Brave/Serper). Se parsea con regex simple en vez de
sumar una dependencia nueva (bs4), siguiendo el mismo criterio minimalista que
`rss_client.py`.
"""
import asyncio
import html
import ipaddress
import re
import socket
from urllib.parse import unquote, urlparse

import httpx

_SEARCH_URL = "https://html.duckduckgo.com/html/"

# Cada resultado en el HTML de DuckDuckGo Lite tiene esta forma:
# <a class="result__a" href="...">Título</a> ... <a class="result__snippet" ...>Snippet</a>
_RESULT_RE = re.compile(
    r'<a[^>]+class="result__a"[^>]+href="(?P<url>[^"]+)"[^>]*>(?P<title>.*?)</a>'
    r'.*?class="result__snippet"[^>]*>(?P<snippet>.*?)</a>',
    re.DOTALL,
)
_TAG_RE = re.compile(r"<[^>]+>")


def _clean(raw: str) -> str:
    return html.unescape(_TAG_RE.sub("", raw)).strip()


def _unwrap_redirect(url: str) -> str:
    """DuckDuckGo envuelve los links en /l/?uddg=<url_encoded>; nos quedamos con
    el destino real para que la fuente sea navegable y verificable."""
    m = re.search(r"uddg=([^&]+)", url)
    if not m:
        return url
    return unquote(m.group(1))


async def _validate_public_url(url: str) -> None:
    """Rechaza destinos no HTTP y redes privadas antes de solicitarlos."""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("La URL debe usar http o https")
    try:
        addresses = await asyncio.to_thread(socket.getaddrinfo, parsed.hostname, None)
    except socket.gaierror as error:
        raise ValueError("No se pudo resolver el dominio") from error
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError("No se permiten direcciones privadas o locales")


async def web_search(query: str, max_results: int = 6, timeout: float = 12) -> list[dict]:
    """Busca en la web abierta y devuelve una lista de {title, url, snippet}."""
    async with httpx.AsyncClient(timeout=timeout, headers={"User-Agent": "Mozilla/5.0"}) as client:
        resp = await client.post(_SEARCH_URL, data={"q": query})
        resp.raise_for_status()
        # DuckDuckGo sirve UTF-8 pero no siempre lo declara en el header
        # Content-Type; sin esto httpx cae a su detección genérica y corrompe
        # acentos/ñ (ej. "Planificación" -> "Planificaci�n").
        body = resp.content.decode("utf-8", errors="ignore")

    results = []
    for m in _RESULT_RE.finditer(body):
        title = _clean(m.group("title"))
        url = _unwrap_redirect(m.group("url"))
        snippet = _clean(m.group("snippet"))
        if title and url:
            results.append({"title": title, "url": url, "snippet": snippet})
        if len(results) >= max_results:
            break

    return results


# Tags cuyo contenido es ruido (código, estilos, navegación) y se descarta
# entero antes de extraer texto — a diferencia de _TAG_RE, que solo pela las
# etiquetas pero deja el contenido.
_NOISE_TAG_RE = re.compile(r"<(script|style|nav|footer|header|noscript)[^>]*>.*?</\1>", re.DOTALL | re.IGNORECASE)
_MULTI_SPACE_RE = re.compile(r"[ \t]+")
_MULTI_NEWLINE_RE = re.compile(r"\n{3,}")
_BLOCK_TAG_RE = re.compile(r"</(p|div|li|h[1-6]|br|tr)>", re.IGNORECASE)

MAX_PAGE_TEXT_CHARS = 6000


def html_to_text(raw_html: str, max_chars: int = MAX_PAGE_TEXT_CHARS) -> str:
    """Convierte HTML crudo a texto legible: quita script/style/nav/footer,
    fuerza salto de línea en cierres de bloque para no pegar párrafos, pela el
    resto de etiquetas y colapsa espacios. No es un extractor de 'contenido
    principal' (eso requeriría heurísticas tipo readability) — es deliberadamente
    simple, igual que `_clean` de arriba, y sirve para que el LLM pueda leer el
    texto de una página tras encontrarla con `web_search`."""
    body = _NOISE_TAG_RE.sub(" ", raw_html)
    body = _BLOCK_TAG_RE.sub("\n", body)
    body = _TAG_RE.sub(" ", body)
    text = html.unescape(body)
    text = _MULTI_SPACE_RE.sub(" ", text)
    text = "\n".join(line.strip() for line in text.split("\n"))
    text = _MULTI_NEWLINE_RE.sub("\n\n", text).strip()
    return text[:max_chars]


async def fetch_page_text(url: str, timeout: float = 15) -> str:
    """Descarga una URL y devuelve su texto legible (ver html_to_text). Usada
    por la tool `fetch_page` del chat para leer el contenido real de un
    resultado de `web_search` cuando el snippet no alcanza (ej. datos que
    cambian constantemente como clima, precios, resultados en vivo)."""
    async with httpx.AsyncClient(timeout=timeout, headers={"User-Agent": "Mozilla/5.0"}) as client:
        for _ in range(5):
            await _validate_public_url(url)
            resp = await client.get(url, follow_redirects=False)
            if not resp.is_redirect:
                resp.raise_for_status()
                return html_to_text(resp.content.decode(resp.encoding or "utf-8", errors="ignore"))
            url = str(resp.url.join(resp.headers.get("location", "")))
    raise ValueError("Demasiadas redirecciones o redirección inválida")
