"""Operaciones de archivos sobre el workspace de un proyecto, expuestas a Claude como tools.

Cada proyecto generado vive en workspaces/{project_id}/ y se sirve de solo lectura
a través de los endpoints de Live Preview. Todas las rutas se validan para evitar
salir del sandbox del proyecto (path traversal).
"""
import pathlib

BASE = pathlib.Path(__file__).parent.parent.parent / "workspaces"


def proj_dir(pid: str) -> pathlib.Path:
    d = BASE / pid
    d.mkdir(parents=True, exist_ok=True)
    return d


def _safe(pid: str, path: str) -> pathlib.Path:
    d = proj_dir(pid).resolve()
    full = (d / path.lstrip("/")).resolve()
    if not str(full).startswith(str(d)):
        raise ValueError("Ruta fuera del workspace no permitida")
    return full


def write_file(pid: str, path: str, content: str) -> dict:
    f = _safe(pid, path)
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(content, encoding="utf-8")
    return {"ok": True, "path": path, "bytes": len(content.encode("utf-8"))}


def edit_file(pid: str, path: str, old_str: str, new_str: str) -> dict:
    f = _safe(pid, path)
    if not f.exists():
        return {"ok": False, "error": f"El archivo '{path}' no existe"}
    txt = f.read_text(encoding="utf-8")
    if old_str not in txt:
        return {"ok": False, "error": "No se encontró 'old_str' en el archivo"}
    count = txt.count(old_str)
    f.write_text(txt.replace(old_str, new_str), encoding="utf-8")
    return {"ok": True, "path": path, "replacements": count}


def read_file(pid: str, path: str) -> dict:
    f = _safe(pid, path)
    if not f.exists():
        return {"ok": False, "error": f"El archivo '{path}' no existe"}
    return {"ok": True, "path": path, "content": f.read_text(encoding="utf-8")}


def create_directory(pid: str, path: str) -> dict:
    d = _safe(pid, path)
    d.mkdir(parents=True, exist_ok=True)
    return {"ok": True, "path": path}


def delete_file(pid: str, path: str) -> dict:
    f = _safe(pid, path)
    if f.exists() and f.is_file():
        f.unlink()
        return {"ok": True, "path": path}
    return {"ok": False, "error": f"El archivo '{path}' no existe"}


def save_upload(pid: str, filename: str, data: bytes) -> dict:
    """Guarda un archivo binario (video, imagen) subido por el usuario en el workspace."""
    safe_name = pathlib.Path(filename).name
    f = _safe(pid, safe_name)
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_bytes(data)
    return {"ok": True, "path": safe_name, "bytes": len(data)}


def list_files(pid: str) -> list:
    d = proj_dir(pid)
    out = []
    for p in sorted(d.rglob("*")):
        if p.is_file():
            out.append(str(p.relative_to(d)))
    return out
