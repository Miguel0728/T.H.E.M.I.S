import os
import uvicorn

if __name__ == "__main__":
    # El puerto y el host se leen del entorno para que la Vista Previa (y cualquier
    # orquestador externo) puedan inyectar el puerto efímero que asignan.
    # Si no se define nada, caemos a los valores por defecto de desarrollo local.
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8001"))

    # reload solo en desarrollo local; se desactiva si RELOAD=0.
    reload = os.getenv("RELOAD", "1") == "1"

    uvicorn.run("app:app", host=host, port=port, reload=reload)
