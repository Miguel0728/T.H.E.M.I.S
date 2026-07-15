"""Registro central de tools de T.H.E.M.I.S.

Este archivo tiene dos responsabilidades a propósito, ambas pequeñas:
1. Definir el SCHEMA de cada tool (lo que Claude recibe para saber qué puede llamar).
2. Enrutar (dispatch) cada tool_use a su implementación real en file_tools/qa_tools/web_tools/shell_tools.

La implementación real de cada tool vive en su propio módulo (file_tools.py, qa_tools.py,
web_tools.py, shell_tools.py) — aquí solo se ensamblan y se enrutan.

external_path: cuando el proyecto es de Modo Carpeta Conectada, todas las tools de
archivos (y run_command) operan sobre esa ruta real en vez de workspaces/{pid}.
Ver app/tools/file_tools.py para la resolución de la raíz.
"""
from app.tools import file_tools as ft
from app.tools import qa_tools as qt
from app.tools import web_tools as webt
from app.tools import shell_tools as sht
from app.tools import security_tools as sect
from app.tools import news_tools as newst
from app.tools import weather_tools as wt
from app.tools import serve_tools as svt


def _fn(name, description, properties, required):
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {"type": "object", "properties": properties, "required": required},
        },
    }


def build_tools(linked: bool = False):
    tools = [
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
        _fn("run_tests", "Agente QA: valida el proyecto (punto de entrada, referencias locales, "
                          "sintaxis básica) y devuelve los problemas encontrados.",
            {}, []),
        _fn("fetch_url", "Descarga el HTML de una URL para usarlo como referencia de diseño o contenido. "
                          "Útil para clonar o inspirarse en páginas existentes.",
            {"url": {"type": "string", "description": "URL completa a descargar (https://...)"}},
            ["url"]),
        _fn("audit_security",
            "Escaneo estático de seguridad del proyecto: busca secrets/API keys expuestas, "
            "patrones XSS (innerHTML, eval, document.write), cabeceras de seguridad ausentes "
            "en configuraciones de servidor, y archivos de dependencias que necesitan auditoría. "
            "Devuelve severidad, total de hallazgos y el desglose por categoría.",
            {}, []),
        _fn("serve_and_test",
            "Levanta un servidor de desarrollo en un puerto efímero, ejecuta una batería de "
            "pruebas HTTP contra él (GET, POST, validación de status codes y contenido en "
            "respuesta), y luego lo detiene limpiamente. Úsala para verificar que el proyecto "
            "realmente funciona en caliente — el servidor levanta, los endpoints responden, "
            "y la página renderiza. El frontend usará la URL base devuelta para mostrar el "
            "servidor corriendo en el iframe de Vista Previa.",
            {"server_cmd": {"type": "string",
                             "description": "Comando para arrancar el servidor. Usa {port} como placeholder "
                                            "del puerto, ej: 'python -m http.server {port}' o "
                                            "'uvicorn app.main:app --port {port}'"},
             "tests": {"type": "array",
                        "description": "Lista de tests HTTP a ejecutar. Cada test: "
                                       "{method:'GET'|'POST', path:'/ruta', expect_status:200, "
                                       "expect_body_contains:'<html>'}"},
             "port": {"type": "integer",
                       "description": "Puerto fijo (opcional). Si se omite, se asigna uno libre automáticamente."},
             "timeout": {"type": "integer",
                          "description": "Segundos máximo para arranque + tests (default 30)"}},
            ["server_cmd", "tests"]),
    ]
    if linked:
        # Solo se ofrece en Modo Carpeta Conectada: correr comandos arbitrarios
        # (pip install, npm run, git, pytest, etc.) sobre un proyecto real del
        # disco del señor no tiene sentido — ni es seguro — dentro del sandbox
        # workspaces/{pid} de un proyecto generado desde cero.
        tools.append(
            _fn("run_command",
                "Ejecuta un comando de shell dentro de la carpeta raíz del proyecto conectado "
                "(instalar dependencias, correr el servidor, tests, git, linters, build, etc.). "
                "Se ejecuta con los mismos permisos del proceso de THEMIS, sin sandbox adicional "
                "— úsalo con el mismo criterio que si el señor lo tipeara en su propia terminal.",
                {"command": {"type": "string", "description": "Comando completo a ejecutar, ej. 'npm install' o 'pytest -q'"},
                 "timeout": {"type": "integer", "description": "Segundos máximo de espera (default 60)"}},
                ["command"])
        )
    return tools


TOOLS = build_tools(linked=False)
LINKED_TOOLS = build_tools(linked=True)


def build_chat_tools():
    """Tools disponibles en Modo Chat (conversaciones normales, sin archivos)."""
    return [
        _fn("get_news",
            "Obtiene titulares recientes para resumirlos o comentarlos con el usuario. "
            "Úsala cuando el usuario pida un resumen de noticias, últimas noticias o "
            "novedades de gobierno/actualidad.",
            {"region": {"type": "string", "enum": ["all", "pr", "us"],
                         "description": "'pr' para noticias de gobierno de Puerto Rico, "
                                         "'us' para titulares de Estados Unidos, 'all' para ambas."},
             "limit": {"type": "integer",
                        "description": f"Máximo de artículos a devolver (por defecto {newst.MAX_ARTICLES_FOR_CHAT})."}},
            ["region"]),
        _fn("search_news",
            "Busca artículos y noticias reales en la web sobre un tema puntual — información "
            "en tiempo real más allá de los titulares fijos de get_news. Úsala cuando el usuario "
            "pida profundizar, abundar, ampliar o 'saber más' sobre una noticia o tema ya "
            "mencionado en la conversación (arma la query con el nombre propio, evento o palabras "
            "clave concretas del tema, no una frase genérica), o cuando pregunte por algo actual "
            "que get_news no cubrió.",
            {"query": {"type": "string",
                        "description": "Términos de búsqueda concretos (nombres, lugares, evento) sobre "
                                        "el tema a profundizar."},
             "limit": {"type": "integer",
                        "description": f"Máximo de artículos a devolver (por defecto {newst.MAX_ARTICLES_FOR_CHAT})."}},
            ["query"]),
        _fn("web_search",
            "Busca en la web abierta (no solo noticias). Úsala siempre que necesites información "
            "que no tienes o de la que no estás seguro: datos actuales, precios, resultados "
            "deportivos, eventos recientes, personas, empresas, productos, disponibilidad de algo, "
            "verificar un dato, etc. En general, si el usuario pregunta algo cuya respuesta puede "
            "haber cambiado después de tu entrenamiento o que requiere una fuente externa para "
            "estar seguro, busca antes de responder en vez de adivinar.",
            {"query": {"type": "string", "description": "Términos de búsqueda concretos."},
             "limit": {"type": "integer",
                        "description": f"Máximo de resultados a devolver (por defecto {webt.MAX_WEB_SEARCH_RESULTS})."}},
            ["query"]),
        _fn("fetch_page",
            "Lee el texto real de una página web (normalmente una URL devuelta por `web_search`). "
            "Úsala cuando el snippet de la búsqueda no trae el dato concreto que necesitas — datos "
            "que cambian constantemente como clima, precios, resultados en vivo, horarios, "
            "disponibilidad, etc. — para confirmar la información leyendo la página en sí en vez "
            "de adivinar a partir del título/descripción.",
            {"url": {"type": "string", "description": "URL completa a leer (https://...), normalmente de un resultado de web_search."}},
            ["url"]),
        _fn("get_weather",
            "Da el clima actual y el pronóstico del día (temperatura, sensación térmica, humedad, "
            "viento, probabilidad de lluvia) de un lugar específico. Úsala siempre que el usuario "
            "pregunte por el clima/tiempo de una ciudad o zona — es más precisa que buscar en la web.",
            {"location": {"type": "string", "description": "Ciudad, pueblo o zona, ej. 'San Juan, Puerto Rico'."}},
            ["location"]),
    ]


CHAT_TOOLS = build_chat_tools()


async def execute_chat_tool(name: str, args: dict) -> dict:
    """Dispatcher para tools del Modo Chat (noticias, búsqueda web, clima)."""
    if name == "get_news":
        return await newst.get_news(args.get("region", "all"), args.get("limit"))
    if name == "search_news":
        return await newst.search_news(args.get("query", ""), args.get("limit"))
    if name == "web_search":
        return await webt.web_search(args.get("query", ""), args.get("limit"))
    if name == "fetch_page":
        return await webt.fetch_page(args.get("url", ""))
    if name == "get_weather":
        return await wt.get_weather(args.get("location", ""))
    return {"ok": False, "error": f"Herramienta desconocida: {name}"}


# Tools que modifican el filesystem del proyecto -> disparan refresh del preview
MUTATING = {"write_file", "edit_file", "delete_file", "create_directory"}

# Tools de solo lectura que pueden ejecutarse en paralelo sin riesgo de
# race conditions. Las herramientas de mutación SIEMPRE van en serie para
# garantizar orden determinista (escribir A, luego B que depende de A).
READ_ONLY = {"read_file", "list_files", "run_tests", "fetch_url", "audit_security"}


def execute_tool(pid: str, name: str, args: dict, project_type: str = "app",
                  external_path: str | None = None) -> dict:
    """Dispatcher único: recibe el nombre de la tool que Claude pidió y la ejecuta."""
    try:
        if name == "set_phase":
            return {"ok": True}
        if name == "write_file":
            return ft.write_file(pid, args["path"], args.get("content", ""), external_path)
        if name == "edit_file":
            return ft.edit_file(pid, args["path"], args["old_str"], args["new_str"], external_path)
        if name == "read_file":
            return ft.read_file(pid, args["path"], external_path)
        if name == "list_files":
            return {"ok": True, "files": ft.list_files(pid, external_path)}
        if name == "create_directory":
            return ft.create_directory(pid, args["path"], external_path)
        if name == "delete_file":
            return ft.delete_file(pid, args["path"], external_path)
        if name == "run_tests":
            return qt.run_tests(pid, project_type, external_path)
        if name == "fetch_url":
            return webt.fetch_url(args["url"])
        if name == "run_command":
            if not external_path:
                return {"ok": False, "error": "run_command solo está disponible en Modo Carpeta Conectada"}
            root = ft.proj_dir(pid, external_path)
            return sht.run_command(root, args["command"], args.get("timeout"))
        if name == "audit_security":
            return sect.audit_security(pid, external_path)
        if name == "serve_and_test":
            root = ft.proj_dir(pid, external_path)
            return svt.serve_and_test(root, args["server_cmd"],
                                      args.get("tests", []), args.get("port"),
                                      args.get("timeout"))
        return {"ok": False, "error": f"Herramienta desconocida: {name}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
