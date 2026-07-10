"""Parser minimalista de feeds RSS (sin dependencias externas) — usado para
fuentes locales que NewsAPI no indexa, como los medios de Puerto Rico."""
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

import httpx

_MEDIA_CONTENT_TAG = "{http://search.yahoo.com/mrss/}content"


def _item_text(item: ET.Element, tag: str) -> str:
    el = item.find(tag)
    return (el.text or "").strip() if el is not None and el.text else ""


def _item_image(item: ET.Element) -> str | None:
    media = item.find(_MEDIA_CONTENT_TAG)
    return media.get("url") if media is not None else None


def _to_iso(pub_date: str) -> str:
    """Convierte la fecha RFC 822 de RSS a ISO 8601, para que se ordene y
    formatee igual que las fechas que llegan de NewsAPI."""
    try:
        return parsedate_to_datetime(pub_date).isoformat()
    except Exception:
        return pub_date


async def fetch_rss_articles(url: str, timeout: float = 10) -> list[dict]:
    """Descarga y parsea un feed RSS 2.0, devolviendo artículos en el mismo
    formato que usa el resto del feed de Noticias."""
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        root = ET.fromstring(resp.content)

    return [
        {
            "title": _item_text(item, "title"),
            "description": _item_text(item, "description"),
            "url": _item_text(item, "link"),
            "image": _item_image(item),
            "publishedAt": _to_iso(_item_text(item, "pubDate")),
        }
        for item in root.iter("item")
    ]
