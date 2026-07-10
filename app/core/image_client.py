"""Cliente de generación de imágenes — funcionalidad directa, no una tool de agente.

El modo Chat expone un botón dedicado que llama esto explícitamente cuando el
usuario lo pide; el LLM conversacional nunca decide invocarlo por su cuenta.
"""
import base64
import httpx
from openai import AsyncOpenAI


async def generate_image(api_key: str, model: str, prompt: str, size: str = "1024x1024") -> bytes:
    """Genera una imagen y devuelve los bytes PNG decodificados.

    No pasamos response_format: los modelos gpt-image-* no aceptan ese parámetro
    (a diferencia de dall-e-2/3) y siempre devuelven b64_json por defecto.
    """
    client = AsyncOpenAI(api_key=api_key)
    result = await client.images.generate(model=model, prompt=prompt, size=size, n=1)
    image = result.data[0]
    if image.b64_json:
        return base64.b64decode(image.b64_json)
    # Fallback defensivo por si el modelo devolviera una URL en su lugar
    async with httpx.AsyncClient() as http_client:
        resp = await http_client.get(image.url, timeout=30)
        resp.raise_for_status()
        return resp.content
