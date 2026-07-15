"""Cliente de clima — usado por la tool `get_weather` del chat conversacional.

Usa Open-Meteo (https://open-meteo.com), gratis y sin API key: primero
geocodifica el lugar por nombre (geocoding-api) y luego pide el pronóstico
actual para esas coordenadas (api.open-meteo.com). A diferencia de `web_search`
+ `fetch_page`, esto devuelve datos numéricos estructurados y confiables en vez
de tener que parsear el texto de una página de clima.
"""
import httpx

_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# https://open-meteo.com/en/docs#weathervariables — códigos WMO resumidos a
# descripciones en español para que el LLM no tenga que traducir el número.
_WEATHER_CODES = {
    0: "despejado", 1: "mayormente despejado", 2: "parcialmente nublado", 3: "nublado",
    45: "neblina", 48: "neblina con escarcha",
    51: "llovizna ligera", 53: "llovizna moderada", 55: "llovizna intensa",
    61: "lluvia ligera", 63: "lluvia moderada", 65: "lluvia intensa",
    71: "nieve ligera", 73: "nieve moderada", 75: "nieve intensa",
    80: "chubascos ligeros", 81: "chubascos moderados", 82: "chubascos violentos",
    95: "tormenta eléctrica", 96: "tormenta con granizo ligero", 99: "tormenta con granizo intenso",
}


async def _geocode_query(client: httpx.AsyncClient, name: str) -> dict | None:
    resp = await client.get(_GEOCODE_URL, params={"name": name, "count": 1, "language": "es"})
    resp.raise_for_status()
    results = resp.json().get("results")
    return results[0] if results else None


async def _geocode(location: str) -> dict | None:
    """El geocoder de Open-Meteo es literal: 'San Juan, Puerto Rico' no matchea
    nada, pero 'San Juan' sí. Probamos la query completa primero (por si el
    usuario da un nombre único) y si no hay resultados, reintentamos solo con
    la parte antes de la primera coma (la ciudad/pueblo, sin país/estado)."""
    async with httpx.AsyncClient(timeout=10) as client:
        place = await _geocode_query(client, location)
        if not place and "," in location:
            place = await _geocode_query(client, location.split(",")[0].strip())
    return place


def _uv_label(uv: float | None) -> str:
    """Clasificación estándar OMS del índice UV, para mostrar junto al número."""
    if uv is None:
        return ""
    if uv < 3:
        return "Bajo"
    if uv < 6:
        return "Moderado"
    if uv < 8:
        return "Alto"
    if uv < 11:
        return "Muy alto"
    return "Extremo"


async def get_weather(location: str) -> dict:
    """Geocodifica `location` y devuelve el clima actual + pronóstico del día."""
    place = await _geocode(location)
    if not place:
        return {"ok": False, "error": f"No pude ubicar '{location}'. Prueba con una ciudad más específica."}

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(_FORECAST_URL, params={
            "latitude": place["latitude"],
            "longitude": place["longitude"],
            "current": "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,pressure_msl",
            "hourly": "visibility,uv_index",
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,weather_code",
            "timezone": "auto",
            "forecast_days": 7,
        })
        resp.raise_for_status()
        data = resp.json()

    current = data.get("current", {})
    daily = data.get("daily", {})
    hourly = data.get("hourly", {})
    code = current.get("weather_code")

    # "current" trae la hora exacta (ej. "2026-07-14T09:32"); "hourly" solo trae
    # lecturas en punto ("...T09:00", "...T10:00", ...). Buscamos la hora en curso
    # truncando los minutos, con fallback al primer valor si no hay match exacto.
    visibility_m = None
    uv_now = None
    current_time = current.get("time")
    hourly_times = hourly.get("time") or []
    if current_time and hourly_times:
        current_hour = current_time[:13] + ":00"
        idx = hourly_times.index(current_hour) if current_hour in hourly_times else 0
        visibility_m = (hourly.get("visibility") or [None] * len(hourly_times))[idx]
        uv_now = (hourly.get("uv_index") or [None] * len(hourly_times))[idx]

    # admin1 suele repetir el nombre del pueblo/ciudad en municipios pequeños
    # (ej. "San Juan" / admin1 "San Juan") — se omite en ese caso para no
    # mostrar "San Juan, San Juan".
    parts = [place.get("name")]
    if place.get("admin1") and place["admin1"] != place.get("name"):
        parts.append(place["admin1"])
    if place.get("country"):
        parts.append(place["country"])
    place_label = ", ".join(p for p in parts if p)

    # Pronóstico de los próximos 6 días (excluye hoy, índice 0) — alimenta la
    # mini-tabla "próximos días" del dashboard.
    daily_dates = daily.get("time") or []
    daily_codes = daily.get("weather_code") or []
    daily_max = daily.get("temperature_2m_max") or []
    daily_min = daily.get("temperature_2m_min") or []
    forecast = [
        {
            "date": daily_dates[i],
            "condition": _WEATHER_CODES.get(daily_codes[i] if i < len(daily_codes) else None, ""),
            "max_c": daily_max[i] if i < len(daily_max) else None,
            "min_c": daily_min[i] if i < len(daily_min) else None,
        }
        for i in range(1, min(7, len(daily_dates)))
    ]

    return {
        "ok": True,
        "location": place_label,
        "timezone": data.get("timezone"),
        "local_time": current.get("time"),
        "current": {
            "temperature_c": current.get("temperature_2m"),
            "feels_like_c": current.get("apparent_temperature"),
            "humidity_pct": current.get("relative_humidity_2m"),
            "precipitation_mm": current.get("precipitation"),
            "wind_kmh": current.get("wind_speed_10m"),
            "pressure_hpa": current.get("pressure_msl"),
            "visibility_km": round(visibility_m / 1000, 1) if visibility_m is not None else None,
            "uv_index": uv_now,
            "condition": _WEATHER_CODES.get(code, f"código {code}"),
        },
        "today": {
            "max_c": (daily.get("temperature_2m_max") or [None])[0],
            "min_c": (daily.get("temperature_2m_min") or [None])[0],
            "rain_probability_pct": (daily.get("precipitation_probability_max") or [None])[0],
            "uv_index_max": (daily.get("uv_index_max") or [None])[0],
            "uv_label": _uv_label((daily.get("uv_index_max") or [None])[0]),
        },
        "forecast": forecast,
    }
