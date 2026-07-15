"""Tool del agente QA: valida de forma estática el proyecto generado."""
import pathlib
import re

from app.tools.file_tools import proj_dir, list_files

TEXT_EXT = {".html", ".css", ".js", ".json", ".txt", ".md", ".svg", ".xml"}


def run_tests(pid: str, project_type: str = "app", external_path: str | None = None) -> dict:
    """Agente QA: valida el proyecto (punto de entrada, referencias locales,
    sintaxis básica) y devuelve los problemas encontrados.

    El punto de entrada esperado depende del workflow: 'index.html' en la
    raíz para Modo Construir, 'frontend/index.html' para Modo Proyecto
    (ver app/config/prompts.py — PROJECT_SYSTEM_PROMPT define esa estructura).

    En Modo Carpeta Conectada (external_path) no se exige ningún punto de
    entrada fijo — un proyecto real conectado puede ser cualquier stack (solo
    backend, una librería, etc.) y no necesariamente sirve un index.html. Ahí
    el chequeo real corre por cuenta de `run_command` (linters, tests propios
    del proyecto), esta función solo hace una pasada básica de sintaxis.
    """
    d = proj_dir(pid, external_path)
    files = list_files(pid, external_path)
    issues = []

    if not external_path:
        entry = "frontend/index.html" if project_type == "proyecto" else "index.html"
        if entry not in files:
            issues.append(f"Falta '{entry}' (punto de entrada requerido para la vista previa).")

    for rel in files:
        ext = pathlib.Path(rel).suffix.lower()
        if ext not in TEXT_EXT:
            continue
        try:
            txt = (d / rel).read_text(encoding="utf-8")
        except Exception:
            continue

        if ext == ".html":
            if "<html" not in txt.lower():
                issues.append(f"{rel}: no contiene una etiqueta <html>.")
            for m in re.findall(r'(?:src|href)=["\']([^"\']+)["\']', txt):
                if m.startswith(("http", "//", "#", "data:", "mailto:", "javascript:")):
                    continue
                target = m.split("?")[0].split("#")[0].lstrip("./")
                if target and target not in files:
                    issues.append(f"{rel}: referencia a recurso local inexistente '{m}'.")

        if ext in (".js", ".css"):
            opens = txt.count("{") + txt.count("(") + txt.count("[")
            closes = txt.count("}") + txt.count(")") + txt.count("]")
            if opens != closes:
                issues.append(f"{rel}: posibles llaves/paréntesis desbalanceados ({opens} abren, {closes} cierran).")

    return {"ok": len(issues) == 0, "issues": issues, "files_checked": len(files)}
