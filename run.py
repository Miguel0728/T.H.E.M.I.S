import os
import uvicorn

if __name__ == "__main__":
    # El puerto y el host se leen del entorno para que la Vista Previa (y cualquier
    # orquestador externo, incluido Render) puedan inyectar el puerto efímero que
    # asignan. HOST debe ser 0.0.0.0 para que el proxy de Render (o cualquier
    # contenedor) pueda alcanzar el proceso — con 127.0.0.1 el servicio queda
    # inaccesible desde fuera del propio proceso. Para probar en el navegador
    # local, visita http://localhost:<PORT> (no la IP 0.0.0.0 literal).
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8001"))

    # Render inyecta la variable RENDER automáticamente — la usamos para forzar
    # reload=False en producción aunque alguien olvide fijar RELOAD=0. En local
    # sigue controlable con RELOAD (por defecto activo).
    is_render = os.getenv("RENDER") is not None
    reload = False if is_render else os.getenv("RELOAD", "1") == "1"

    uvicorn.run("app:app", host=host, port=port, reload=reload)
