"""
Módulo de síntesis de voz utilizando Fish Audio API (HTTP).
Integra la voz de J.A.R.V.I.S. (Paul Bettany) en T.H.E.M.I.S.
"""
import os
import io
import base64
import httpx

# ID del modelo de J.A.R.V.I.S. en Fish Audio (modelo público #1)
JARVIS_VOICE_ID = "612b878b113047d9a770c069c8b4fdfe"

FISH_TTS_URL = "https://api.fish.audio/v1/tts"


def _get_api_key() -> str:
    api_key = os.getenv("FISH_API_KEY")
    if not api_key:
        raise RuntimeError("FISH_API_KEY no configurada en el archivo .env")
    return api_key


async def speak(text: str, voice_id: str = JARVIS_VOICE_ID) -> bytes:
    """
    Convierte texto a voz usando el modelo de J.A.R.V.I.S.

    Args:
        text: Texto a convertir (máx. 2000 caracteres por llamada)
        voice_id: ID del modelo de voz (por defecto J.A.R.V.I.S.)

    Returns:
        bytes: Audio MP3 generado
    """
    api_key = _get_api_key()

    payload = {
        "text": text[:2000],
        "reference_id": voice_id,
        "format": "mp3",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            FISH_TTS_URL,
            json=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        )

        if response.status_code != 200:
            detail = "Error desconocido"
            try:
                detail = response.json()
            except Exception:
                detail = response.text or f"HTTP {response.status_code}"
            raise RuntimeError(f"Fish Audio API error: {detail}")

        return response.content


async def speak_base64(text: str, voice_id: str = JARVIS_VOICE_ID) -> str:
    """
    Convierte texto a voz y lo devuelve como string base64
    para incrustar directamente en HTML como data URI.
    """
    audio_bytes = await speak(text, voice_id)
    return base64.b64encode(audio_bytes).decode("utf-8")
