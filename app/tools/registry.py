"""Registro central de tools de Kinetix.

Este archivo tiene dos responsabilidades a propósito, ambas pequeñas:
1. Definir el SCHEMA de cada tool (lo que Claude recibe para saber qué puede llamar).
2. Enrutar (dispatch) cada tool_use a su implementación real en file_tools/qa_tools/web_tools.

La implementación real de cada tool vive en su propio módulo (file_tools.py, qa_tools.py,
web_tools.py) — aquí solo se ensamblan y se enrutan.
"""
from app.tools import file_tools as ft
from app.tools import qa_tools as qt
from app.tools import web_tools as webt


def _fn(name, description, properties, required):
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {"type": "object", "properties": properties, "required": required},
        },
    }


def build_tools():
    return [
        _fn("set_phase", "Anuncia qué agente especializado está trabajando ahora. Llámalo antes de cada fase.",
            {"agent": {"type": "string", "enum": ["producto", "coder", "integraciones", "qa"],
                       "description": "Agente activo"},
             "message": {"type": "string", "description": "Frase corta de lo que va a hacer"}},
            ["agent", "message"]),
        _fn("write_file", "Crea o sobreescribe un archivo en el workspace del proyecto.",
            {"path": {"type": "string", "description": "Ruta relativa, ej. 'index.html' o 'css/style.css'"},
             "content": {"type": "string", "description": "Contenido completo del archivo"}},
            ["path", "content"]),
        _fn("edit_file", "Edita quirúrgicamente un archivo reemplazando una cadena exacta por otra.",
            {"path": {"type": "string"},
             "old_str": {"type": "string", "description": "Texto exacto a reemplazar (debe existir)"},
             "new_str": {"type": "string", "description": "Texto nuevo"}},
            ["path", "old_str", "new_str"]),
        _fn("read_file", "Lee el contenido de un archivo del workspace.",
            {"path": {"type": "string"}}, ["path"]),
        _fn("list_files", "Lista todos los archivos del workspace del proyecto.", {}, []),
        _fn("create_directory", "Crea un directorio en el workspace.",
            {"path": {"type": "string"}}, ["path"]),
        _fn("delete_file", "Elimina un archivo del workspace.",
            {"path": {"type": "string"}}, ["path"]),
        _fn("run_tests", "Agente QA: valida el proyecto (entrada index.html, referencias locales, "
                          "sintaxis básica) y devuelve los problemas encontrados.",
            {}, []),
        _fn("fetch_url", "Descarga el HTML de una URL para usarlo como referencia de diseño o contenido. "
                          "Útil para clonar o inspirarse en páginas existentes.",
            {"url": {"type": "string", "description": "URL completa a descargar (https://...)"}},
            ["url"]),
    ]


TOOLS = build_tools()

# Tools que modifican el filesystem del proyecto -> disparan refresh del preview
MUTATING = {"write_file", "edit_file", "delete_file", "create_directory"}


def execute_tool(pid: str, name: str, args: dict) -> dict:
    """Dispatcher único: recibe el nombre de la tool que Claude pidió y la ejecuta."""
    try:
        if name == "set_phase":
            return {"ok": True}
        if name == "write_file":
            return ft.write_file(pid, args["path"], args.get("content", ""))
        if name == "edit_file":
            return ft.edit_file(pid, args["path"], args["old_str"], args["new_str"])
        if name == "read_file":
            return ft.read_file(pid, args["path"])
        if name == "list_files":
            return {"ok": True, "files": ft.list_files(pid)}
        if name == "create_directory":
            return ft.create_directory(pid, args["path"])
        if name == "delete_file":
            return ft.delete_file(pid, args["path"])
        if name == "run_tests":
            return qt.run_tests(pid)
        if name == "fetch_url":
            return webt.fetch_url(args["url"])
        return {"ok": False, "error": f"Herramienta desconocida: {name}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
