# T.H.E.M.I.S.

**Trusted Hybrid Engine for Multimodal Intelligence and Synthesis**

Plataforma de inteligencia artificial agéntica con estética J.A.R.V.I.S. que construye
aplicaciones web a partir de lenguaje natural, además de un modo de chat conversacional
con búsqueda web, noticias, clima y generación de imágenes.

---

## ✨ Características

- **Modo Construir / Proyecto / Carpeta Conectada** — Orquestador agéntico sobre una
  sesión de Claude con Tool Use (escritura de archivos, edición, tests, ejecución de
  comandos) que encarna cuatro roles: Producto, Coder, Integraciones y QA.
- **Modo Chat** — Conversación con herramientas de noticias, búsqueda web, clima y
  generación de imágenes.
- **Multi-proveedor de modelos** — Anthropic (Claude), OpenAI (GPT-5.x) y DeepSeek,
  detrás de una interfaz común. Solo se muestran los modelos cuyo proveedor tiene
  API key configurada.
- **Dashboard de telemetría** — Consumo de tokens, modelos activos y estado de servicios.
- **Feed de Noticias** — Puerto Rico (RSS de medios locales) y EE. UU. (NewsAPI), con
  pop-up "Informe de Situación" en carrusel y lectura por voz opcional (Fish Audio TTS).
- **Galería** — Imágenes generadas por IA.

## 🛠️ Stack

- **Backend**: FastAPI + Uvicorn (Python 3.11+)
- **Frontend**: HTML + Tailwind CSS + JavaScript modular (ES modules)
- **Base de datos**: SQLite
- **LLMs**: Anthropic, OpenAI, DeepSeek · **TTS**: Fish Audio

## 🚀 Puesta en marcha

1. **Clonar e instalar dependencias**

   ```bash
   git clone https://github.com/Miguel0728/T.H.E.M.I.S.git
   cd T.H.E.M.I.S
   pip install -r requirements.txt
   ```

2. **Configurar variables de entorno**

   Copia la plantilla y rellena tus claves (como mínimo `ANTHROPIC_API_KEY`):

   ```bash
   cp .env.example .env
   ```

   | Variable            | Requerida | Uso                                             |
   | ------------------- | --------- | ----------------------------------------------- |
   | `ANTHROPIC_API_KEY` | ✅ Sí     | Núcleo (Claude). Alias de `EMERGENT_LLM_KEY`.   |
   | `OPENAI_API_KEY`    | Opcional  | Modelos GPT y generación de imágenes.           |
   | `DEEPSEEK_API_KEY`  | Opcional  | Modelos DeepSeek.                               |
   | `NEWS_API`          | Opcional  | Feed de noticias (newsapi.org).                 |
   | `FISH_API_KEY`      | Opcional  | Voz TTS de J.A.R.V.I.S. (fish.audio).           |

3. **Ejecutar**

   ```bash
   python run.py
   ```

   Abre **http://localhost:8001/** en el navegador (usa `localhost`, no `0.0.0.0`).
   El puerto se puede cambiar con la variable `PORT`.

## 📁 Estructura

```
app/
├── __init__.py        # App FastAPI, middleware, montaje de estáticos
├── config/            # settings.py (modelos, claves) y prompts.py
├── core/              # Clientes: LLM, imágenes, noticias, clima, búsqueda web
├── agents/            # Orquestador agéntico y motor de chat
├── routes/            # Endpoints: web, projects, chats, news, gallery, dashboard, tts
├── tools/             # Tools del agente (archivos, shell, QA, seguridad, noticias…)
├── database/          # Conexión SQLite
├── static/            # CSS, JS modular, imágenes
└── templates/         # Vistas Jinja2 (pages/, components/, layout/)
run.py                 # Punto de entrada
```

Para una explicación detallada de la arquitectura y el flujo del agente, ver
[`DOCUMENTACION.md`](DOCUMENTACION.md).

## 🔒 Seguridad

El archivo `.env` con tus claves está excluido del control de versiones
(`.gitignore`). **Nunca** subas claves reales al repositorio. Usa `.env.example`
como referencia de las variables necesarias.
