"""Tool de clima del chat conversacional — wrapper delgado sobre weather_client
(Open-Meteo), igual que news_tools envuelve news_client."""
from app.core import weather_client


async def get_weather(location: str) -> dict:
    location = (location or "").strip()
    if not location:
        return {"ok": False, "error": "Falta la ubicación."}

    try:
        return await weather_client.get_weather(location)
    except Exception as e:
        return {"ok": False, "error": f"Error consultando el clima de '{location}': {e}"}
