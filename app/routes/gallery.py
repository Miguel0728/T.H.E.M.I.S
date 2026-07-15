from fastapi import APIRouter, HTTPException
from app.database.connection import db_execute, db_fetch_all, db_fetch_one

gallery_router = APIRouter(prefix="/api")

@gallery_router.get("/gallery")
async def get_gallery():
    """Obtiene todas las imágenes de la galería ordenadas por fecha de creación descendente."""
    images = await db_fetch_all("SELECT * FROM gallery ORDER BY created_at DESC")
    return {"images": images}

@gallery_router.delete("/gallery/{id}")
async def delete_gallery_item(id: str):
    """Elimina un elemento de la galería por su ID."""
    item = await db_fetch_one("SELECT id FROM gallery WHERE id = ?", (id,))
    if not item:
        raise HTTPException(404, "Imagen no encontrada en la galería")
    await db_execute("DELETE FROM gallery WHERE id = ?", (id,))
    return {"ok": True}
