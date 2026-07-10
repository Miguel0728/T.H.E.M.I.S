/* Kinetix — Vanilla JS frontend for the agentic coding platform. */
if (window.marked) {
  marked.use({ breaks: true });
}
const API = "/api";
const MAX_IMAGES = 5;

const state = {
  projectId: null,
  model: "claude-sonnet-4-6",
  device: "desktop",
  imageFiles: [],    // Array de File objects (máx 5)
  videoFile: null,
  streaming: false,
  toolCards: {},
  pendingToolIds: new Set(),  // Tool cards con spinner sin resolver
  currentTextEl: null,
  turnEl: null,
};

// Estado del modo Chat (conversaciones normales, independiente de los proyectos)
const chatState = {
  chatId: null,
  streaming: false,
  imageMode: false,
  imageFiles: [],    // Array de File objects adjuntos como referencia (máx MAX_IMAGES)
};

// Estado del feed de Noticias (funcionalidad directa vía NewsAPI, no un tool de agente)
const newsState = {
  region: "all",
  cache: {},
};

const TEMPLATES = [
  { icon: "check-square", name: "Gestor de tareas", desc: "Listas, categorías y prioridades", prompt: "Una app de gestión de tareas con sensación premium: tipografía cuidada, espaciado generoso y una paleta neutra con un color de acento. Sidebar con categorías y contador de pendientes por categoría, listado principal con checkbox animado (tachado + fade al completar), badges de prioridad por color, fechas límite con aviso visual si están vencidas, y un modal elegante para crear/editar tareas con transición suave. Incluye drag & drop para reordenar, filtros (todas/pendientes/completadas), estado vacío ilustrado cuando no hay tareas, microinteracciones en hover/focus, y persistencia en localStorage." },
  { icon: "shopping-bag", name: "Tienda online", desc: "Catálogo, carrito y checkout", prompt: "Una tienda online con estética premium tipo e-commerce moderno: grid de productos con imágenes grandes, hover con zoom sutil y transición suave, badges de descuento/nuevo, filtros por categoría y precio, y buscador con resultados instantáneos. Carrito lateral deslizante (drawer) con animación de entrada, contador de unidades, subtotal en vivo y botón de checkout destacado. Flujo de checkout simulado en pasos (carrito → datos de envío → confirmación) con barra de progreso y una pantalla de éxito con animación. Cuida el spacing, la jerarquía tipográfica y los estados de carga/vacío." },
  { icon: "user-circle", name: "Portafolio personal", desc: "Proyectos, sobre mí y contacto", prompt: "Un portafolio personal con diseño editorial de alta gama: hero con animación de entrada (fade + slide) y tipografía grande, sección 'sobre mí' con foto y bio, grid de proyectos con tarjetas que hacen lift al hover mostrando overlay con descripción y tecnologías usadas, sección de habilidades con barras o chips animados, y formulario de contacto con validación en tiempo real y estado de envío (loading/success). Scroll suave entre secciones, animaciones reveal-on-scroll discretas, modo responsive impecable y una paleta minimalista (blanco/negro + un acento) con buen contraste." },
  { icon: "bar-chart-3", name: "Dashboard analítico", desc: "Métricas y gráficas en vivo", prompt: "Un dashboard analítico con look profesional tipo SaaS: sidebar de navegación, header con selector de rango de fechas, fila de tarjetas KPI con número grande, variación porcentual (verde/rojo) y mini-sparkline. Gráficas de líneas/barras interactivas con tooltip al hover, tabla de datos con ordenamiento por columna, búsqueda y paginación. Usa iconos profesionales de Iconify (ej: `https://api.iconify.design/mdi:chart-line.svg?height=24`) para cada métrica/sección en lugar de emojis. Skeleton loaders mientras 'cargan' los datos, transiciones suaves al cambiar de rango, y una paleta oscura o clara consistente con buen uso de espacio en blanco y jerarquía visual clara entre lo primario y lo secundario." },
  { icon: "newspaper", name: "Blog minimalista", desc: "Artículos, tags y búsqueda", prompt: "Un blog minimalista con tipografía editorial cuidada (buen line-height y ancho de línea legible): portada con artículo destacado grande y listado de artículos en grid/lista con imagen, título, extracto y tiempo de lectura estimado. Filtro por etiquetas con chips activos, buscador con resultados en vivo, y vista de artículo individual con tipografía de lectura cómoda, tabla de contenidos flotante opcional y navegación a artículo anterior/siguiente. Transiciones suaves entre vistas, modo claro elegante, y detalles como fecha, autor y tiempo de lectura bien jerarquizados." },
  { icon: "timer", name: "Temporizador Pomodoro", desc: "Foco, descansos y estadísticas", prompt: "Un temporizador Pomodoro con estética calmada y premium: círculo de progreso animado (SVG) que se vacía en tiempo real, transición de color entre modo foco/descanso corto/descanso largo, controles grandes (play/pausa/reiniciar) con feedback táctil visual, y configuración de duración de ciclos en un panel deslizante. Notificación visual y sonido sutil al terminar cada ciclo, contador de pomodoros completados en el día, y una vista de estadísticas simple (gráfica de sesiones por día) con transiciones suaves. Cuida la tipografía del número del timer, debe sentirse grande, legible y con presencia." },
  { icon: "utensils-crossed", name: "Recetario de cocina", desc: "Recetas, ingredientes y favoritos", prompt: "Una app de recetas con estética cálida y premium tipo revista de cocina: grid de recetas con imagen grande, tiempo de preparación (ícono de reloj de Iconify) y nivel de dificultad, buscador con filtro por ingredientes o categoría (desayuno/almuerzo/postre), y botón de favorito con animación de corazón al hacer clic. Vista de detalle de receta con lista de ingredientes con checkboxes (para ir marcando mientras cocinas), pasos numerados con buen espaciado de lectura e iconos profesionales de Iconify para cada paso. Sección de favoritos accesible desde el header. Cuida las fotos grandes, tipografía cálida, transiciones suaves al navegar y un estado vacío agradable en 'favoritos' cuando no hay ninguno guardado." },
  { icon: "rocket", name: "Landing page SaaS", desc: "Hero, precios y CTA", prompt: "Una landing page de producto SaaS con nivel de agencia premium: hero con headline fuerte, subcopy claro, CTA primario y secundario, y un mockup/ilustración con animación sutil de entrada. Sección de logos de clientes (usa Iconify: `https://api.iconify.design/simple-icons:[brand].svg`), features en grid con iconos profesionales de Iconify (Material Design, Tabler) en lugar de emojis, y microcopys concisos. Sección de precios con 3 planes (uno destacado como 'popular') y toggle mensual/anual animado, testimonios en carrusel o grid, y footer completo con CTA final. Anima la aparición de secciones al hacer scroll (fade+slide discreto), cuida mucho el spacing entre secciones, la jerarquía tipográfica y que todo se sienta cohesivo con una sola paleta de acento bien aplicada." },
];

const $ = (id) => document.getElementById(id);
const icons = () => window.lucide && lucide.createIcons();

// Las tres familias de menús flotantes (modelo, adjuntar media, herramientas
// del chat) comparten un único punto de cierre para que abrir una siempre
// cierre las demás — evita el bug de menús superpuestos detectado en auditoría.
const FLOATING_MENU_CLASSES = ["model-floating-menu", "media-floating-menu", "chat-floating-menu"];

function closeAllFloatingMenus() {
  FLOATING_MENU_CLASSES.forEach((cls) => {
    document.querySelectorAll(`.${cls}`).forEach((m) => m.classList.add("hidden"));
  });
}

document.addEventListener("click", (e) => {
  if (!e.target.closest("[id$='-btn']")) closeAllFloatingMenus();
});

const TOOL_META = {
  write_file: { icon: "file-plus", label: "Escribiendo archivo" },
  edit_file: { icon: "file-pen", label: "Editando archivo" },
  read_file: { icon: "file-search", label: "Leyendo archivo" },
  list_files: { icon: "folder", label: "Listando archivos" },
  create_directory: { icon: "folder-plus", label: "Creando carpeta" },
  delete_file: { icon: "trash-2", label: "Eliminando archivo" },
  run_tests: { icon: "shield-check", label: "QA · Ejecutando pruebas" },
  fetch_url: { icon: "globe", label: "Descargando página" },
};

// ----------------------------- Init -----------------------------
async function init() {
  await loadModels();
  await loadRecent();
  renderTemplates();
  setupComposer();
  setupChatComposer();
  setupMediaDropdowns();
  setupMediaUpload();
  setupChatToolsDropdowns();
  setupRevealAnimations();
  icons();
}

// ----------------------------- Discrete "alive" animations -----------------------------
function setupRevealAnimations() {
  const targets = document.querySelectorAll(".reveal-up");
  if (!targets.length) return;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  targets.forEach((t) => io.observe(t));
}

let MODEL_LIST = [];

const modelIconSrc = (m) =>
  m?.provider === "openai" ? "/api/static/img/ChatGPT.png" : "/api/static/img/ClaudeSpark.png";
const modelIconAlt = (m) => (m?.provider === "openai" ? "OpenAI" : "Claude");
const modelIconClass = (m) => (m?.provider === "openai" ? "w-6 h-6" : "w-4 h-4") + " flex-shrink-0";

// Aplica el modelo elegido (o el guardado de un proyecto) al estado + label/ícono en toda la UI.
function applyModelToUI(modelId) {
  const m = MODEL_LIST.find((x) => x.id === modelId);
  state.model = modelId;
  document.querySelectorAll('[id$="-label"]').forEach((label) => { label.textContent = m?.name || "Modelo"; });
  document.querySelectorAll('[id$="-icon"]').forEach((img) => {
    img.src = modelIconSrc(m);
    img.alt = modelIconAlt(m);
    img.className = modelIconClass(m);
  });
}

async function loadModels() {
  const res = await fetch(`${API}/models`);
  const data = await res.json();
  MODEL_LIST = data.models;
  state.model = data.default;

  const buildMenu = (btnId, menuId) => {
    const btn = $(btnId);
    const menu = $(menuId);

    // Cada fila de modelo muestra nombre + tagline amigable (#9) y marca la
    // selección actual, para que un usuario no técnico no tenga que adivinar
    // qué significa "Sonnet" vs "Opus".
    const renderModelRow = (m, iconSrc, iconAlt) => `
      <button type="button" class="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-100 transition-colors text-left border-0 bg-transparent cursor-pointer" data-model="${m.id}">
        <img src="${iconSrc}" class="w-4 h-4 flex-shrink-0 object-contain" alt="${iconAlt}" />
        <span class="flex flex-col leading-tight flex-1 min-w-0">
          <span class="text-xs font-body text-zinc-700 truncate">${escapeHtml(m.name)}${m.recommended ? " ★" : ""}</span>
          ${m.tagline ? `<span class="text-[10px] text-zinc-400">${escapeHtml(m.tagline)}</span>` : ""}
        </span>
        ${m.id === state.model ? '<i data-lucide="check" class="w-3.5 h-3.5 text-sage-600 shrink-0"></i>' : ""}
      </button>`;

    // Grupo de proveedor con submenú expandible por click (no solo hover, para
    // que también funcione en pantallas táctiles) y que se auto-oculta si el
    // proveedor no tiene modelos disponibles (ej. sin OPENAI_API_KEY).
    const renderProviderGroup = (provider, label, logoSrc, models, iconSrc, iconAlt) => {
      if (!models.length) return "";
      return `
        <div class="provider-group relative" data-provider="${provider}">
          <button type="button" class="provider-group-btn w-full flex items-center justify-between px-3 py-2.5 hover:bg-zinc-100 transition-colors text-left border-0 bg-transparent cursor-pointer">
            <div class="flex items-center gap-2">
              <img src="${logoSrc}" class="flex-shrink-0 object-contain" style="width: 18px; height: 18px;" alt="${label}" />
              <span class="text-xs font-body font-semibold tracking-wider text-zinc-700">${label}</span>
            </div>
            <i data-lucide="chevron-right" class="w-3.5 h-3.5 text-zinc-400"></i>
          </button>
          <div class="provider-submenu hidden absolute top-0 bg-white border border-zinc-200 rounded-xl shadow-md py-1 min-w-[200px] z-[99999]">
            ${models.map((m) => renderModelRow(m, iconSrc, iconAlt)).join("")}
          </div>
        </div>`;
    };

    // Coloca el submenú a la derecha del grupo, o a la izquierda si no hay
    // espacio — evita que se corte fuera del viewport (bug detectado en auditoría).
    const positionSubmenu = (group, submenu) => {
      const rect = group.getBoundingClientRect();
      const SUBMENU_WIDTH = 210;
      const openLeft = window.innerWidth - rect.right - 8 < SUBMENU_WIDTH;
      submenu.style.top = "0";
      if (openLeft) {
        submenu.style.right = "100%";
        submenu.style.left = "auto";
        submenu.style.marginRight = "4px";
      } else {
        submenu.style.left = "100%";
        submenu.style.right = "auto";
        submenu.style.marginLeft = "4px";
      }
    };

    const renderProvidersMenu = () => {
      const anthropicModels = MODEL_LIST.filter((m) => m.provider === "anthropic");
      const openaiModels = MODEL_LIST.filter((m) => m.provider === "openai");

      menu.innerHTML = `
        <div class="relative py-1">
          ${renderProviderGroup("anthropic", "ANTHROPIC", "/api/static/img/AnthropicLogo.png", anthropicModels, "/api/static/img/ClaudeSpark.png", "Claude Spark")}
          ${renderProviderGroup("openai", "OPENAI", "/api/static/img/OpenAI.png", openaiModels, "/api/static/img/ChatGPT.png", "ChatGPT")}
        </div>
      `;

      menu.querySelectorAll(".provider-group").forEach((group) => {
        const groupBtn = group.querySelector(".provider-group-btn");
        const submenu = group.querySelector(".provider-submenu");
        groupBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const isHidden = submenu.classList.contains("hidden");
          menu.querySelectorAll(".provider-submenu").forEach((s) => s.classList.add("hidden"));
          if (isHidden) {
            positionSubmenu(group, submenu);
            submenu.classList.remove("hidden");
          }
        });
      });

      icons();
    };

    // Sacamos el menú del flujo normal y lo adherimos al body
    document.body.appendChild(menu);
    menu.classList.add("model-floating-menu");

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isHidden = menu.classList.contains("hidden");
      closeAllFloatingMenus();

      if (isHidden) {
        // Al abrir, renderizamos el listado de proveedores y sus sub-menús
        renderProvidersMenu();

        const rect = btn.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom - 8;
        const spaceAbove = rect.top - 8;
        const MIN_COMFORTABLE = 220;

        Object.assign(menu.style, {
          position: "fixed",
          zIndex: "99999",
          left: rect.left + "px",
          minWidth: Math.max(rect.width, 200) + "px",
          // Desborde visible para permitir renderizado del sub-menú absoluto al lado
          overflow: "visible",
        });

        if (spaceBelow >= MIN_COMFORTABLE || spaceBelow >= spaceAbove) {
          menu.style.top = (rect.bottom + 4) + "px";
          menu.style.bottom = "auto";
          menu.style.maxHeight = Math.max(spaceBelow, 80) + "px";
        } else {
          menu.style.bottom = (window.innerHeight - rect.top + 4) + "px";
          menu.style.top = "auto";
          menu.style.maxHeight = Math.max(spaceAbove, 80) + "px";
        }

        menu.classList.remove("hidden");
      }
    });

    menu.addEventListener("click", (e) => {
      const modelBtn = e.target.closest("[data-model]");
      if (modelBtn) {
        applyModelToUI(modelBtn.dataset.model);
        menu.classList.add("hidden");
      }
    });
  };

  buildMenu("landing-model-btn", "landing-model-menu");
  buildMenu("model-btn", "model-menu");
  buildMenu("chat-start-model-btn", "chat-start-model-menu");
  buildMenu("chat-model-btn", "chat-model-menu");
}

function renderTemplates() {
  const el = $("template-gallery");
  if (!el) return;
  el.innerHTML = TEMPLATES.map(
    (t, i) => `<div class="card lift-card group bg-white border border-zinc-200 rounded-xl p-5 hover:border-zinc-400 cursor-pointer shadow-sm" onclick="Cosmo.useTemplate('${t.prompt.replace(/'/g, "\\'")}')">
        <div class="card-icon lift-icon w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center mb-3 text-zinc-600">
          <i data-lucide="${t.icon}" class="w-5 h-5"></i>
        </div>
        <div class="text-sm font-medium text-zinc-900 mb-1">${escapeHtml(t.name)}</div>
        <div class="text-xs text-zinc-500">${escapeHtml(t.desc)}</div>
      </div>`
  ).join("");
  icons();
}

function useTemplate(prompt) {
  const ta = $("landing-prompt");
  ta.value = prompt;
  ta.scrollIntoView({ behavior: "smooth", block: "center" });
  ta.focus();
}

// Chips de sugerencia del estado vacío del chat: precargan el inicio de una
// frase y dejan el cursor listo para que el usuario la complete.
function useChatSuggestion(prefix) {
  const ta = $("chat-start-input");
  ta.value = prefix;
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

async function loadRecent() {
  const res = await fetch(`${API}/projects`);
  const items = await res.json();
  const el = $("recent-projects");
  if (!items.length) {
    el.innerHTML = `<div class="text-sm text-zinc-400 col-span-full">Aún no hay proyectos. ¡Crea el primero!</div>`;
    return;
  }
  el.innerHTML = items
    .map(
      (p, i) => `<div class="recent-card lift-card group bg-white border border-zinc-200 rounded-lg p-4 hover:border-zinc-400 cursor-pointer shadow-sm" onclick="Cosmo.openProject('${p.id}')">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-2 min-w-0">
            <i data-lucide="layout-template" class="lift-icon w-4 h-4 text-zinc-400 shrink-0"></i>
            <span class="text-sm text-zinc-800 truncate">${escapeHtml(p.name)}</span>
          </div>
          <button onclick="event.stopPropagation();Cosmo.deleteProject('${p.id}')" class="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-opacity">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
        <div class="text-[11px] text-zinc-400 mt-2 font-mono">${(p.updated_at || "").slice(0, 16).replace("T", " ")}</div>
      </div>`
    )
    .join("");
  icons();
}

// ----------------------------- Navigation -----------------------------
function goHome() {
  state.projectId = null;
  state.streaming = false;
  clearMediaState();
  $("workspace-view").classList.add("hidden");
  $("workspace-view").classList.remove("flex");
  $("chat-view").classList.add("hidden");
  $("chat-view").classList.remove("flex");
  setChatToggleUI(false);
  $("landing-view").classList.remove("hidden");
  $("landing-prompt").value = "";
  renderMediaPreviews("landing-media-row");
  loadRecent();
}

// ----------------------------- Modo Chat (conversaciones normales) -----------------------------
function toggleChatMode() {
  const active = !$("chat-view").classList.contains("hidden");
  if (active) {
    goHome();
  } else {
    enterChatMode();
  }
}

function enterChatMode() {
  $("landing-view").classList.add("hidden");
  $("workspace-view").classList.add("hidden");
  $("workspace-view").classList.remove("flex");
  $("chat-view").classList.remove("hidden");
  $("chat-view").classList.add("flex");
  setChatToggleUI(true);
  loadChatList();
  newChatView();
}

function setChatToggleUI(active) {
  const track = $("chat-mode-toggle");
  const knob = $("chat-mode-toggle-knob");
  const labelBuild = $("mode-label-build");
  const labelChat = $("mode-label-chat");

  track.classList.toggle("bg-zinc-900", active);
  track.classList.toggle("bg-zinc-200", !active);
  knob.style.transform = active ? "translateX(20px)" : "translateX(0)";

  labelBuild.classList.toggle("text-zinc-900", !active);
  labelBuild.classList.toggle("text-zinc-400", active);
  labelChat.classList.toggle("text-zinc-900", active);
  labelChat.classList.toggle("text-zinc-400", !active);
}

function showChatEmptyState() {
  $("chat-thread").classList.add("hidden");
  $("chat-thread").classList.remove("flex");
  $("chat-empty").classList.remove("hidden");
  $("chat-empty").classList.add("flex");
}

function showChatThreadState() {
  $("chat-empty").classList.add("hidden");
  $("chat-empty").classList.remove("flex");
  $("chat-thread").classList.remove("hidden");
  $("chat-thread").classList.add("flex");
}

function newChatView() {
  chatState.chatId = null;
  $("chat-start-input").value = "";
  $("chat-thread-scroll").innerHTML = "";
  hideNewsPanel();
  showChatEmptyState();
  highlightActiveChatInList(null);
  highlightNavSection("chats");
  toggleChatSidebar(false);
}

// Sidebar de conversaciones: fijo en desktop, drawer deslizable en móvil.
function toggleChatSidebar(forceOpen) {
  const sidebar = $("chat-sidebar");
  const backdrop = $("chat-sidebar-backdrop");
  const willOpen = forceOpen !== undefined ? forceOpen : sidebar.classList.contains("-translate-x-full");
  sidebar.classList.toggle("-translate-x-full", !willOpen);
  backdrop.classList.toggle("hidden", !willOpen);
}

async function loadChatList() {
  const res = await fetch(`${API}/chats`);
  const items = await res.json();
  const el = $("chat-list");
  if (!items.length) {
    el.innerHTML = `<div class="px-3 py-2 text-xs text-zinc-400">Sin conversaciones aún</div>`;
    return;
  }
  el.innerHTML = items
    .map(
      (c) => `<div class="chat-list-item group flex items-center justify-between gap-1 px-3 py-2 rounded-lg cursor-pointer text-sm text-zinc-600 hover:bg-zinc-100 transition-colors" data-chat-id="${c.id}" onclick="Cosmo.openChat('${c.id}')">
        <span class="truncate">${escapeHtml(c.name)}</span>
        <button onclick="event.stopPropagation();Cosmo.deleteChat('${c.id}')" class="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-opacity shrink-0">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>`
    )
    .join("");
  icons();
  highlightActiveChatInList(chatState.chatId);
}

function highlightActiveChatInList(cid) {
  document.querySelectorAll("#chat-list .chat-list-item").forEach((el) => {
    const active = cid && el.dataset.chatId === cid;
    el.classList.toggle("bg-zinc-100", active);
    el.classList.toggle("text-zinc-900", active);
  });
}

async function openChat(cid) {
  const res = await fetch(`${API}/chats/${cid}`);
  if (!res.ok) return;
  const data = await res.json();
  chatState.chatId = cid;
  applyModelToUI(data.chat.model || state.model);
  $("chat-thread-scroll").innerHTML = "";
  hideNewsPanel();
  showChatThreadState();
  data.messages.forEach((m) => {
    if (m.role === "user") addUserBubble(m.content, "chat-thread-scroll");
    else addStaticAssistant(m.content, "chat-thread-scroll");
  });
  scrollChat("chat-thread-scroll");
  highlightActiveChatInList(cid);
  highlightNavSection("chats");
  toggleChatSidebar(false);
}

// ----------------------------- Noticias (funcionalidad directa vía NewsAPI) -----------------------------
function highlightNavSection(section) {
  const chatsBtn = $("nav-chats-btn");
  const newsBtn = $("nav-news-btn");
  if (chatsBtn) {
    chatsBtn.classList.toggle("bg-zinc-200/60", section === "chats");
    chatsBtn.classList.toggle("text-zinc-900", section === "chats");
  }
  if (newsBtn) {
    newsBtn.classList.toggle("bg-zinc-200/60", section === "news");
    newsBtn.classList.toggle("text-zinc-900", section === "news");
  }
}

function hideNewsPanel() {
  const panel = $("chat-news");
  panel.classList.add("hidden");
  panel.classList.remove("flex");
}

function showNewsPanel() {
  $("chat-empty").classList.add("hidden");
  $("chat-empty").classList.remove("flex");
  $("chat-thread").classList.add("hidden");
  $("chat-thread").classList.remove("flex");
  const panel = $("chat-news");
  panel.classList.remove("hidden");
  panel.classList.add("flex");
  highlightActiveChatInList(null);
  highlightNavSection("news");
  toggleChatSidebar(false);
  loadNews(newsState.region);
}

function setNewsTabsUI() {
  document.querySelectorAll(".news-tab-btn").forEach((btn) => {
    const active = btn.id === `news-tab-${newsState.region}`;
    // Pill activo: fondo blanco con sombra sutil; inactivo: transparente
    btn.classList.toggle("bg-white", active);
    btn.classList.toggle("shadow-sm", active);
    btn.classList.toggle("text-zinc-900", active);
    btn.classList.toggle("text-zinc-500", !active);
    btn.classList.toggle("hover:text-zinc-700", !active);
  });
}

function formatNewsDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

async function loadNews(region) {
  if (region) newsState.region = region;
  setNewsTabsUI();

  const grid = $("news-grid");
  grid.innerHTML = `<div class="flex items-center justify-center gap-2 text-sm text-zinc-400 py-16">
    <i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Cargando noticias…
  </div>`;
  icons();

  try {
    const res = await fetch(`${API}/news?region=${newsState.region}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Error cargando noticias");
    renderNewsGrid(data.articles || []);
  } catch (e) {
    grid.innerHTML = `<div class="text-sm text-red-500 py-16 text-center">⚠ ${escapeHtml(friendlyError(e.message, "noticias"))}</div>`;
  }
}

// Grid de tarjetas verticales: imagen prominente arriba + resumen abajo
function renderNewsGrid(articles) {
  const grid = $("news-grid");
  if (!articles.length) {
    grid.innerHTML = `<div class="text-sm text-zinc-400 py-16 text-center">No se encontraron noticias.</div>`;
    return;
  }
  const cards = articles.map(renderNewsCard).join("");
  // Grid de 2 columnas en pantallas medianas, 3 en grandes
  grid.innerHTML = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">${cards}</div>`;
  icons();
}

function renderNewsCard(a) {
  // Imagen grande en la parte superior del card (ocupa todo el ancho)
  const thumb = a.image
    ? `<div class="w-full h-48 overflow-hidden rounded-t-xl bg-zinc-100">
         <img src="${a.image}" alt="" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onerror="this.parentElement.style.display='none'" />
       </div>`
    : `<div class="w-full h-48 bg-zinc-100 rounded-t-xl flex items-center justify-center">
         <i data-lucide="newspaper" class="w-10 h-10 text-zinc-300"></i>
       </div>`;

  return `<a href="${a.url}" target="_blank" rel="noopener noreferrer"
      class="news-card group flex flex-col bg-white border border-zinc-200 rounded-xl hover:border-zinc-400 hover:shadow-lg transition-all duration-200 overflow-hidden">
      ${thumb}
      <div class="flex flex-col gap-2 p-4 flex-1">
        <span class="text-[10px] font-mono uppercase tracking-widest text-zinc-400">${escapeHtml(a.source || "")} · ${formatNewsDate(a.publishedAt)}</span>
        <h3 class="text-sm font-semibold text-zinc-900 leading-snug line-clamp-3 group-hover:text-zinc-600 transition-colors">${escapeHtml(a.title || "")}</h3>
        ${a.description ? `<p class="text-xs text-zinc-500 leading-relaxed line-clamp-3 mt-auto pt-1">${escapeHtml(a.description)}</p>` : ""}
      </div>
    </a>`;
}

function showDeleteConfirmModal(chatName, onConfirm) {
  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-sm fade-in";
  overlay.innerHTML = `
    <div class="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 slide-up border border-zinc-100 flex flex-col gap-4">
      <div class="flex flex-col gap-2">
        <h3 class="text-lg font-semibold text-zinc-900 font-heading">¿Eliminar conversación?</h3>
        <p class="text-sm text-zinc-500 font-body leading-relaxed">
          La conversación <span class="font-medium text-zinc-800">“${escapeHtml(chatName)}”</span> se eliminará permanentemente. Esta acción no se puede deshacer.
        </p>
      </div>
      <div class="flex justify-end gap-2 mt-2">
        <button id="confirm-modal-cancel" class="px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer">
          Cancelar
        </button>
        <button id="confirm-modal-delete" class="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors cursor-pointer">
          Eliminar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  
  const cancelBtn = overlay.querySelector("#confirm-modal-cancel");
  const deleteBtn = overlay.querySelector("#confirm-modal-delete");
  cancelBtn.focus();

  const closeModal = () => {
    overlay.remove();
  };

  cancelBtn.addEventListener("click", closeModal);
  deleteBtn.addEventListener("click", () => {
    closeModal();
    onConfirm();
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  const handleEscape = (e) => {
    if (e.key === "Escape") {
      closeModal();
      document.removeEventListener("keydown", handleEscape);
    }
  };
  document.addEventListener("keydown", handleEscape);
}

async function deleteChat(cid) {
  const chatItem = document.querySelector(`#chat-list [data-chat-id="${cid}"]`);
  const chatName = chatItem ? chatItem.querySelector("span.truncate").textContent : "esta conversación";

  showDeleteConfirmModal(chatName, async () => {
    await fetch(`${API}/chats/${cid}`, { method: "DELETE" });
    if (chatState.chatId === cid) newChatView();
    loadChatList();
  });
}

async function createChatConversation(name) {
  const res = await fetch(`${API}/chats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.slice(0, 50), model: state.model }),
  });
  return res.json();
}

async function submitChatPrompt() {
  const ta = $("chat-start-input");
  const text = ta.value.trim();
  if (!text || chatState.streaming) return;

  if (chatState.imageMode) {
    await generateChatImage();
    toggleChatImageMode(false);
    return;
  }

  const imgFiles = [...chatState.imageFiles];
  const imagesB64 = imgFiles.length > 0 ? await getImagesBase64(imgFiles) : [];

  ta.value = "";
  clearChatMediaState();

  const chatRow = await createChatConversation(text);
  chatState.chatId = chatRow.id;
  $("chat-thread-scroll").innerHTML = "";
  showChatThreadState();
  await streamChatMessage(text, imagesB64);
  loadChatList();
}

async function sendFromChatComposer() {
  const ta = $("chat-composer-input");
  const text = ta.value.trim();
  if (!text || chatState.streaming) return;

  if (chatState.imageMode) {
    await generateChatImage();
    toggleChatImageMode(false);
    return;
  }

  const imgFiles = [...chatState.imageFiles];
  const imagesB64 = imgFiles.length > 0 ? await getImagesBase64(imgFiles) : [];

  ta.value = "";
  ta.style.height = "auto";
  clearChatMediaState();

  if (!chatState.chatId) {
    const chatRow = await createChatConversation(text);
    chatState.chatId = chatRow.id;
    showChatThreadState();
  }
  await streamChatMessage(text, imagesB64);
  loadChatList();
}

// Generación de imágenes: funcionalidad directa (botón dedicado), no una tool
// que el LLM decide invocar — el usuario controla explícitamente cuándo se genera.
async function generateChatImage() {
  const inEmptyState = !$("chat-empty").classList.contains("hidden");
  const ta = inEmptyState ? $("chat-start-input") : $("chat-composer-input");
  const prompt = ta.value.trim();
  if (!prompt || chatState.streaming) return;
  ta.value = "";
  if (!inEmptyState) ta.style.height = "auto";

  if (!chatState.chatId) {
    const chatRow = await createChatConversation(prompt);
    chatState.chatId = chatRow.id;
    $("chat-thread-scroll").innerHTML = "";
  }
  showChatThreadState();

  chatState.streaming = true;
  setChatSendingUI(true);
  addUserBubble(`Imagen: ${prompt}`, "chat-thread-scroll");
  const bodyEl = addImageLoadingBubble("chat-thread-scroll");

  try {
    const res = await fetch(`${API}/chats/${chatState.chatId}/image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Error generando la imagen");
    resolveImageBubble(bodyEl, data.image_url, null);
  } catch (e) {
    resolveImageBubble(bodyEl, null, friendlyError(e.message, "generar imagen"));
  } finally {
    chatState.streaming = false;
    setChatSendingUI(false);
    loadChatList();
    scrollChat("chat-thread-scroll");
  }
}

function setChatSendingUI(on) {
  const s1 = $("chat-send-btn");
  const s2 = $("chat-start-send");
  const i1 = $("chat-image-btn");
  const i2 = $("chat-start-image-btn");
  if (s1) s1.disabled = on;
  if (s2) s2.disabled = on;
  if (i1) i1.disabled = on;
  if (i2) i2.disabled = on;
}

function addImageLoadingBubble(targetId) {
  const wrap = document.createElement("div");
  wrap.className = "flex flex-col gap-1 mb-6 px-4 md:px-6 slide-up";
  wrap.innerHTML = `<div class="flex items-center gap-2 mb-1">
      <span class="px-2 py-0.5 rounded-full border border-zinc-200 bg-zinc-100 text-[10px] font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-1">
        <i data-lucide="image" class="w-3 h-3"></i> Kinetix
      </span>
    </div>
    <div class="image-result-body flex items-center gap-2 text-sm text-zinc-400">
      <i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Generando imagen…
    </div>`;
  $(targetId).appendChild(wrap);
  icons();
  scrollChat(targetId);
  return wrap.querySelector(".image-result-body");
}

function resolveImageBubble(bodyEl, imageUrl, errorMsg) {
  if (!bodyEl) return;
  if (imageUrl) {
    bodyEl.className = "";
    bodyEl.innerHTML = `<img src="${imageUrl}" alt="Imagen generada" class="chat-generated-image" />`;
  } else {
    bodyEl.className = "text-sm text-red-500";
    bodyEl.textContent = "⚠ " + (errorMsg || "No se pudo generar la imagen.");
  }
  scrollChat("chat-thread-scroll");
}

async function streamChatMessage(text, imagesB64) {
  if (chatState.streaming) return;
  chatState.streaming = true;
  $("chat-send-btn").disabled = true;
  const attachCount = imagesB64 && imagesB64.length > 0 ? imagesB64.length : 0;
  addUserBubble(text + (attachCount > 0 ? `  📎 [${attachCount} imagen(es) adjunta(s)]` : ""), "chat-thread-scroll");
  startAssistantTurn("chat-thread-scroll", "Kinetix");

  try {
    const res = await fetch(`${API}/chats/${chatState.chatId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        model: state.model,
        images_base64: attachCount > 0 ? imagesB64 : null,
      }),
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop();
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        const ev = JSON.parse(line.slice(5).trim());
        handleChatEvent(ev);
      }
    }
  } catch (e) {
    appendText("\n⚠️ " + friendlyError(e.message, "conexión chat"));
  } finally {
    finalizeCurrentText();
    chatState.streaming = false;
    $("chat-send-btn").disabled = false;
    scrollChat("chat-thread-scroll");
  }
}

function handleChatEvent(ev) {
  switch (ev.type) {
    case "text_delta":
      appendText(ev.content);
      break;
    case "message_done":
      finalizeCurrentText();
      break;
    case "error":
      appendText("\n⚠️ " + friendlyError(ev.message, "chat"));
      break;
  }
}

function setupChatComposer() {
  const ta = $("chat-composer-input");
  if (ta) {
    const auto = () => {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
    };
    ta.addEventListener("input", auto);
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendFromChatComposer();
      }
    });
  }
  const startTa = $("chat-start-input");
  if (startTa) {
    startTa.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitChatPrompt();
      }
    });
  }
}

function enterWorkspace() {
  $("landing-view").classList.add("hidden");
  $("workspace-view").classList.remove("hidden");
  $("workspace-view").classList.add("flex");
}

async function startFromLanding() {
  const prompt = $("landing-prompt").value.trim();
  if (!prompt) return;
  const btn = $("landing-build");
  btn.disabled = true;

  const res = await fetch(`${API}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: prompt.slice(0, 50), model: state.model }),
  });
  const proj = await res.json();
  state.projectId = proj.id;
  btn.disabled = false;

  $("chat-scroll").innerHTML = "";
  enterWorkspace();
  setPreviewSrc();

  const imgFiles = [...state.imageFiles];
  const vidFile = state.videoFile;
  let imagePaths = [];
  let imagesB64 = [];
  let videoPath = null;

  if (imgFiles.length > 0) {
    imagePaths = await uploadImages(proj.id, imgFiles);
    imagesB64 = await getImagesBase64(imgFiles);
  }

  if (vidFile) {
    videoPath = await uploadVideo(proj.id, vidFile);
    if (imagesB64.length === 0) {
      const frame = await extractVideoFrame(vidFile);
      if (frame) imagesB64 = [frame];
    }
  }

  clearMediaState();
  renderMediaPreviews("media-previews");
  await streamMessage(buildMessageText(prompt, imagePaths, videoPath), imagesB64);
}

async function openProject(pid) {
  const res = await fetch(`${API}/projects/${pid}`);
  const data = await res.json();
  state.projectId = pid;
  applyModelToUI(data.project.model || state.model);
  $("chat-scroll").innerHTML = "";
  enterWorkspace();
  data.messages.forEach((m) => {
    if (m.role === "user") addUserBubble(m.content);
    else addStaticAssistant(m.content);
  });
  setPreviewSrc();
  refreshPreview();
  loadFiles();
  scrollChat();
}

async function deleteProject(pid) {
  if (!confirm("¿Eliminar este proyecto? Esta acción no se puede deshacer.")) return;
  await fetch(`${API}/projects/${pid}`, { method: "DELETE" });
  loadRecent();
}

// ----------------------------- Chat rendering -----------------------------
function addUserBubble(text, targetId = "chat-scroll") {
  const wrap = document.createElement("div");
  wrap.className = "flex flex-col gap-1 mb-6 px-4 md:px-6 items-end slide-up";
  wrap.innerHTML = `<div class="self-end max-w-[85%] bg-zinc-900 text-white border border-zinc-800 rounded-2xl rounded-tr-sm px-4 py-3 text-base whitespace-pre-wrap">${escapeHtml(text)}</div>`;
  $(targetId).appendChild(wrap);
  scrollChat(targetId);
}

function startAssistantTurn(targetId = "chat-scroll", label = "Kinetix") {
  const wrap = document.createElement("div");
  wrap.className = "flex flex-col gap-1 mb-6 px-4 md:px-6 slide-up";
  wrap.innerHTML = `<div class="flex items-center gap-2 mb-1">
      <span class="px-2 py-0.5 rounded-full border border-zinc-200 bg-zinc-100 text-[10px] font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-1">
        <i data-lucide="sparkles" class="w-3 h-3"></i> ${escapeHtml(label)}
      </span>
    </div>
    <div class="turn-body flex flex-col gap-2 w-full text-base"></div>`;
  $(targetId).appendChild(wrap);
  state.turnEl = wrap.querySelector(".turn-body");
  state.currentTextEl = null;
  icons();
  scrollChat(targetId);
}

// Procesa el bloque de texto plano acumulado para convertirlo en Markdown enriquecido
function finalizeCurrentText() {
  if (state.currentTextEl) {
    state.currentTextEl.classList.remove("cursor-blink");
    const rawText = state.currentTextEl.textContent;
    state.currentTextEl.classList.remove("whitespace-pre-wrap");
    state.currentTextEl.classList.add("markdown-content");
    if (window.marked) {
      state.currentTextEl.innerHTML = marked.parse(rawText);
    }
    state.currentTextEl = null;
  }
}

function appendText(content) {
  if (!state.currentTextEl) {
    const p = document.createElement("div");
    p.className = "text-zinc-700 leading-relaxed whitespace-pre-wrap cursor-blink";
    state.turnEl.appendChild(p);
    state.currentTextEl = p;
  }
  state.currentTextEl.textContent += content;
  scrollChat();
}

function addPhaseBadge(_agent, label, message) {
  finalizeCurrentText();
  const el = document.createElement("div");
  el.className = "flex items-center gap-2 mt-1 fade-in";
  el.innerHTML = `<span class="px-2 py-0.5 rounded-full bg-zinc-100 border border-zinc-200 text-[10px] font-mono uppercase tracking-widest text-zinc-600">${escapeHtml(label)}</span>
    <span class="text-xs text-zinc-400">${escapeHtml(message || "")}</span>`;
  state.turnEl.appendChild(el);
  setAgentStatus(label + (message ? " · " + message : ""));
  scrollChat();
}

function addToolCard(id, name) {
  finalizeCurrentText();
  state.pendingToolIds.add(id);
  const meta = TOOL_META[name] || { icon: "wrench", label: name };
  const card = document.createElement("div");
  card.className = "tool-card border border-zinc-200 bg-zinc-50 rounded-lg overflow-hidden font-mono fade-in";
  card.innerHTML = `<div class="flex items-center justify-between px-3 py-2 border-b border-zinc-200 bg-zinc-100 text-xs text-zinc-600">
      <span class="flex items-center gap-2"><i data-lucide="${meta.icon}" class="w-3.5 h-3.5"></i> ${meta.label} <span class="tool-path text-zinc-400"></span></span>
      <span class="tool-status"><i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i></span>
    </div>
    <div class="tool-body hidden p-3 text-xs text-zinc-600 bg-white"></div>`;
  state.turnEl.appendChild(card);
  state.toolCards[id] = card;
  icons();
  scrollChat();
}

function resolvePendingTools() {
  state.pendingToolIds.forEach((id) => {
    const card = state.toolCards[id];
    if (card) {
      const status = card.querySelector(".tool-status");
      if (status) {
        status.innerHTML = `<i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-amber-500"></i>`;
        icons();
      }
    }
  });
  state.pendingToolIds.clear();
}

function updateToolCard(id, name, path, ok, result) {
  state.pendingToolIds.delete(id);
  const card = state.toolCards[id];
  if (!card) return;
  if (path) card.querySelector(".tool-path").textContent = path;
  const status = card.querySelector(".tool-status");
  status.innerHTML = ok
    ? `<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600"></i>`
    : `<i data-lucide="x" class="w-3.5 h-3.5 text-red-500"></i>`;
  const body = card.querySelector(".tool-body");
  let detail = "";
  if (name === "run_tests") {
    const issues = (result && result.issues) || [];
    detail = issues.length
      ? "Problemas detectados:\n• " + issues.map(escapeHtml).join("\n• ")
      : `✓ ${result.files_checked} archivo(s) verificados sin errores.`;
  } else if (!ok && result && result.error) {
    detail = "Error: " + escapeHtml(result.error);
  } else if (name === "list_files" && result && result.files) {
    detail = result.files.join("\n");
  }
  if (detail) {
    body.textContent = detail;
    body.classList.remove("hidden");
  }
  icons();
  scrollChat();
}

function addStaticAssistant(text, targetId = "chat-scroll") {
  const wrap = document.createElement("div");
  wrap.className = "flex flex-col gap-1 mb-6 px-4 md:px-6";
  const contentHtml = window.marked ? marked.parse(text) : escapeHtml(text);
  const contentClass = window.marked ? "markdown-content" : "whitespace-pre-wrap";
  wrap.innerHTML = `<div class="flex items-center gap-2 mb-1">
      <span class="px-2 py-0.5 rounded-full border border-zinc-200 bg-zinc-100 text-[10px] font-mono uppercase tracking-widest text-zinc-500">Kinetix</span>
    </div>
    <div class="text-zinc-700 leading-relaxed text-base ${contentClass}">${contentHtml}</div>`;
  $(targetId).appendChild(wrap);
}

// ----------------------------- Streaming -----------------------------
async function streamMessage(text, imagesB64) {
  if (state.streaming) return;
  state.streaming = true;
  setSending(true);
  const attachCount = imagesB64 && imagesB64.length > 0 ? imagesB64.length : 0;
  addUserBubble(text + (attachCount > 0 ? `  📎 [${attachCount} archivo(s) adjunto(s)]` : ""));
  startAssistantTurn();
  showAgentStatus(true);

  try {
    const res = await fetch(`${API}/projects/${state.projectId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        model: state.model,
        images_base64: attachCount > 0 ? imagesB64 : null,
      }),
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop();
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        const ev = JSON.parse(line.slice(5).trim());
        handleEvent(ev);
      }
    }
  } catch (e) {
    appendText("\n⚠️ " + friendlyError(e.message, "conexión build"));
  } finally {
    resolvePendingTools();
    finalizeCurrentText();
    state.streaming = false;
    setSending(false);
    showAgentStatus(false);
    loadFiles();
    refreshPreview();
  }
}

function handleEvent(ev) {
  switch (ev.type) {
    case "text_delta":
      appendText(ev.content);
      break;
    case "phase":
      addPhaseBadge(ev.agent, ev.label, ev.message);
      break;
    case "tool_start":
      if (ev.name === "set_phase") break;
      addToolCard(ev.id, ev.name);
      break;
    case "tool_result":
      updateToolCard(ev.id, ev.name, ev.path, ev.ok, ev.result);
      break;
    case "preview_update":
      refreshPreview();
      loadFiles();
      break;
    case "message_done":
      finalizeCurrentText();
      break;
    case "error":
      resolvePendingTools();
      appendText("\n⚠️ " + friendlyError(ev.message, "build"));
      break;
  }
}

// ----------------------------- Composer -----------------------------
function setupComposer() {
  const ta = $("composer-input");
  const auto = () => {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
  };
  ta.addEventListener("input", auto);
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendFromComposer();
    }
  });
  $("landing-prompt").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) startFromLanding();
  });
}

function buildMessageText(prompt, imagePaths, videoPath) {
  let prefix = "";

  if (imagePaths && imagePaths.length > 0) {
    const pathList = imagePaths.map((p) => `'${p}'`).join(", ");
    const tagList = imagePaths.map((p) => `<img src="${p}">`).join(" ");
    prefix += `[📸 ${imagePaths.length} imagen(es) subida(s) al workspace: ${pathList}. Para usarlas en HTML: ${tagList}. Imágenes adjuntas como referencia visual.]\n\n`;
  }

  if (videoPath) {
    prefix += `[📹 Video subido al workspace: '${videoPath}'. Para usarlo en HTML: <video src="${videoPath}" autoplay muted loop playsinline></video>. Frame del video adjunto como referencia visual.]\n\n`;
  }

  return prefix + prompt;
}

async function sendFromComposer() {
  const ta = $("composer-input");
  const text = ta.value.trim();
  if (!text || state.streaming) return;

  const imgFiles = [...state.imageFiles];
  const vidFile = state.videoFile;
  let imagePaths = [];
  let imagesB64 = [];
  let videoPath = null;

  if (imgFiles.length > 0 && state.projectId) {
    imagePaths = await uploadImages(state.projectId, imgFiles);
    imagesB64 = await getImagesBase64(imgFiles);
  }

  if (vidFile && state.projectId) {
    videoPath = await uploadVideo(state.projectId, vidFile);
    if (imagesB64.length === 0) {
      const frame = await extractVideoFrame(vidFile);
      if (frame) imagesB64 = [frame];
    }
  }

  ta.value = "";
  ta.style.height = "auto";
  clearMediaState();
  renderMediaPreviews("media-previews");
  streamMessage(buildMessageText(text, imagePaths, videoPath), imagesB64);
}

function setSending(on) {
  $("send-btn").disabled = on;
}

function showAgentStatus(on) {
  const el = $("agent-status");
  el.classList.toggle("hidden", !on);
  el.classList.toggle("flex", on);
}

function setAgentStatus(text) {
  $("agent-status-text").textContent = text;
}

// ----------------------------- Media upload -----------------------------
// Posiciona un menú flotante (position:fixed) pegado a su botón, abriendo
// hacia abajo o arriba según cuál lado tenga más espacio disponible.
function positionFloatingMenu(btn, menu, minWidth) {
  const rect = btn.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - 6;
  const spaceAbove = rect.top - 6;
  if (spaceBelow >= spaceAbove) {
    menu.style.top = (rect.bottom + 6) + "px";
    menu.style.bottom = "auto";
    menu.style.maxHeight = Math.max(spaceBelow, 80) + "px";
  } else {
    menu.style.bottom = (window.innerHeight - rect.top + 6) + "px";
    menu.style.top = "auto";
    menu.style.maxHeight = Math.max(spaceAbove, 80) + "px";
  }
  menu.style.overflowY = "auto";
  menu.style.left = rect.left + "px";
  menu.style.minWidth = minWidth;
}

// Helper compartido por los dropdowns simples (adjuntar media, herramientas
// del chat): saca el menú al <body>, lo posiciona junto a su botón, y usa el
// cierre unificado de closeAllFloatingMenus() para no dejar otros abiertos.
function setupFloatingDropdown(btnId, menuId, menuClass, minWidth) {
  const btn = $(btnId);
  const menu = $(menuId);
  if (!btn || !menu) return;

  document.body.appendChild(menu);
  menu.style.cssText += "position:fixed;z-index:99999;";
  menu.classList.add(menuClass);

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isHidden = menu.classList.contains("hidden");
    closeAllFloatingMenus();
    if (isHidden) {
      positionFloatingMenu(btn, menu, minWidth);
      menu.classList.remove("hidden");
    }
  });
}

function setupMediaDropdowns() {
  ["landing-media-dropdown", "media-dropdown"].forEach((dropdownId) =>
    setupFloatingDropdown(dropdownId.replace("-dropdown", "-btn"), dropdownId.replace("-dropdown", "-menu"), "media-floating-menu", "140px")
  );
}

function setupChatToolsDropdowns() {
  ["chat-start-tools-dropdown", "chat-tools-dropdown"].forEach((dropdownId) =>
    setupFloatingDropdown(dropdownId.replace("-dropdown", "-btn"), dropdownId.replace("-dropdown", "-menu"), "chat-floating-menu", "160px")
  );
}

function toggleChatImageMode(active) {
  chatState.imageMode = active;

  const startBadges = $("chat-start-badges");
  const threadBadges = $("chat-badges");

  const badgeHtml = active ? `
    <span class="inline-flex items-center gap-1.5 bg-sage-50 text-sage-800 border border-sage-200 text-xs font-semibold px-2.5 py-1 rounded-full fade-in select-none">
      <i data-lucide="image" class="w-3.5 h-3.5"></i>
      <span>Crear imagen</span>
      <button type="button" onclick="Cosmo.toggleChatImageMode(false)" class="text-sage-500 hover:text-sage-800 transition-colors ml-1 cursor-pointer">
        <i data-lucide="x" class="w-3 h-3"></i>
      </button>
    </span>
  ` : "";

  if (startBadges) {
    startBadges.innerHTML = badgeHtml;
    startBadges.classList.toggle("hidden", !active);
    startBadges.classList.toggle("flex", active);
  }
  if (threadBadges) {
    threadBadges.innerHTML = badgeHtml;
    threadBadges.classList.toggle("hidden", !active);
    threadBadges.classList.toggle("flex", active);
  }

  // Modificar placeholders para mejor feedback visual
  const startInput = $("chat-start-input");
  const composerInput = $("chat-composer-input");

  if (startInput) {
    startInput.placeholder = active ? "Describe la imagen que quieres crear..." : "Escribe un mensaje...";
  }
  if (composerInput) {
    composerInput.placeholder = active ? "Describe la imagen que quieres crear..." : "Escribe un mensaje...";
  }

  icons();
}

function setupMediaUpload() {
  const addImages = (files, containerId) => {
    const remaining = MAX_IMAGES - state.imageFiles.length;
    if (remaining <= 0) return;
    const toAdd = Array.from(files).slice(0, remaining);
    state.imageFiles.push(...toAdd);
    state.videoFile = null;
    renderMediaPreviews(containerId);
  };

  $("image-input").addEventListener("change", (e) => {
    addImages(e.target.files, "media-previews");
    e.target.value = "";
  });

  $("landing-image-input").addEventListener("change", (e) => {
    addImages(e.target.files, "landing-media-row");
    e.target.value = "";
  });

  $("video-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    state.videoFile = file;
    state.imageFiles = [];
    renderMediaPreviews("media-previews");
    e.target.value = "";
  });

  $("landing-video-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    state.videoFile = file;
    state.imageFiles = [];
    renderMediaPreviews("landing-media-row");
    e.target.value = "";
  });

  const setupPaste = (textareaId, containerId) => {
    const ta = $(textareaId);
    if (!ta) return;
    ta.addEventListener("paste", (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      const images = [];
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) images.push(file);
        }
      }
      if (images.length) {
        e.preventDefault();
        addImages(images, containerId);
      }
    });
  };

  setupPaste("landing-prompt", "landing-media-row");
  setupPaste("composer-input", "media-previews");

  // ---- Modo Chat: adjuntar/pegar imágenes de referencia (sin video, sin
  // subida a workspace — el chat no tiene proyecto/archivos, la imagen viaja
  // directo en base64 al LLM, igual que en Construir). ----
  const addChatImages = (files) => {
    const remaining = MAX_IMAGES - chatState.imageFiles.length;
    if (remaining <= 0) return;
    chatState.imageFiles.push(...Array.from(files).slice(0, remaining));
    renderChatMediaPreviews("chat-start-media");
    renderChatMediaPreviews("chat-composer-media");
  };

  $("chat-start-image-input").addEventListener("change", (e) => {
    addChatImages(e.target.files);
    e.target.value = "";
  });
  $("chat-image-input").addEventListener("change", (e) => {
    addChatImages(e.target.files);
    e.target.value = "";
  });

  const setupChatPaste = (textareaId) => {
    const ta = $(textareaId);
    if (!ta) return;
    ta.addEventListener("paste", (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      const images = [];
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) images.push(file);
        }
      }
      if (images.length) {
        e.preventDefault();
        addChatImages(images);
      }
    });
  };

  setupChatPaste("chat-start-input");
  setupChatPaste("chat-composer-input");
}

function renderChatMediaPreviews(containerId) {
  const container = $(containerId);
  if (!container) return;

  const hasMedia = chatState.imageFiles.length > 0;
  container.innerHTML = "";
  container.classList.toggle("hidden", !hasMedia);
  if (!hasMedia) return;

  chatState.imageFiles.forEach((file, idx) => {
    const url = URL.createObjectURL(file);
    const wrap = document.createElement("div");
    wrap.className = "relative inline-block";
    wrap.innerHTML = `<img src="${url}" class="h-16 w-16 rounded-lg border border-zinc-200 object-cover" />
      <button onclick="Cosmo.removeChatImage(${idx})"
        class="absolute -top-1.5 -right-1.5 bg-zinc-800 rounded-full p-0.5 border border-white/20 hover:bg-zinc-700 transition-colors">
        <i data-lucide="x" class="w-3 h-3 text-white"></i>
      </button>`;
    container.appendChild(wrap);
  });

  if (chatState.imageFiles.length > 0) {
    const badge = document.createElement("div");
    badge.className = "inline-flex items-center self-center text-[10px] font-mono text-zinc-500 px-1";
    badge.textContent = `${chatState.imageFiles.length}/${MAX_IMAGES}`;
    container.appendChild(badge);
  }

  icons();
}

function removeChatImage(idx) {
  URL.revokeObjectURL(chatState.imageFiles[idx]);
  chatState.imageFiles.splice(idx, 1);
  renderChatMediaPreviews("chat-start-media");
  renderChatMediaPreviews("chat-composer-media");
}

function clearChatMediaState() {
  chatState.imageFiles = [];
  renderChatMediaPreviews("chat-start-media");
  renderChatMediaPreviews("chat-composer-media");
}

function renderMediaPreviews(containerId) {
  const container = $(containerId);
  if (!container) return;

  const hasMedia = state.imageFiles.length > 0 || state.videoFile;
  container.innerHTML = "";
  container.classList.toggle("hidden", !hasMedia);
  if (!hasMedia) return;

  // Imágenes
  state.imageFiles.forEach((file, idx) => {
    const url = URL.createObjectURL(file);
    const wrap = document.createElement("div");
    wrap.className = "relative inline-block";
    wrap.innerHTML = `<img src="${url}" class="h-16 w-16 rounded-lg border border-white/10 object-cover" />
      <button onclick="Cosmo.removeImage(${idx}, '${containerId}')"
        class="absolute -top-1.5 -right-1.5 bg-zinc-800 rounded-full p-0.5 border border-white/20 hover:bg-zinc-700 transition-colors">
        <i data-lucide="x" class="w-3 h-3"></i>
      </button>`;
    container.appendChild(wrap);
  });

  // Badge contador si hay varias
  if (state.imageFiles.length > 0) {
    const badge = document.createElement("div");
    badge.className = "inline-flex items-center self-center text-[10px] font-mono text-zinc-500 px-1";
    badge.textContent = `${state.imageFiles.length}/${MAX_IMAGES}`;
    container.appendChild(badge);
  }

  // Video
  if (state.videoFile) {
    const wrap = document.createElement("div");
    wrap.className = "relative inline-flex items-center gap-2 bg-zinc-800 border border-white/10 rounded-lg px-3 py-2";
    wrap.innerHTML = `<i data-lucide="video" class="w-4 h-4 text-zinc-400 shrink-0"></i>
      <span class="text-xs text-zinc-300 font-mono max-w-[160px] truncate">${escapeHtml(state.videoFile.name)}</span>
      <button onclick="Cosmo.removeVideo('${containerId}')" class="ml-1 text-zinc-500 hover:text-zinc-200 transition-colors">
        <i data-lucide="x" class="w-3 h-3"></i>
      </button>`;
    container.appendChild(wrap);
  }

  icons();
}

function removeImage(idx, containerId) {
  URL.revokeObjectURL(state.imageFiles[idx]);
  state.imageFiles.splice(idx, 1);
  renderMediaPreviews(containerId);
}

function removeVideo(containerId) {
  state.videoFile = null;
  renderMediaPreviews(containerId);
}

function clearMediaState() {
  state.imageFiles = [];
  state.videoFile = null;
}

// ----------------------------- Media helpers -----------------------------
async function uploadImages(pid, files) {
  const paths = [];
  for (const file of files) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API}/projects/${pid}/upload`, { method: "POST", body: form });
    const data = await res.json();
    paths.push(data.path);
  }
  return paths;
}

async function uploadVideo(pid, file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/projects/${pid}/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error("Error al subir el video");
  const data = await res.json();
  return data.path;
}

async function getImagesBase64(files) {
  const results = await Promise.all(
    files.map(
      (file) =>
        new Promise((resolve) => {
          const img = new Image();
          const url = URL.createObjectURL(file);
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            canvas.getContext("2d").drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL("image/jpeg", 0.92).split(",")[1]);
          };
          img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
          img.src = url;
        })
    )
  );
  return results.filter(Boolean);
}

function extractVideoFrame(file) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.src = url;
    video.crossOrigin = "anonymous";
    video.addEventListener("loadeddata", () => { video.currentTime = 0.5; });
    video.addEventListener("seeked", () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]);
    });
    video.addEventListener("error", () => { URL.revokeObjectURL(url); resolve(null); });
  });
}

// ----------------------------- Preview & files -----------------------------
function setPreviewSrc() {
  const url = `${API}/preview/${state.projectId}/index.html`;
  $("preview-iframe").src = url;
  $("open-new").href = url;
}

function refreshPreview() {
  if (!state.projectId) return;
  const url = `${API}/preview/${state.projectId}/index.html?t=${Date.now()}`;
  $("preview-iframe").src = url;
  $("open-new").href = `${API}/preview/${state.projectId}/index.html`;
}

function setDevice(d) {
  state.device = d;
  const c = $("iframe-container");
  if (d === "mobile") c.classList.add("frame-mobile");
  else c.classList.remove("frame-mobile");
  document.querySelectorAll(".device-btn").forEach((b) => {
    const active = b.dataset.device === d;
    b.classList.toggle("bg-white", active);
    b.classList.toggle("shadow-sm", active);
    b.classList.toggle("text-zinc-900", active);
    b.classList.toggle("text-zinc-400", !active);
  });
}

function showTab(tab) {
  const preview = tab === "preview";
  $("preview-pane").classList.toggle("hidden", !preview);
  $("preview-pane").classList.toggle("flex", preview);
  $("code-pane").classList.toggle("hidden", preview);
  $("code-pane").classList.toggle("flex", !preview);
  $("tab-preview").className = `text-xs font-medium px-2.5 py-1 rounded ${preview ? "text-white" : "text-zinc-500 hover:text-white"} transition-colors`;
  $("tab-code").className = `text-xs font-medium px-2.5 py-1 rounded ${!preview ? "text-white" : "text-zinc-500 hover:text-white"} transition-colors`;
  if (!preview) loadFiles();
}

async function loadFiles() {
  if (!state.projectId) return;
  const res = await fetch(`${API}/projects/${state.projectId}/files`);
  const data = await res.json();
  const el = $("file-list");
  if (!data.files.length) {
    el.innerHTML = `<div class="px-3 py-2 text-xs text-zinc-600">Sin archivos aún</div>`;
    return;
  }
  el.innerHTML = data.files
    .map(
      (f) => `<div class="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-100 cursor-pointer text-zinc-500 hover:text-zinc-800 transition-colors" onclick="Cosmo.viewFile('${f}')">
        <i data-lucide="file" class="w-3.5 h-3.5"></i> ${escapeHtml(f)}
      </div>`
    )
    .join("");
  icons();
}

async function viewFile(path) {
  const res = await fetch(`${API}/projects/${state.projectId}/file?path=${encodeURIComponent(path)}`);
  const data = await res.json();
  $("code-view").textContent = data.content || "";
}

// ----------------------------- Utils -----------------------------
function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Traduce errores técnicos a un mensaje breve y amable para el usuario; el
// detalle crudo queda en la consola para depuración, nunca expuesto en la UI.
function friendlyError(rawMessage, context = "") {
  console.error(`Kinetix error${context ? " (" + context + ")" : ""}:`, rawMessage);
  return "No pude completar esa acción. Intenta de nuevo en un momento.";
}

function scrollChat(targetId = "chat-scroll") {
  const el = $(targetId);
  el.scrollTop = el.scrollHeight;
}

window.Cosmo = {
  goHome, startFromLanding, openProject, deleteProject, sendFromComposer,
  useTemplate, removeImage, removeVideo, refreshPreview, setDevice, showTab, viewFile,
  toggleChatMode, newChatView, openChat, deleteChat, submitChatPrompt, sendFromChatComposer,
  generateChatImage, toggleChatImageMode, showNewsPanel, loadNews, useChatSuggestion,
  toggleChatSidebar, removeChatImage,
};

init();
