"""Herramientas de auditoría de seguridad para T.H.E.M.I.S.

Escaneo estático de vulnerabilidades web comunes: secrets expuestos,
patrones XSS, cabeceras de seguridad, configuraciones peligrosas y
detección de archivos de dependencias para auditoría.

Opera sobre el workspace del proyecto (Modo Construir / Modo Proyecto) o
directamente sobre la carpeta conectada (Modo Carpeta Conectada), usando
los mismos helpers de file_tools que el resto de herramientas.
"""

import pathlib
import re

from app.tools.file_tools import proj_dir, list_files

# Extensiones de texto que escaneamos (ofuscadas/binarios quedan fuera).
_TEXT_EXT = {
    ".html", ".css", ".js", ".json", ".txt", ".md", ".py", ".jsx", ".ts", ".tsx",
    ".yml", ".yaml", ".toml", ".cfg", ".ini", ".env", ".xml", ".svg", ".php",
    ".rb", ".go", ".rs", ".java", ".kt", ".swift", ".c", ".cpp", ".h", ".hpp",
    ".sh", ".bash", ".zsh", ".ps1", ".conf",
}

# ── Secrets / credenciales hardcodeadas ──────────────────────────────────
# Cada tupla: (regex, descripción legible). Se ignoran líneas que referencien
# variables de entorno (process.env, os.environ, os.getenv, ${...}, {%...%})
# porque ahí la credencial no está expuesta literalmente.
_SECRET_PATTERNS = [
    (r'(?:api[_-]?key|apikey|API[_-]?KEY)\s*[:=]\s*["\']([A-Za-z0-9_\-]{16,})["\']', "API Key expuesta"),
    (r'(?:secret|SECRET)\s*[:=]\s*["\']([A-Za-z0-9_\-!@#$%^&*]{8,})["\']', "Secret expuesto"),
    (r'(?:password|passwd|pwd)\s*[:=]\s*["\'](.+?)["\']', "Password hardcodeado"),
    (r'(?:token|TOKEN|auth_token)\s*[:=]\s*["\']([A-Za-z0-9_\-.]{15,})["\']', "Token expuesto"),
    (r'sk-[A-Za-z0-9]{32,}', "OpenAI API Key"),
    (r'sk-ant-[A-Za-z0-9]{32,}', "Anthropic API Key"),
    (r'AIza[0-9A-Za-z\-_]{35}', "Google API Key"),
    (r'ghp_[A-Za-z0-9]{36}', "GitHub Personal Access Token"),
    (r'github[_-]?pat[_-]?[A-Za-z0-9_\-]{16,}', "GitHub PAT"),
    (r'AKIA[0-9A-Z]{16}', "AWS Access Key ID"),
    (r'(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis)://[^:]+:[^@]+@', "URL de BD con credenciales"),
    (r'-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----', "Clave privada expuesta"),
    (r'eyJ[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}', "JWT hardcodeado (posible secret leak)"),
]

# ── Patrones XSS / inyección de código ───────────────────────────────────
_XSS_PATTERNS = [
    (r'\.innerHTML\s*=', "Uso de .innerHTML — posible XSS si no sanitiza"),
    (r'document\.write\s*\(', "Uso de document.write() — XSS directo"),
    (r'eval\s*\(', "Uso de eval() — inyección de código arbitrario"),
    (r'setTimeout\s*\(\s*["\']', "setTimeout con string — similar a eval()"),
    (r'setInterval\s*\(\s*["\']', "setInterval con string — similar a eval()"),
    (r'dangerouslySetInnerHTML', "dangerouslySetInnerHTML — React XSS"),
    (r'\.outerHTML\s*=', "Uso de .outerHTML — posible XSS"),
    (r'new\s+Function\s*\(', "Uso de new Function() — similar a eval()"),
    (r'\.insertAdjacentHTML\s*\(', "insertAdjacentHTML — posible XSS si no sanitiza"),
    (r'v-html\s*=', "Directiva v-html de Vue — posible XSS"),
    (r'ng-bind-html', "ng-bind-html de Angular — posible XSS sin $sce"),
    (r'bypassSecurityTrust(?:Html|Script|Style|Url|ResourceUrl)', "bypassSecurityTrust — bypass de sanitización Angular"),
]

# ── Cabeceras de seguridad ───────────────────────────────────────────────
_SECURITY_HEADERS = [
    ("Content-Security-Policy", "Falta CSP — principal defensa contra XSS"),
    ("X-Content-Type-Options", "Falta X-Content-Type-Options — MIME sniffing"),
    ("X-Frame-Options", "Falta X-Frame-Options — clickjacking"),
    ("Strict-Transport-Security", "Falta HSTS — fuerza HTTPS"),
    ("Referrer-Policy", "Falta Referrer-Policy — fuga de URL en referrer"),
    ("Permissions-Policy", "Falta Permissions-Policy — limita APIs del navegador"),
]

# ── Archivos de dependencias conocidos ───────────────────────────────────
_DEPS_FILES = {
    "package.json": ("npm", "npm audit"),
    "requirements.txt": ("pip", "pip-audit"),
    "pyproject.toml": ("pip", "pip-audit"),
    "Cargo.toml": ("cargo", "cargo audit"),
    "composer.json": ("composer", "composer audit"),
    "Gemfile": ("bundler", "bundler-audit"),
    "pom.xml": ("maven", "mvn dependency-check:check"),
    "go.mod": ("go", "govulncheck ./..."),
}

# Carpetas / segmentos de ruta que se omiten del escaneo por ser ruido
# (dependencias de terceros, entornos virtuales, etc.).
_SKIP_SEGMENTS = {"node_modules", ".git", "__pycache__", ".venv", "venv",
                  "workspaces", "dist", "build", ".next", ".nuxt", "vendor"}

# Contexto alrededor de un hallazgo (caracteres antes/después del match).
_SNIPPET_CONTEXT = 60


def audit_security(pid: str, external_path: str | None = None) -> dict:
    """Escanea el proyecto completo en busca de vulnerabilidades de seguridad.

    Cuatro dimensiones de análisis estático:
    1. **Secrets** — API keys, tokens, contraseñas hardcodeadas.
    2. **XSS** — innerHTML, eval(), document.write() y análogos.
    3. **Cabeceras** — headers de seguridad ausentes en configuraciones de servidor.
    4. **Dependencias** — archivos de manifiesto encontrados y su comando de auditoría.

    Args:
        pid: ID del proyecto.
        external_path: Ruta real si es Modo Carpeta Conectada; None si es sandbox.

    Returns:
        dict con severity, total_findings, y findings desglosados por categoría.
    """
    d = proj_dir(pid, external_path)
    files = list_files(pid, external_path)

    findings: dict = {
        "secrets": [],
        "xss": [],
        "headers": [],
        "deps": [],
    }

    text_files: list[str] = []
    server_config_files: list[str] = []

    for rel in files:
        ext = pathlib.Path(rel).suffix.lower()
        if ext not in _TEXT_EXT:
            continue
        parts = pathlib.Path(rel).parts
        if any(seg in _SKIP_SEGMENTS for seg in parts[:-1]):
            continue
        text_files.append(rel)

        # Identificar archivos que probablemente configuren seguridad del servidor.
        fname_lower = pathlib.Path(rel).name.lower()
        if any(token in fname_lower for token in
               ["nginx", "apache", ".htaccess", "caddy", "traefik",
                "main.py", "server.py", "app.py", "index.js", "server.js",
                "middleware", "security", "settings.py", "config.py",
                ".env", ".env.example", "dockerfile", "docker-compose"]):
            server_config_files.append(rel)

    for rel in text_files:
        try:
            txt = (d / rel).read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        lines_before_cache: dict[int, int] = {}

        def _line_no(pos: int) -> int:
            # Contar saltos de línea hasta pos. Cacheamos por archivo (un solo
            # archivo por iteración así que un dict simple basta).
            return txt[:pos].count("\n") + 1

        # ── Secrets ─────────────────────────────────────────────────
        for pattern, desc in _SECRET_PATTERNS:
            for match in re.finditer(pattern, txt, re.IGNORECASE):
                start = max(0, match.start() - _SNIPPET_CONTEXT)
                end = min(len(txt), match.end() + _SNIPPET_CONTEXT)
                line = txt[start:end].replace("\n", " ").replace("\r", "")
                # Descartar falsos positivos: referencias a variables de entorno.
                if any(skip in line.lower() for skip in
                       ["process.env", "os.environ", "os.getenv", "env(",
                        "${", "{%", "{{", "example", "placeholder",
                        "your-api-key", "your_api_key", "changeme",
                        "xxxxxxxx", "****", "<your-"]):
                    continue
                findings["secrets"].append({
                    "file": rel,
                    "line": _line_no(match.start()),
                    "type": desc,
                    "snippet": line.strip()[:150],
                })

        # ── XSS ─────────────────────────────────────────────────────
        for pattern, desc in _XSS_PATTERNS:
            for match in re.finditer(pattern, txt, re.IGNORECASE):
                start = max(0, match.start() - _SNIPPET_CONTEXT)
                end = min(len(txt), match.end() + _SNIPPET_CONTEXT)
                line = txt[start:end].replace("\n", " ").replace("\r", "")
                findings["xss"].append({
                    "file": rel,
                    "line": _line_no(match.start()),
                    "type": desc,
                    "snippet": line.strip()[:150],
                })

        # ── Dependencias ────────────────────────────────────────────
        fname = pathlib.Path(rel).name.lower()
        if fname in _DEPS_FILES:
            mgr, cmd = _DEPS_FILES[fname]
            findings["deps"].append({
                "file": rel,
                "manager": mgr,
                "audit_command": cmd,
                "recommendation": f"Ejecutar '{cmd}' para auditar dependencias en busca de CVEs conocidos.",
            })

    # ── Cabeceras de seguridad ──────────────────────────────────────
    for rel in server_config_files:
        try:
            txt = (d / rel).read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for header, desc in _SECURITY_HEADERS:
            if header.lower() not in txt.lower():
                findings["headers"].append({
                    "file": rel,
                    "missing_header": header,
                    "risk": desc,
                })

    # ── Resumen ─────────────────────────────────────────────────────
    total = sum(len(v) for v in findings.values())
    if len(findings["secrets"]) > 0:
        severity = "CRÍTICA"
    elif total > 8:
        severity = "ALTA"
    elif total > 3:
        severity = "MEDIA"
    else:
        severity = "BAJA"

    return {
        "ok": True,
        "severity": severity,
        "total_findings": total,
        "files_scanned": len(text_files),
        "secrets_found": len(findings["secrets"]),
        "xss_found": len(findings["xss"]),
        "header_issues": len(findings["headers"]),
        "deps_to_audit": len(findings["deps"]),
        "findings": findings,
    }
