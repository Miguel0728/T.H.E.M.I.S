"""Operaciones de archivos sobre el workspace de un proyecto, expuestas a Claude como tools.

Cada proyecto generado vive en workspaces/{project_id}/ y se sirve de solo lectura
a través de los endpoints de Live Preview. Todas las rutas se validan para evitar
salir del sandbox del proyecto (path traversal).

Modo Carpeta Conectada: un proyecto puede en cambio apuntar a una ruta REAL del
disco del usuario (external_path, guardada en la tabla projects). En ese caso el
"sandbox" es esa carpeta misma — todas las funciones siguen validando que no se
escape de esa raíz (path traversal), pero la raíz ya no es workspaces/{pid} sino
la ruta que el usuario conectó. remove_project_files() nunca borra una carpeta
externa: eso solo desconecta el proyecto de la base de datos, jamás toca el disco.
"""
import io
import pathlib
import shutil
import time
import zipfile

BASE = pathlib.Path(__file__).parent.parent.parent / "workspaces"

# Extensiones que nunca se extraen de un .zip subido por el usuario (Modo
# Proyecto → "auditar proyecto existente"): evita traer binarios pesados o
# ejecutables al workspace que el modelo va a leer como texto.
_ZIP_SKIP_DIRS = {"__MACOSX", "node_modules", ".git", "__pycache__", ".venv", "venv"}
_ZIP_MAX_FILES = 400
_ZIP_MAX_FILE_BYTES = 2 * 1024 * 1024  # 2MB por archivo

# Mismas carpetas ruidosas, mas ahora también aplicadas a list_files() cuando el
# root es una carpeta real conectada (un repo de verdad trae node_modules,
# .git, entornos virtuales, etc. que no aportan y pueden ser miles de archivos).
_LIST_SKIP_DIRS = _ZIP_SKIP_DIRS

# ── Caché con TTL para herramientas de solo lectura ──────────────────────────
# list_files y read_file se llaman repetidamente en cada iteración del loop
# agéntico. Un caché en memoria con TTL de 5s evita re-lecturas innecesarias
# del disco sin sacrificar frescura (5s es insignificante para el usuario pero
# enorme para el ritmo al que Claude encadena tool calls).
_cache: dict[str, tuple[float, object]] = {}
_CACHE_TTL = 5  # segundos


def _cache_key(*parts: str) -> str:
    return "\x00".join(parts)


def _cached(key: str, factory, ttl: int = _CACHE_TTL):
    now = time.time()
    if key in _cache:
        ts, val = _cache[key]
        if now - ts < ttl:
            return val
    val = factory()
    _cache[key] = (now, val)
    return val


def _invalidate_cache() -> None:
    _cache.clear()


def _workspace_path(pid: str, external_path: str | None = None) -> pathlib.Path:
    """Resuelve la raíz del proyecto: la carpeta externa conectada si existe,
    o el sandbox workspaces/{pid} de siempre."""
    if external_path:
        root = pathlib.Path(external_path).expanduser().resolve()
        if not root.exists() or not root.is_dir():
            raise ValueError(f"La carpeta conectada no existe o no es un directorio: {external_path}")
        return root
    root = BASE.resolve()
    path = (BASE / pid).resolve()
    if path == root or not path.is_relative_to(root):
        raise ValueError("Ruta de workspace no permitida")
    return path


def proj_dir(pid: str, external_path: str | None = None) -> pathlib.Path:
    d = _workspace_path(pid, external_path)
    if not external_path:
        d.mkdir(parents=True, exist_ok=True)
    return d


def _safe(pid: str, path: str, external_path: str | None = None) -> pathlib.Path:
    d = _workspace_path(pid, external_path)
    full = (d / path.lstrip("/")).resolve()
    if not full.is_relative_to(d):
        raise ValueError("Ruta fuera del proyecto no permitida")
    return full


def remove_project_files(pid: str, external_path: str | None = None) -> None:
    """Elimina el workspace de un proyecto ya borrado. Si el proyecto está
    enlazado a una carpeta externa, NUNCA se borra del disco — solo se
    desvincula el registro en la base de datos."""
    if external_path:
        return
    shutil.rmtree(_workspace_path(pid), ignore_errors=True)


def write_file(pid: str, path: str, content: str, external_path: str | None = None) -> dict:
    f = _safe(pid, path, external_path)
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(content, encoding="utf-8")
    _invalidate_cache()
    return {"ok": True, "path": path, "bytes": len(content.encode("utf-8"))}


def edit_file(pid: str, path: str, old_str: str, new_str: str, external_path: str | None = None) -> dict:
    f = _safe(pid, path, external_path)
    if not f.exists():
        return {"ok": False, "error": f"El archivo '{path}' no existe"}
    txt = f.read_text(encoding="utf-8")
    if old_str not in txt:
        return {"ok": False, "error": "No se encontró 'old_str' en el archivo"}
    count = txt.count(old_str)
    f.write_text(txt.replace(old_str, new_str), encoding="utf-8")
    _invalidate_cache()
    return {"ok": True, "path": path, "replacements": count}


def read_file(pid: str, path: str, external_path: str | None = None) -> dict:
    f = _safe(pid, path, external_path)
    if not f.exists():
        return {"ok": False, "error": f"El archivo '{path}' no existe"}
    key = _cache_key("read_file", pid, external_path or "", path)
    return _cached(key, lambda: {"ok": True, "path": path, "content": f.read_text(encoding="utf-8")})


def create_directory(pid: str, path: str, external_path: str | None = None) -> dict:
    d = _safe(pid, path, external_path)
    d.mkdir(parents=True, exist_ok=True)
    _invalidate_cache()
    return {"ok": True, "path": path}


def delete_file(pid: str, path: str, external_path: str | None = None) -> dict:
    f = _safe(pid, path, external_path)
    if f.exists() and f.is_file():
        f.unlink()
        _invalidate_cache()
        return {"ok": True, "path": path}
    return {"ok": False, "error": f"El archivo '{path}' no existe"}


def save_upload(pid: str, filename: str, data: bytes, external_path: str | None = None) -> dict:
    """Guarda un archivo binario (video, imagen) subido por el usuario en el workspace."""
    safe_name = pathlib.Path(filename).name
    f = _safe(pid, safe_name, external_path)
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_bytes(data)
    return {"ok": True, "path": safe_name, "bytes": len(data)}


def import_zip(pid: str, data: bytes) -> dict:
    """Extrae un .zip de un proyecto existente en el workspace (Modo Proyecto →
    'adjuntar proyecto para auditar'). Cada entrada se resuelve con _safe() para
    evitar zip-slip (rutas '../' que escapen del sandbox), se descartan carpetas
    ruidosas (node_modules, .git, __MACOSX, entornos virtuales) y archivos
    binarios grandes que no aportan al análisis del modelo.

    Nota: import_zip solo aplica al workspace gestionado (workspaces/{pid}), no
    a proyectos de Carpeta Conectada — para esos, los archivos ya están en disco."""
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        return {"ok": False, "error": "El archivo no es un .zip válido"}

    imported = []
    skipped = []
    for info in zf.infolist():
        if info.is_dir():
            continue
        parts = pathlib.PurePosixPath(info.filename).parts
        if any(p in _ZIP_SKIP_DIRS or p.startswith(".") for p in parts[:-1]):
            skipped.append(info.filename)
            continue
        if info.file_size > _ZIP_MAX_FILE_BYTES:
            skipped.append(info.filename)
            continue
        if len(imported) >= _ZIP_MAX_FILES:
            skipped.append(info.filename)
            continue
        try:
            f = _safe(pid, info.filename)
        except ValueError:
            skipped.append(info.filename)
            continue
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(zf.read(info))
        imported.append(str(f.relative_to(_workspace_path(pid))))

    return {"ok": True, "imported": imported, "skipped": skipped, "count": len(imported)}


def list_files(pid: str, external_path: str | None = None) -> list:
    d = _workspace_path(pid, external_path)
    if not d.exists():
        return []
    key = _cache_key("list_files", pid, external_path or "")
    return _cached(key, lambda: _do_list_files(d))


def _do_list_files(d: pathlib.Path) -> list:
    out = []
    for p in sorted(d.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(d)
        if any(part in _LIST_SKIP_DIRS or part.startswith(".") for part in rel.parts[:-1]):
            continue
        out.append(str(rel))
    return out
