"""Almacenamiento en disco de las imágenes generadas en el modo Chat."""
import pathlib

# Anclado a la raíz del proyecto (igual que workspaces/ en file_tools.py) para
# que la ruta no dependa del directorio desde el que se lance el servidor.
BASE = pathlib.Path(__file__).parent.parent.parent / "chat_uploads"


def chat_dir(cid: str) -> pathlib.Path:
    d = BASE / cid
    d.mkdir(parents=True, exist_ok=True)
    return d


def save_image(cid: str, filename: str, data: bytes) -> pathlib.Path:
    path = chat_dir(cid) / filename
    path.write_bytes(data)
    return path


def image_path(cid: str, filename: str) -> pathlib.Path:
    """Resuelve la ruta validando que no escape del directorio del chat."""
    d = chat_dir(cid).resolve()
    full = (d / filename).resolve()
    if d not in full.parents and full != d:
        raise ValueError("ruta no permitida")
    return full
