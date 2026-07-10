# 📚 Documentación Kinetix 2.0

**Kinetix** es una plataforma de "vibe-coding" agéntico que construye aplicaciones web completas a partir de lenguaje natural usando Claude y Tool Use.

---

## 🎯 Índice

1. [¿Qué es Kinetix?](#qué-es-kinetix)
2. [Arquitectura General](#arquitectura-general)
3. [El Agente: Cómo funciona paso a paso](#el-agente-cómo-funciona-paso-a-paso)
4. [Flujo de Usuario](#flujo-de-usuario)
5. [Componentes Principales](#componentes-principales)
6. [API Endpoints](#api-endpoints)
7. [Cómo ejecutar Kinetix](#cómo-ejecutar-kinetix)
8. [Ejemplos](#ejemplos)

---

## 🚀 ¿Qué es Kinetix?

Kinetix es un **agente de IA** que:

- **Escucha** lo que quieres construir (en lenguaje natural)
- **Piensa** cómo hacerlo (usando Claude)
- **Crea** archivos HTML, CSS, JavaScript
- **Ejecuta pruebas** automáticas
- **Itera** hasta que todo funcione

Todo en tiempo real, en el navegador.

### Características principales:

✅ **Agente Multi-rol** — 4 especialistas trabajando coordinadamente  
✅ **Tool Use** — Claude puede crear, editar y ejecutar código  
✅ **Live Preview** — Ves la app generada en tiempo real  
✅ **Soporte de Video** — Adjunta videos como referencia visual  
✅ **3 Modelos** — Sonnet 4.6, Haiku 4.5, Opus 4.8  
✅ **Historial Persistente** — Todos tus proyectos se guardan  

---

## 🏗️ Arquitectura General

Kinetix tiene 3 capas:

```
┌─────────────────────────────────────┐
│       FRONTEND (Browser)            │  ← Lo que ve el usuario
│  app.js + index.html + Tailwind     │
└────────────┬────────────────────────┘
             │ HTTP + WebSocket (SSE)
┌────────────▼────────────────────────┐
│       BACKEND (FastAPI)             │  ← API REST
│  api.py + routes + endpoints        │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│      AGENTE + HERRAMIENTAS          │  ← La magia
│  agent_engine.py + workspace_tools  │
│  llm_chat.py + Claude API           │
└─────────────────────────────────────┘
```

### Dónde vive cada cosa:

```
Kinetix2.0/
├── app/                          ← Tu aplicación
│   ├── routes/
│   │   ├── api.py               ← Todos los endpoints HTTP
│   │   └── web.py               ← Sirve HTML
│   ├── services/
│   │   ├── agent_engine.py      ← El cerebro (orquestación)
│   │   ├── llm_chat.py          ← Claude + Tool Use
│   │   └── workspace_tools.py   ← Crea/edita/lee archivos
│   ├── database/
│   │   └── connection.py        ← SQLite (proyectos + mensajes)
│   ├── templates/
│   │   └── index.html           ← UI landing + workspace
│   └── static/
│       ├── js/app.js            ← Lógica del frontend
│       └── css/style.css        ← Estilos
├── workspaces/                  ← Las apps generadas viven aquí
│   ├── {project-id-1}/
│   │   ├── index.html
│   │   ├── css/style.css
│   │   └── video.mp4
│   └── {project-id-2}/
├── run.py                        ← Punto de entrada
└── DOCUMENTACION.md              ← Este archivo
```

---

## 🤖 El Agente: Cómo funciona paso a paso

### Paso 1: Usuario escribe un prompt

```
Usuario en el browser: "Crea una calculadora elegante"
```

### Paso 2: El frontend envía a la API

```javascript
// app.js
fetch("/api/projects/{pid}/chat", {
  method: "POST",
  body: JSON.stringify({
    message: "Crea una calculadora elegante",
    model: "claude-sonnet-4-6",
    image_base64: null
  })
})
```

### Paso 3: El backend prepara el contexto

```python
# api.py - endpoint /chat
history = [
  {"role": "user", "content": "...mensajes anteriores..."},
  {"role": "assistant", "content": "...respuestas anteriores..."}
]

model = "claude-sonnet-4-6"

# Llama al agente
async for event in engine.run_agent(pid, message, model, history, image_b64):
    yield f"data: {json.dumps(event)}\n\n"
```

### Paso 4: El agente orquesta el trabajo

```python
# agent_engine.py - run_agent()

for _ in range(28):  # Máximo 28 turnos
    
    # A) Claude responde
    async for event in chat.stream_message(user_msg):
        if isinstance(event, TextDelta):
            yield {"type": "text_delta", "content": "..."}
        elif isinstance(event, ToolCallStart):
            yield {"type": "tool_start", "name": "write_file", "id": "123"}
    
    # B) Si Claude NO llamó herramientas → FIN
    if not tool_calls:
        break
    
    # C) Ejecuta cada herramienta que Claude pidió
    for tool_call in tool_calls:
        result = execute_tool(pid, tool_call.name, tool_call.arguments)
        yield {"type": "tool_result", "ok": result["ok"], ...}
        
        # Manda el resultado de vuelta a Claude
        chat.add_tool_result(tool_call.id, result)
    
    # D) Siguiente turno, sin mensaje nuevo del usuario
    user_msg = None
```

### Paso 5: Claude llama herramientas

Claude decide qué hacer:

```
Turno 1:
  Claude: "Voy a crear index.html"
  [tool_use] write_file("index.html", "<html>...")
  
Turno 2:
  Claude: "Ahora CSS"
  [tool_use] write_file("css/style.css", "body { ... }")
  
Turno 3:
  Claude: "Voy a ejecutar pruebas"
  [tool_use] run_tests()
  
Resultado: ✓ Archivo verificado
  
Turno 4:
  Claude: "¡Listo! Tu calculadora está lista."
  [sin tool_use]

→ Bucle termina
```

### Paso 6: Las herramientas se ejecutan en Python

```python
# workspace_tools.py

def write_file(pid: str, path: str, content: str) -> dict:
    f = workspaces/{pid}/{path}
    f.write_text(content)
    return {"ok": True, "path": path}

def run_tests(pid: str) -> dict:
    # Valida que index.html exista
    # Valida que los CSS/JS existan
    # Valida sintaxis
    return {"ok": True, "issues": []}
```

### Paso 7: Los eventos vuelven al navegador

```javascript
// app.js - recibe SSE stream

fetch(...).then(res => {
  const reader = res.body.getReader()
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    
    const event = JSON.parse(value)
    
    switch(event.type) {
      case "text_delta":
        appendText(event.content)  // Muestra el texto letra por letra
        break
      case "tool_start":
        addToolCard(event.id, event.name)  // Muestra spinner
        break
      case "tool_result":
        updateToolCard(event.id, event.ok)  // Muestra ✓ o ✗
        break
      case "preview_update":
        refreshPreview()  // Recarga el iframe
        break
    }
  }
})
```

### Paso 8: El usuario ve todo en tiempo real

```
┌─────────────────────────────────────┐
│           WORKSPACE                 │
├─────────────────────┬───────────────┤
│  CHAT               │  PREVIEW      │
│                     │               │
│ Cosmo               │ ┌───────────┐ │
│ > Voy a crear...    │ │  <iframe> │ │
│                     │ │ (se       │ │
│ ✓ write_file        │ │ actualiza │ │
│   index.html        │ │ en vivo)  │ │
│                     │ │           │ │
│ ✓ write_file        │ └───────────┘ │
│   style.css         │               │
│                     │               │
│ ✓ run_tests         │               │
│   0 issues          │               │
│                     │               │
│ Listo, tu app...    │               │
└─────────────────────┴───────────────┘
```

---

## 👤 Flujo de Usuario

### Escenario: Crear una nueva app

```
1. Usuario llega a http://localhost:8000/app
   └─ Frontend carga landing view
   └─ Hace GET /api/models
   └─ Hace GET /api/projects (últimas 200)

2. Usuario escribe: "Una app de notas"
   └─ Hace clic "Construir"
   └─ POST /api/projects {name: "Una app de notas", model: "claude-sonnet-4-6"}
   └─ Recibe: {id: "abc123", ...}
   └─ Crea carpeta: workspaces/abc123/

3. Frontend entra a workspace view
   └─ POST /api/projects/abc123/chat {message: "Una app de notas"}
   └─ Recibe SSE stream de eventos
   └─ GET /api/preview/abc123/index.html (live preview)

4. Agente trabaja (Claude + Tools)
   └─ write_file → archivo guardado
   └─ run_tests → validación
   └─ Iteraciones hasta terminar

5. Usuario ve resultado en vivo
   └─ Chat con eventos en tiempo real
   └─ Preview actualizado
   └─ Puede adjuntar imágenes/videos como referencia
```

### Escenario: Abrir un proyecto anterior

```
1. Usuario ve "Proyectos recientes" en landing
   └─ Hace clic en uno

2. GET /api/projects/abc123
   └─ Carga proyecto
   └─ Carga historial de mensajes
   └─ Carga lista de archivos

3. Workspace abre con el estado anterior
   └─ Chat con todas las interacciones previas
   └─ Preview del estado actual
   └─ Puede seguir iterando: "Cambia el color a azul"
```

---

## 🛠️ Componentes Principales

### 1. **llm_chat.py** — Claude + Tool Use

```python
class LlmChat:
    """Sesión de chat con Claude con soporte para herramientas."""
    
    def __init__(self, api_key, session_id, system_message, initial_messages):
        self.client = AsyncAnthropic(api_key=api_key)
        self.messages = []  # Historial
        self.tools = []     # Herramientas disponibles
    
    async def stream_message(self, user_msg):
        """Comunica con Claude y recibe texto + tool_calls en streaming."""
        
        # 1. Agrega mensaje del usuario al historial
        self.messages.append({"role": "user", "content": user_msg.text})
        
        # 2. Llama a Claude
        async for event in await self.client.messages.create(
            model=self.model_name,
            system=self.system_message,
            messages=self.messages,
            tools=self.tools,
            stream=True
        ):
            # 3. Procesa eventos de streaming
            if event.type == "content_block_start":
                if event.content_block.type == "tool_use":
                    yield ToolCallStart(name=..., id=...)
            
            elif event.type == "content_block_delta":
                if event.delta.type == "text_delta":
                    yield TextDelta(content=event.delta.text)
        
        # 4. Guarda la respuesta en el historial
        self.messages.append({
            "role": "assistant",
            "content": [texto + tool_uses]
        })
        
        yield StreamDone(tool_calls=[...])
```

### 2. **agent_engine.py** — Orquestador

```python
MODELS = {
    "claude-haiku-4-5-20251001": {"name": "Claude Haiku 4.5", "provider": "anthropic"},
    "claude-sonnet-4-6": {"name": "Claude Sonnet 4.6", "provider": "anthropic"},
    "claude-opus-4-8": {"name": "Claude Opus 4.8", "provider": "anthropic"},
    "gpt-5.5": {"name": "GPT-5.5", "provider": "openai"},
    "gpt-5.4-mini": {"name": "GPT-5.4 mini", "provider": "openai"},
}
# Cada modelo declara su "provider" (anthropic|openai). El orquestador usa ese campo
# para elegir el cliente correcto vía app.core.llm_client.create_chat(), que instancia
# LlmChat (Claude) u OpenAiChat (GPT) detrás de la misma interfaz de eventos.
# Requiere OPENAI_API_KEY en el entorno para que los modelos "openai" funcionen.

AGENT_LABELS = {
    "producto": "Agente de Producto / Diseño",
    "coder": "Agente de Desarrollo",
    "integraciones": "Agente de Integraciones",
    "qa": "Agente de Calidad",
}

SYSTEM_PROMPT = """
Eres **Kinetix**, un equipo de 4 agentes especializados...
"""

def build_tools():
    """Define las 8 herramientas disponibles para Claude."""
    return [
        {
            "name": "write_file",
            "description": "Crea un archivo",
            "parameters": {...}
        },
        {
            "name": "edit_file",
            "description": "Edita un archivo",
            "parameters": {...}
        },
        # ... más herramientas
    ]

async def run_agent(pid, user_text, model, history, image_b64):
    """El bucle principal del agente."""
    
    # 1. Prepara la sesión de chat
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=pid,
        system_message=SYSTEM_PROMPT,
        initial_messages=history
    ).with_model("anthropic", model).with_tools(TOOLS)
    
    # 2. Bucle de até 28 iteraciones
    for iteration in range(28):
        
        # A. Claude responde
        async for event in chat.stream_message(user_msg):
            if isinstance(event, TextDelta):
                yield {"type": "text_delta", "content": event.content}
            elif isinstance(event, ToolCallStart):
                yield {"type": "tool_start", "name": event.name, "id": event.id}
            elif isinstance(event, StreamDone):
                tool_calls = event.tool_calls
        
        # B. Si no hay tool_calls, termina
        if not tool_calls:
            break
        
        # C. Ejecuta cada herramienta
        for tc in tool_calls:
            result = execute_tool(pid, tc.name, tc.arguments)
            
            if tc.name == "set_phase":
                yield {"type": "phase", "agent": ..., "label": ...}
            else:
                yield {"type": "tool_result", "ok": result["ok"], ...}
            
            chat.add_tool_result(tc.id, json.dumps(result))
        
        # D. Siguiente iteración
        user_msg = None
```

### 3. **workspace_tools.py** — Herramientas

```python
BASE = pathlib.Path("workspaces")

def write_file(pid: str, path: str, content: str) -> dict:
    """Crea un archivo en workspaces/{pid}/{path}"""
    f = BASE / pid / path
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(content, encoding="utf-8")
    return {"ok": True, "path": path}

def edit_file(pid: str, path: str, old_str: str, new_str: str) -> dict:
    """Edita un archivo reemplazando exactamente old_str por new_str"""
    f = BASE / pid / path
    txt = f.read_text(encoding="utf-8")
    if old_str not in txt:
        return {"ok": False, "error": "No se encontró el texto"}
    f.write_text(txt.replace(old_str, new_str), encoding="utf-8")
    return {"ok": True}

def run_tests(pid: str) -> dict:
    """Valida que el proyecto sea válido."""
    issues = []
    
    # Verifica que exista index.html
    if "index.html" not in list_files(pid):
        issues.append("Falta index.html")
    
    # Verifica que los recursos locales existan
    for file in list_files(pid):
        if file.endswith(".html"):
            for ref in extract_references(file):
                if ref not in list_files(pid):
                    issues.append(f"Referencia inexistente: {ref}")
    
    return {"ok": len(issues) == 0, "issues": issues}
```

### 4. **api.py** — API REST

Todos los endpoints que el frontend puede llamar:

```python
GET  /api/models                        # Qué modelos existen
POST /api/projects                      # Crear proyecto
GET  /api/projects                      # Listar proyectos
GET  /api/projects/{pid}                # Abrir proyecto
DELETE /api/projects/{pid}              # Borrar proyecto
POST /api/projects/{pid}/upload         # Subir video/imagen
POST /api/projects/{pid}/chat           # Chat (SSE streaming)
GET  /api/projects/{pid}/files          # Listar archivos
GET  /api/projects/{pid}/file?path=...  # Leer archivo
GET  /api/preview/{pid}/{path:path}     # Servir archivo para preview
```

### 5. **app.js** — Frontend

```javascript
// Estado global
const state = {
  projectId: null,        // ID del proyecto actual
  model: "claude-sonnet-4-6",  // Modelo seleccionado
  streaming: false,       // ¿Está recibiendo respuesta?
  imageB64: null,         // Imagen adjunta
  videoFile: null,        // Video adjunto
}

// Flujo principal
async function startFromLanding() {
  // 1. Crear proyecto
  const proj = await fetch("/api/projects", {
    method: "POST",
    body: JSON.stringify({name: ..., model: state.model})
  }).then(r => r.json())
  
  state.projectId = proj.id
  
  // 2. Entrar a workspace
  enterWorkspace()
  
  // 3. Iniciar chat (SSE streaming)
  await streamMessage(prompt, imageB64)
}

async function streamMessage(text, imageB64) {
  // Abre conexión SSE al servidor
  const res = await fetch(`/api/projects/${state.projectId}/chat`, {
    method: "POST",
    body: JSON.stringify({message: text, model: state.model, image_base64: imageB64})
  })
  
  // Recibe eventos del servidor
  const reader = res.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    
    const event = JSON.parse(value)
    handleEvent(event)  // Procesa cada evento
  }
}

function handleEvent(ev) {
  switch (ev.type) {
    case "text_delta":
      appendText(ev.content)  // Agrega texto al chat
      break
    case "tool_start":
      addToolCard(ev.id, ev.name)  // Muestra herramienta
      break
    case "tool_result":
      updateToolCard(ev.id, ev.ok)  // Muestra resultado
      break
    case "preview_update":
      refreshPreview()  // Actualiza iframe
      break
  }
}
```

---

## 🔌 API Endpoints

### GET /api/models

**Qué hace:** Devuelve los modelos disponibles

**Response:**
```json
{
  "models": [
    {"id": "claude-haiku-4-5-20251001", "name": "Claude Haiku 4.5", "provider": "anthropic"},
    {"id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6", "provider": "anthropic"},
    {"id": "claude-opus-4-8", "name": "Claude Opus 4.8", "provider": "anthropic"},
    {"id": "gpt-5.5", "name": "GPT-5.5", "provider": "openai"},
    {"id": "gpt-5.4-mini", "name": "GPT-5.4 mini", "provider": "openai"}
  ],
  "default": "claude-sonnet-4-6"
}
```

---

### POST /api/projects

**Qué hace:** Crea un nuevo proyecto

**Request:**
```json
{
  "name": "Mi calculadora",
  "model": "claude-sonnet-4-6"
}
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Mi calculadora",
  "model": "claude-sonnet-4-6",
  "created_at": "2026-06-30T12:00:00+00:00"
}
```

---

### POST /api/projects/{pid}/chat

**Qué hace:** Abre conexión SSE para chat en vivo

**Request:**
```json
{
  "message": "Crea una calculadora elegante",
  "model": "claude-sonnet-4-6",
  "image_base64": null
}
```

**Response:** SSE stream de eventos

```
data: {"type": "text_delta", "content": "Voy a"}
data: {"type": "text_delta", "content": " crear"}
data: {"type": "tool_start", "name": "write_file", "id": "123"}
data: {"type": "tool_result", "name": "write_file", "ok": true, "path": "index.html"}
data: {"type": "preview_update"}
data: {"type": "message_done", "content": "..."}
data: {"type": "done"}
```

---

### GET /api/preview/{pid}/{path:path}

**Qué hace:** Sirve archivos del proyecto para el live preview

**Ejemplos:**
- `GET /api/preview/abc123/index.html` → `<html>...</html>`
- `GET /api/preview/abc123/css/style.css` → estilos
- `GET /api/preview/abc123/video.mp4` → el video adjunto

---

## 🏃 Cómo ejecutar Kinetix

### 1. Instalar dependencias

```bash
cd "Kinetix2.0"
pip install fastapi uvicorn anthropic aiosqlite python-multipart
```

### 2. Configurar variables de entorno

Crea un archivo `.env` en la raíz:

```env
EMERGENT_LLM_KEY=sk-ant-...  # Tu API key de Anthropic
```

### 3. Ejecutar

```bash
python run.py
```

Luego abre: `http://localhost:8000/app`

---

## 📝 Ejemplos

### Ejemplo 1: Crear una calculadora

**Paso 1:** Usuario escribe en landing
```
"Una calculadora elegante con tema oscuro"
```

**Paso 2:** Agente trabaja
```
Cosmo > Voy a crear un proyecto elegante con calculadora.

✓ Agente de Producto / Diseño · Definiendo estructura

✓ write_file index.html
   Creando HTML semántico con Tailwind

✓ write_file css/style.css
   Agregando estilos personalizados

✓ Agente de Desarrollo · Escribiendo JavaScript

✓ write_file js/calc.js
   Lógica de la calculadora

✓ Agente de Calidad · Validando proyecto

✓ run_tests
   ✓ 3 archivos verificados sin errores

¡Listo! Tu calculadora elegante está lista.
```

**Paso 3:** Preview muestra la app funcionando en tiempo real

---

### Ejemplo 2: Usar un video como referencia

**Paso 1:** Usuario adjunta un video del iPhone

**Paso 2:** Frontend:
- Sube el video a `workspaces/{pid}/video.mp4`
- Extrae un frame para que Claude lo vea
- Manda mensaje: `[📹 Video en workspace: 'video.mp4'. Úsalo como <video src="video.mp4">]`

**Paso 3:** Claude crea el HTML:
```html
<div class="video-container">
  <video src="video.mp4" autoplay muted loop playsinline></video>
</div>
```

**Paso 4:** Preview muestra el video reproduciendo

---

### Ejemplo 3: Iteración en vivo

**Usuario:** "Cambia los colores a azul"

**Agente:**
```
✓ edit_file css/style.css
  Cambiando .button { color: red; } a .button { color: blue; }

✓ run_tests
  ✓ Sin errores

Listo, cambié los colores a azul.
```

**Preview:** Se actualiza automáticamente

---

## 🔄 Diagrama de flujo completo

```
┌──────────────────────────────┐
│  Usuario en el browser       │
│  "Crea una calculadora"      │
└──────────────┬───────────────┘
               │
               ▼
      ┌────────────────┐
      │  Frontend      │
      │  app.js        │
      └────────┬───────┘
               │
      POST /api/projects/{pid}/chat
      {message, model, image_b64}
               │
               ▼
      ┌────────────────────┐
      │  Backend (api.py)  │
      │  /projects/{id}/chat
      └────────┬───────────┘
               │
               ▼
   ┌───────────────────────────┐
   │  agent_engine.run_agent() │
   │  (bucle de 28 iteraciones)│
   └────────┬──────────────────┘
            │
        Iteración 1:
            │
            ▼
   ┌────────────────────┐
   │  LlmChat           │
   │  .stream_message() │  ← Llama Claude API
   │  con model + tools │
   └────────┬───────────┘
            │
        Claude responde:
        "Voy a crear index.html"
        + tool_call: write_file(...)
            │
            ▼
   ┌──────────────────────┐
   │  execute_tool()      │
   │  workspace_tools.py  │
   └────────┬─────────────┘
            │
            ▼
   Archivo guardado en disco
   workspaces/{pid}/index.html
            │
            ▼
        Resultado → LlmChat.add_tool_result()
            │
        ¿Más herramientas?
            │
        SÍ → Iteración 2
        NO → Fin del bucle
            │
            ▼
   SSE stream al frontend:
   - text_delta
   - tool_start
   - tool_result
   - preview_update
   - message_done
            │
            ▼
   ┌────────────────────┐
   │  Browser procesa   │
   │  eventos en vivo   │
   │  actualiza preview │
   └────────────────────┘
            │
            ▼
   ┌────────────────────┐
   │  Usuario ve        │
   │  app funcionando   │
   │  en tiempo real    │
   └────────────────────┘
```

---

## 📊 Resumen de datos

### Estructura de carpeta workspace

```
workspaces/
└── 550e8400-e29b-41d4-a716-446655440000/
    ├── index.html          ← Punto de entrada
    ├── css/
    │   └── style.css
    ├── js/
    │   └── app.js
    ├── video.mp4           ← Si el usuario adjuntó video
    └── assets/
        └── logo.png        ← Si el usuario adjuntó imágenes
```

### Base de datos (SQLite)

```sql
-- Tabla de proyectos
projects (
  id TEXT PRIMARY KEY,
  name TEXT,
  model TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- Tabla de mensajes (historial de chat)
messages (
  id TEXT PRIMARY KEY,
  project_id TEXT FOREIGN KEY,
  role TEXT,              -- "user" o "assistant"
  content TEXT,
  created_at TIMESTAMP,
  has_image BOOLEAN
)
```

---

## 🎓 Conceptos clave

### Tool Use

Tool Use es la capacidad de Claude de **decidir llamar herramientas** en lugar de solo responder con texto.

```
SIN Tool Use:
  Usuario: "Crea un archivo"
  Claude: "Te mostraría cómo crear un archivo..."
  
CON Tool Use:
  Usuario: "Crea un archivo"
  Claude: [tool_use: write_file("archivo.txt", "contenido")]
  Backend: Archivo creado ✓
```

### SSE (Server-Sent Events)

SSE permite que el servidor **empuje eventos** al navegador sin que el navegador los pida.

```javascript
// Frontend: abre conexión
const es = new EventSource("/api/projects/abc/chat")

es.addEventListener("message", (e) => {
  const event = JSON.parse(e.data)
  // Procesa evento
})

// Backend: envía eventos
yield "data: " + JSON.stringify({type: "text_delta", ...}) + "\n\n"
```

### Streaming

Streaming permite que el usuario vea la respuesta **letra por letra** sin esperar a que termine.

```
Sin streaming:
  Claude piensa 5 segundos...
  Usuario recibe todo de golpe

Con streaming:
  Usuario ve: "Voy"
  Usuario ve: "Voy a"
  Usuario ve: "Voy a crear"
  ... (en tiempo real)
```

---

## 🐛 Debugging

### Ver logs del backend

```bash
python run.py
# Logs en consola
```

### Ver red del frontend

1. Abre DevTools (F12)
2. Tab "Network"
3. Filtra por "XHR" (XMLHttpRequest)
4. Haz un chat
5. Verás los eventos SSE en tiempo real

### Errores comunes

**Error: "modelo no encontrado"**
```
Solución: Verifica MODELS en agent_engine.py
Tiene que ser: "claude-sonnet-4-6" (no "claude-3-5-sonnet-latest")
```

**Error: "archivo no existe"**
```
Solución: Verifica que Claude escribe la ruta correcta
Debería ser: "index.html" (no "./index.html")
```

**Error: SSE se desconecta**
```
Solución: Revisa que no haya excepciones en run_agent()
Usa try/except para capturar errores
```

---

## 📈 Próximas mejoras

Cosas que se pueden agregar:

- [ ] Soporte para más tipos de archivos (JSON, XML, etc.)
- [ ] Exportar proyecto como ZIP
- [ ] Compartir proyecto con link público
- [ ] Colaboración en tiempo real
- [ ] Base de datos persistente para modelos entrenados
- [ ] Caché de respuestas para consultas repetidas
- [ ] UI mejorada con dark mode refinado

---

## 📞 Soporte

Si tienes dudas sobre algún componente específico, revisa:

1. **¿Cómo funciona el agente?** → Sección "El Agente"
2. **¿Dónde está Claude?** → `app/services/llm_chat.py`
3. **¿Cómo se crean archivos?** → `app/services/workspace_tools.py`
4. **¿Cómo funciona el API?** → `app/routes/api.py`
5. **¿Cómo funciona el frontend?** → `app/static/js/app.js`

---

**Kinetix 2.0** — Construye apps hablando. 🚀
