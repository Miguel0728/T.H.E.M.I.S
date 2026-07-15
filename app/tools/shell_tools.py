"""Tool `run_command`: ejecuta comandos de shell dentro de la raíz del proyecto.

Pensado para Modo Carpeta Conectada (instalar dependencias, correr scripts,
git, tests, builds) — el equivalente al tool de terminal que usan Cowork /
Claude Code. Corre con el mismo usuario y permisos del proceso de THEMIS, sin
sandbox adicional: el proyecto ya corre localmente en la máquina del señor, así
que el riesgo es el mismo que si él mismo tipeara el comando en su terminal.
Por eso el timeout y el truncado de salida son la única red de seguridad —
evitan que un comando colgado o con salida gigante rompa la sesión de chat.
"""
import subprocess
import pathlib

_MAX_OUTPUT_CHARS = 8000
_DEFAULT_TIMEOUT = 60


def _truncate(text: str) -> str:
    if len(text) <= _MAX_OUTPUT_CHARS:
        return text
    return text[:_MAX_OUTPUT_CHARS] + f"\n… (salida truncada, {len(text)} caracteres en total)"


def run_command(root: pathlib.Path, command: str, timeout: int | None = None) -> dict:
    """Ejecuta `command` con cwd=root. Devuelve stdout/stderr/exit_code."""
    if not command or not command.strip():
        return {"ok": False, "error": "Comando vacío"}

    timeout = timeout or _DEFAULT_TIMEOUT
    try:
        proc = subprocess.run(
            command,
            shell=True,
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"El comando excedió el timeout de {timeout}s", "command": command}
    except Exception as e:
        return {"ok": False, "error": str(e), "command": command}

    return {
        "ok": proc.returncode == 0,
        "command": command,
        "exit_code": proc.returncode,
        "stdout": _truncate(proc.stdout or ""),
        "stderr": _truncate(proc.stderr or ""),
    }
