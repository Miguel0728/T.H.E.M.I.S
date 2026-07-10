import uvicorn

if __name__ == "__main__":
    # Arrancamos uvicorn apuntando a la instancia 'app' dentro del paquete 'app'
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
