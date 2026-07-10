"""Tool del agente QA: valida de forma estática el proyecto generado."""
import pathlib
import re

from app.tools.file_tools import proj_dir, list_files

TEXT_EXT = {".html", ".css", ".js", ".json", ".txt", ".md", ".svg", ".xml"}


def run_tests(pid: str) -> dict:
    """Agente QA: valida el proyecto (entrada index.html, referencias locales,
    sintaxis básica) y devuelve los problemas encontrados."""
    d = proj_dir(pid)
    files = list_files(pid)
    issues = []

    if "index.html" not in files:
        issues.append("Falta 'index.html' (punto de entrada requerido para la vista previa).")

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
