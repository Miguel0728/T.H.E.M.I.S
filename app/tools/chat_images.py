"""Almacenamiento en disco de las imágenes generadas en el modo Chat."""
import pathlib
import shutil

# Anclado a la raíz del proyecto (igual que workspaces/ en file_tools.py) para
# que la ruta no dependa del directorio desde el que se lance el servidor.
BASE = pathlib.Path(__file__).parent.parent.parent / "chat_uploads"


def _safe_chat_dir(cid: str) -> pathlib.Path:
    root = BASE.resolve()
    path = (BASE / cid).resolve()
    if path == root or not path.is_relative_to(root):
        raise ValueError("ruta no permitida")
    return path


def chat_dir(cid: str) -> pathlib.Path:
    d = _safe_chat_dir(cid)
    d.mkdir(parents=True, exist_ok=True)
    return d


def save_image(cid: str, filename: str, data: bytes) -> pathlib.Path:
    path = chat_dir(cid) / filename
    path.write_bytes(data)
    return path


def image_path(cid: str, filename: str) -> pathlib.Path:
    """Resuelve la ruta validando que no escape del directorio del chat."""
    d = _safe_chat_dir(cid)
    full = (d / filename).resolve()
    if d not in full.parents and full != d:
        raise ValueError("ruta no permitida")
    return full


def remove_chat_files(cid: str) -> None:
    """Elimina las imágenes de una conversación ya borrada."""
    shutil.rmtree(_safe_chat_dir(cid), ignore_errors=True)
