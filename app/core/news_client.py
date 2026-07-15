"""Cliente del feed de Noticias del modo Chat. Lo usan dos consumidores:
la pestaña dedicada de Noticias (carga directa, controlada por el usuario) y
la tool `get_news` del chat conversacional (app/tools/news_tools.py), que
reusa el mismo caché para resumir noticias bajo pedido.

Estados Unidos usa NewsAPI.org (tiene código de país). Puerto Rico usa
directamente RSS de varios medios locales: probamos restringir NewsAPI a medios
puertorriqueños (El Nuevo Día, Primera Hora, Metro PR, NotiCel, El Vocero) y
ninguno está indexado ahí (0 resultados incluso sin filtro de tema), así que
para cubrir estas fuentes hace falta ir directo a cada una.

El feed de PR es una mezcla deliberada de tres temas (gobierno, tecnología y
farándula/entretenimiento) combinando El Nuevo Día, Primera Hora y NotiCel —
cada medio no cubre los tres temas por igual (ej. El Nuevo Día casi no tiene
tecnología, Primera Hora no tiene sección de tecnología), así que se pide a
cada uno la categoría que sí cubre bien y se combinan los resultados.
"""
import asyncio
import time
import httpx

from app.core.rss_client import fetch_rss_articles

BASE_URL = "https://newsapi.org/v2"

# (tema, nombre de fuente para mostrar, URL del feed RSS de esa categoría).
# Verificado manualmente que cada uno devuelve items reales antes de agregarlo:
# algunas combinaciones categoría/medio existen en la CMS pero vienen vacías
# (ej. primerahora "tecnologia" y elnuevodia "noticias/puertorico"). El tema se
# usa para repartir el resultado final en partes iguales entre gobierno,
# tecnología y farándula — si solo ordenáramos por fecha, entretenimiento (que
# publica muchísimo más volumen) opacaría a los otros dos temas.
PR_RSS_FEEDS = [
    ("gobierno", "El Nuevo Día", "https://www.elnuevodia.com/arc/outboundfeeds/rss/category/noticias/gobierno/?outputType=xml"),
    ("gobierno", "NotiCel", "https://noticel.com/gobierno/feed/"),
    ("tecnologia", "NotiCel", "https://noticel.com/tecnologia/feed/"),
    ("tecnologia", "El Nuevo Día", "https://www.elnuevodia.com/arc/outboundfeeds/rss/category/tecnologia/?outputType=xml"),
    ("farandula", "El Nuevo Día", "https://www.elnuevodia.com/arc/outboundfeeds/rss/category/entretenimiento/?outputType=xml"),
    ("farandula", "Primera Hora", "https://www.primerahora.com/arc/outboundfeeds/rss/category/entretenimiento/?outputType=xml"),
    ("farandula", "NotiCel", "https://noticel.com/entretenimiento/feed/"),
]

# El plan gratuito de NewsAPI permite solo 100 requests/día — cacheamos por
# región para que alternar pestañas no lo agote en una sola sesión.
CACHE_TTL_SECONDS = 600  # 10 minutos

_cache: dict[str, tuple[float, list[dict]]] = {}


def _normalize(articles: list[dict]) -> list[dict]:
    return [
        {
            "title": a.get("title"),
            "description": a.get("description"),
            "url": a.get("url"),
            "image": a.get("urlToImage"),
            "source": (a.get("source") or {}).get("name", ""),
            "publishedAt": a.get("publishedAt"),
        }
        for a in articles
        if a.get("title") and a.get("title") != "[Removed]"
    ]


async def _get_json(path: str, params: dict) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{BASE_URL}/{path}", params=params)
        resp.raise_for_status()
        return resp.json()


async def _cached_fetch(cache_key: str, path: str, params: dict) -> list[dict]:
    """Sirve del caché si está fresco; si no, consulta NewsAPI y lo renueva."""
    cached = _cache.get(cache_key)
    if cached and (time.monotonic() - cached[0]) < CACHE_TTL_SECONDS:
        return cached[1]

    data = _normalize((await _get_json(path, params)).get("articles", []))
    _cache[cache_key] = (time.monotonic(), data)
    return data


async def get_us_headlines(api_key: str, page_size: int = 24) -> list[dict]:
    """Titulares principales de Estados Unidos (top-headlines por país)."""
    return await _cached_fetch(
        "us", "top-headlines",
        {"country": "us", "pageSize": page_size, "apiKey": api_key},
    )


# Respaldo si el RSS de El Nuevo Día falla: palabras clave que acotan NewsAPI
# a la esfera de gobierno (no PR en general), aunque no indexe medios locales.
PR_GOV_QUERY = (
    'gobierno OR gobernador OR legislatura OR Fortaleza OR alcalde OR senado '
    'OR "cámara de representantes" OR "junta de supervisión fiscal"'
)


async def _fetch_one_pr_feed(topic: str, source_name: str, url: str) -> list[dict]:
    """Trae un feed individual; si falla (medio caído, categoría vacía, etc.)
    devuelve lista vacía en vez de tumbar el resto de las fuentes."""
    try:
        articles = await fetch_rss_articles(url)
    except Exception:
        return []
    for a in articles:
        a["source"] = source_name
        a["topic"] = topic
    return articles


def _dedupe_by_url(articles: list[dict]) -> list[dict]:
    seen_urls: set[str] = set()
    deduped = []
    for a in articles:
        url = a.get("url")
        if url and url in seen_urls:
            continue
        if url:
            seen_urls.add(url)
        deduped.append(a)
    return deduped


async def _pr_news_from_rss(page_size: int) -> list[dict]:
    """Combina gobierno + tecnología + farándula de varios medios de PR y
    reparte el resultado en partes iguales entre los tres temas (round-robin,
    cada tema ordenado internamente por fecha descendente), en vez de dejar
    que el volumen de un tema opaque a los demás."""
    results = await asyncio.gather(*(_fetch_one_pr_feed(topic, name, url) for topic, name, url in PR_RSS_FEEDS))

    by_topic: dict[str, list[dict]] = {}
    for feed_articles in results:
        for a in feed_articles:
            by_topic.setdefault(a["topic"], []).append(a)

    for topic_articles in by_topic.values():
        topic_articles.sort(key=lambda a: a.get("publishedAt") or "", reverse=True)

    # Round-robin: una de cada tema por turno, hasta agotar todos.
    topics = list(by_topic.keys())
    combined: list[dict] = []
    idx = 0
    while any(by_topic.values()):
        topic = topics[idx % len(topics)]
        bucket = by_topic[topic]
        if bucket:
            combined.append(bucket.pop(0))
        idx += 1

    return _dedupe_by_url(combined)[:page_size]


async def _pr_news_fallback(api_key: str, page_size: int) -> list[dict]:
    """Se usa solo si TODOS los RSS de PR fallan o quedan vacíos (caso raro).
    Es puramente de gobierno porque NewsAPI no indexa medios puertorriqueños
    para tecnología/farándula (ver docstring del módulo)."""
    data = await _get_json("everything", {
        "q": PR_GOV_QUERY,
        "language": "es",
        "sortBy": "publishedAt",
        "pageSize": page_size,
        "apiKey": api_key,
    })
    return _normalize(data.get("articles", []))


async def search_news(api_key: str, query: str, language: str = "es", page_size: int = 10) -> list[dict]:
    """Búsqueda libre sobre /v2/everything — a diferencia de get_us_headlines/get_pr_news
    (feeds fijos por región), esta trae artículos de cualquier medio indexado que
    mencionen `query`. La usa la tool `search_news` del chat para profundizar en un
    tema puntual (ej. "abunda más sobre X") en vez de repetir el feed general.
    No se cachea por región fija: la key incluye la query para no mezclar resultados
    de búsquedas distintas, pero sigue respetando el mismo TTL para no gastar cuota
    si se repite la misma pregunta."""
    cache_key = f"search:{language}:{query.strip().lower()}"
    cached = _cache.get(cache_key)
    if cached and (time.monotonic() - cached[0]) < CACHE_TTL_SECONDS:
        return cached[1][:page_size]

    data = await _get_json("everything", {
        "q": query,
        "language": language,
        "sortBy": "relevancy",
        "pageSize": max(page_size, 10),
        "apiKey": api_key,
    })
    articles = _normalize(data.get("articles", []))
    _cache[cache_key] = (time.monotonic(), articles)
    return articles[:page_size]


async def get_pr_news(api_key: str, page_size: int = 24) -> list[dict]:
    """Mezcla de gobierno + tecnología + farándula de Puerto Rico, directo del
    RSS de varios medios locales (la fuente real que los cubre, a diferencia
    de NewsAPI). Ver PR_RSS_FEEDS."""
    cache_key = "pr"
    cached = _cache.get(cache_key)
    if cached and (time.monotonic() - cached[0]) < CACHE_TTL_SECONDS:
        return cached[1]

    try:
        articles = await _pr_news_from_rss(page_size)
    except Exception:
        articles = []
    if not articles:
        articles = await _pr_news_fallback(api_key, page_size)

    _cache[cache_key] = (time.monotonic(), articles)
    return articles
