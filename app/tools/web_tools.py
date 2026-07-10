"""Tool para que Claude descargue páginas externas como referencia de diseño/contenido."""
import urllib.request


def fetch_url(url: str) -> dict:
    """Descarga el HTML de una URL para que Claude lo use como referencia visual/estructural."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            html = r.read().decode("utf-8", errors="ignore")
            return {"ok": True, "url": url, "content": html[:25000]}
    except Exception as e:
        return {"ok": False, "url": url, "error": str(e)}
