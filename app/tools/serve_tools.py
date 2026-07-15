"""Tool `serve_and_test`: levanta un servidor de desarrollo en un puerto efímero,
ejecuta una batería de pruebas HTTP definidas por el agente QA, y devuelve
resultados estructurados. Pensado para que el QA/Auditor pueda verificar que el
proyecto realmente funciona en caliente, no solo validación estática.

Flujo:
1. Abre un puerto libre (o usa el que el agente indique).
2. Arranca el servidor como subprocess en segundo plano.
3. Hace polling al puerto hasta que responda (health check).
4. Ejecuta cada test HTTP (GET/POST) contra la URL base.
5. Detiene limpiamente el servidor (kill + wait).
6. Devuelve resultados: tests pasados, fallados, URL base, logs.

La URL base (http://127.0.0.1:{port}) se envía al frontend para que el iframe
de preview pueda apuntar al servidor vivo en vez de a archivos estáticos.
"""

import os
import socket
import subprocess
import time
import pathlib

import httpx

_DEFAULT_TIMEOUT = 30
_MAX_OUTPUT_CHARS = 8000
_HEALTH_CHECK_INTERVAL = 0.5
_HEALTH_CHECK_RETRIES = 20


def _truncate(text: str) -> str:
    if len(text) <= _MAX_OUTPUT_CHARS:
        return text
    return text[:_MAX_OUTPUT_CHARS] + f"\n… (salida truncada, {len(text)} caracteres en total)"


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]


def _read_available(stream) -> str:
    """Lee todo lo disponible de un stream sin bloquear."""
    try:
        fd = stream.fileno()
        os.set_blocking(fd, False)
        chunks = []
        while True:
            try:
                chunk = stream.read(8192)
                if not chunk:
                    break
                chunks.append(chunk)
            except (BlockingIOError, OSError):
                break
        return "".join(chunks)
    except Exception:
        return ""


def serve_and_test(root: pathlib.Path, server_cmd: str, tests: list[dict],
                   port: int | None = None, timeout: int | None = None) -> dict:
    """Arranca `server_cmd` con cwd=root, ejecuta `tests` HTTP y detiene el servidor.

    `server_cmd` puede contener el placeholder `{port}` que será reemplazado por
    el puerto asignado automáticamente. Ej: "python -m http.server {port}".

    Cada test es un dict con:
        method (str): "GET" (default), "POST", "PUT", "DELETE"
        path (str): "/" (default)
        expect_status (int): 200 (default)
        expect_body_contains (str, opcional): cadena que debe aparecer en la respuesta
    """
    timeout = timeout or _DEFAULT_TIMEOUT
    port = port or _find_free_port()

    cmd = server_cmd.replace("{port}", str(port))

    proc = None
    try:
        proc = subprocess.Popen(
            cmd,
            shell=True,
            cwd=str(root),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            start_new_session=True if os.name != "nt" else False,
        )

        # --- Health check: polling al puerto ---
        ready = False
        for attempt in range(_HEALTH_CHECK_RETRIES):
            time.sleep(_HEALTH_CHECK_INTERVAL)
            exit_code = proc.poll()
            if exit_code is not None:
                server_logs = _read_available(proc.stdout) if proc.stdout else ""
                return {
                    "ok": False,
                    "error": f"El servidor terminó inesperadamente (exit code {exit_code})",
                    "server_logs": _truncate(server_logs),
                    "command": cmd,
                    "port": port,
                }
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=1):
                    ready = True
                    break
            except (socket.timeout, ConnectionRefusedError, OSError):
                continue

        if not ready:
            proc.kill()
            proc.wait()
            server_logs = _read_available(proc.stdout) if proc.stdout else ""
            return {
                "ok": False,
                "error": (
                    f"El servidor no respondió en el puerto {port} después de "
                    f"{_HEALTH_CHECK_RETRIES * _HEALTH_CHECK_INTERVAL:.0f}s"
                ),
                "server_logs": _truncate(server_logs),
                "command": cmd,
                "port": port,
            }

        # --- Ejecutar tests HTTP ---
        base_url = f"http://127.0.0.1:{port}"
        details = []
        passed = 0
        failed = 0

        with httpx.Client(timeout=10.0) as client:
            for i, test in enumerate(tests):
                method = test.get("method", "GET").upper()
                path = test.get("path", "/")
                expect_status = test.get("expect_status", 200)
                expect_body = test.get("expect_body_contains")

                try:
                    req_fn = {
                        "GET": client.get, "POST": client.post,
                        "PUT": client.put, "DELETE": client.delete,
                    }.get(method, client.get)

                    if method in ("POST", "PUT"):
                        resp = req_fn(f"{base_url}{path}")
                    else:
                        resp = req_fn(f"{base_url}{path}")

                    status_ok = resp.status_code == expect_status
                    body_ok = True
                    if expect_body:
                        body_ok = expect_body in resp.text

                    ok = status_ok and body_ok
                    if ok:
                        passed += 1
                    else:
                        failed += 1

                    entry = {
                        "test": i + 1,
                        "method": method,
                        "path": path,
                        "passed": ok,
                        "status": resp.status_code,
                        "expected_status": expect_status,
                    }
                    if not ok:
                        entry["response_preview"] = resp.text[:300]
                    details.append(entry)

                except httpx.TimeoutException:
                    failed += 1
                    details.append({
                        "test": i + 1, "method": method, "path": path,
                        "passed": False, "error": "Timeout (10s)",
                    })
                except Exception as e:
                    failed += 1
                    details.append({
                        "test": i + 1, "method": method, "path": path,
                        "passed": False, "error": str(e)[:200],
                    })

        return {
            "ok": True,
            "command": cmd,
            "port": port,
            "base_url": base_url,
            "tests_passed": passed,
            "tests_failed": failed,
            "total_tests": len(tests),
            "details": details,
        }

    except Exception as e:
        return {"ok": False, "error": str(e), "command": cmd, "port": port}

    finally:
        if proc:
            try:
                proc.kill()
                proc.wait(timeout=5)
            except Exception:
                try:
                    proc.terminate()
                    proc.wait(timeout=3)
                except Exception:
                    pass
