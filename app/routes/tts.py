"""Rutas de API para la síntesis de voz con Fish Audio."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.tools.fish_tts import speak_base64

router = APIRouter(prefix="/api/tts", tags=["tts"])

class TTSRequestModel(BaseModel):
    text: str
    voice_id: str = "612b878b113047d9a770c069c8b4fdfe"

class TTSResponse(BaseModel):
    audio_base64: str
    format: str = "mp3"

@router.post("/speak", response_model=TTSResponse)
async def text_to_speech(request: TTSRequestModel):
    """
    Convierte texto a voz usando Fish Audio con la voz de J.A.R.V.I.S.
    Devuelve el audio en base64 para reproducción directa en el navegador.
    """
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="El texto no puede estar vacío")
    
    if len(request.text) > 2000:
        raise HTTPException(status_code=400, detail="El texto excede los 2000 caracteres")
    
    try:
        audio_b64 = await speak_base64(request.text, request.voice_id)
        return TTSResponse(audio_base64=audio_b64)
    
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en síntesis de voz: {str(e)}")

@router.get("/status")
async def tts_status():
    """Verifica si Fish Audio está configurado y reporta el modelo activo."""
    from os import getenv
    key = getenv("FISH_API_KEY")
    return {
        "configured": bool(key),
        "model": "J.A.R.V.I.S. (MCU) - Paul Bettany" if key else None
    }
