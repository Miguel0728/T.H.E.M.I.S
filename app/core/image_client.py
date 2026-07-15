"""Cliente de generación de imágenes — funcionalidad directa, no una tool de agente.

El modo Chat expone un botón dedicado que llama esto explícitamente cuando el
usuario lo pide; el LLM conversacional nunca decide invocarlo por su cuenta.
"""
import base64
import httpx
from openai import AsyncOpenAI

# Timeout generoso: prompts largos/detallados con gpt-image-2 pueden tardar varios
# minutos en generarse. 120s era insuficiente y, combinado con los reintentos
# automáticos del SDK (ver max_retries abajo), producía esperas de hasta 6 minutos
# y cobros por múltiples intentos sin que el usuario recibiera nunca una imagen.
_TIMEOUT = 240


async def generate_image(api_key: str, model: str, prompt: str, size: str = "1024x1024") -> bytes:
    """Genera una imagen y devuelve los bytes PNG decodificados.

    No pasamos response_format: gpt-image-1 no acepta ese parámetro — devuelve un
    error 400 "Unknown parameter: 'response_format'" si se envía. Siempre devuelve
    b64_json por defecto, así que no hace falta pedirlo.

    max_retries=0: el SDK de OpenAI reintenta automáticamente 2 veces por defecto
    ante un timeout, multiplicando por 3 tanto la espera como el costo (cada intento
    puede terminar de generarse y cobrarse en el servidor aunque el cliente ya haya
    abandonado la conexión). Preferimos fallar rápido en un solo intento.
    """
    client = AsyncOpenAI(api_key=api_key, timeout=_TIMEOUT, max_retries=0)

    result = await client.images.generate(
        model=model,
        prompt=prompt,
        size=size,
        n=1,
    )
    image = result.data[0]
    if image.b64_json:
        return base64.b64decode(image.b64_json)

    # Fallback defensivo: si por alguna razón el modelo devuelve una URL en lugar de b64
    async with httpx.AsyncClient(timeout=_TIMEOUT) as http_client:
        resp = await http_client.get(image.url)
        resp.raise_for_status()
        return resp.content
