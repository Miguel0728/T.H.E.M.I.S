import sqlite3
import asyncio
import shutil
from pathlib import Path
from contextlib import contextmanager

# La base de datos vive en data/ (raíz del proyecto), separada del código para
# que backups y despliegues no mezclen datos con fuente.
DATA_DIR = Path(__file__).parent.parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "cosmo.db"

# Migración de una sola vez: si existe la ubicación antigua (app/database/cosmo.db)
# y aún no movimos el archivo, lo trasladamos para no perder proyectos/chats previos.
_OLD_DB_PATH = Path(__file__).parent / "cosmo.db"
if _OLD_DB_PATH.exists() and not DB_PATH.exists():
    shutil.move(str(_OLD_DB_PATH), str(DB_PATH))


def init_db():
    """Inicializa la base de datos creando las tablas necesarias si no existen."""
    conn = sqlite3.connect(DB_PATH)
    # WAL permite lecturas concurrentes mientras hay una escritura en curso
    # (varias pestañas/usuarios a la vez sin bloquearse entre sí).
    conn.execute("PRAGMA journal_mode=WAL")
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            model TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            has_image INTEGER DEFAULT 0,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
    """)
    # Modo Chat: conversaciones normales (sin herramientas de archivos), separadas
    # de los "projects" del modo Construir, con su propia memoria conversacional.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            model TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
        )
    """)
    conn.commit()
    conn.close()


@contextmanager
def get_db_conn():
    """Administrador de contexto para gestionar de forma segura conexiones individuales a SQLite."""
    conn = sqlite3.connect(DB_PATH)
    # Habilitamos soporte de claves foráneas para cascadas automáticas
    conn.execute("PRAGMA foreign_keys = ON")
    # Configuramos para obtener las filas como diccionarios en lugar de tuplas
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def _to_dict(row: sqlite3.Row) -> dict:
    """Convierte un Row de SQLite en un diccionario de Python adaptando tipos (ej. has_image a bool)."""
    row_dict = dict(row)
    if "has_image" in row_dict:
        row_dict["has_image"] = bool(row_dict["has_image"])
    return row_dict


async def db_execute(query: str, params: tuple = ()) -> int:
    """Ejecuta una consulta de escritura (INSERT, UPDATE, DELETE) de forma asíncrona."""
    def run():
        with get_db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            conn.commit()
            return cursor.rowcount
    return await asyncio.to_thread(run)


async def db_fetch_all(query: str, params: tuple = ()) -> list[dict]:
    """Ejecuta una consulta SELECT y retorna todas las filas como una lista de diccionarios de forma asíncrona."""
    def run():
        with get_db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            return [_to_dict(row) for row in cursor.fetchall()]
    return await asyncio.to_thread(run)


async def db_fetch_one(query: str, params: tuple = ()) -> dict | None:
    """Ejecuta una consulta SELECT y retorna la primera fila o None si no hay resultados."""
    def run():
        with get_db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            row = cursor.fetchone()
            return _to_dict(row) if row else None
    return await asyncio.to_thread(run)


# Inicializamos la base de datos al importar el módulo
init_db()
