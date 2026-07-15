/* T.H.E.M.I.S. — Estado global, constantes y datos compartidos. */

export const API = "/api";
export const MAX_IMAGES = 5;

export const state = {
  projectId: null,
  model: "claude-sonnet-4-6",
  device: "desktop",
  imageFiles: [],
  videoFile: null,
  streaming: false,
  toolCards: {},
  pendingToolIds: new Set(),
  currentTextEl: null,
  turnEl: null,
  sidebarMode: "home",
  activeFile: null,
  projectType: "app",
  projectZipFile: null,
  externalPath: null,
  serverUrl: null,
};

export const WORKFLOW_HINTS = {
  app: "Un único <code>index.html</code> autocontenido — ideal para MVPs y prototipos rápidos.",
  proyecto: "Backend FastAPI + frontend HTML/Tailwind/JS separados, en carpetas — para proyectos que van a crecer.",
};

export const chatState = {
  chatId: null,
  streaming: false,
  imageMode: false,
  imageFiles: [],
};

export const newsState = {
  region: "all",
  cache: {},
};

export const TEMPLATES = [
  { icon: "check-square", name: "Gestor de tareas", desc: "Listas, categorías y prioridades", prompt: "Una app de gestión de tareas con sensación premium: tipografía cuidada, espaciado generoso y una paleta neutra con un color de acento. Sidebar con categorías y contador de pendientes por categoría, listado principal con checkbox animado (tachado + fade al completar), badges de prioridad por color, fechas límite con aviso visual si están vencidas, y un modal elegante para crear/editar tareas con transición suave. Incluye drag & drop para reordenar, filtros (todas/pendientes/completadas), estado vacío ilustrado cuando no hay tareas, microinteracciones en hover/focus, y persistencia en localStorage." },
  { icon: "shopping-bag", name: "Tienda online", desc: "Catálogo, carrito y checkout", prompt: "Una tienda online con estética premium tipo e-commerce moderno: grid de productos con imágenes grandes, hover con zoom sutil y transición suave, badges de descuento/nuevo, filtros por categoría y precio, y buscador con resultados instantáneos. Carrito lateral deslizante (drawer) con animación de entrada, contador de unidades, subtotal en vivo y botón de checkout destacado. Flujo de checkout simulado en pasos (carrito → datos de envío → confirmación) con barra de progreso y una pantalla de éxito con animación. Cuida el spacing, la jerarquía tipográfica y los estados de carga/vacío." },
  { icon: "user-circle", name: "Portafolio personal", desc: "Proyectos, sobre mí y contacto", prompt: "Un portafolio personal con diseño editorial de alta gama: hero con animación de entrada (fade + slide) y tipografía grande, sección 'sobre mí' con foto y bio, grid de proyectos con tarjetas que hacen lift al hover mostrando overlay con descripción y tecnologías usadas, sección de habilidades con barras o chips animados, y formulario de contacto con validación en tiempo real y estado de envío (loading/success). Scroll suave entre secciones, animaciones reveal-on-scroll discretas, modo responsive impecable y una paleta minimalista (blanco/negro + un acento) con buen contraste." },
  { icon: "bar-chart-3", name: "Dashboard analítico", desc: "Métricas y gráficas en vivo", prompt: "Un dashboard analítico con look profesional tipo SaaS: sidebar de navegación, header con selector de rango de fechas, fila de tarjetas KPI con número grande, variación porcentual (verde/rojo) y mini-sparkline. Gráficas de líneas/barras interactivas con tooltip al hover, tabla de datos con ordenamiento por columna, búsqueda y paginación. Usa iconos profesionales de Iconify (ej: `https://api.iconify.design/mdi:chart-line.svg?height=24`) para cada métrica/sección en lugar de emojis. Skeleton loaders mientras 'cargan' los datos, transiciones suaves al cambiar de rango, y una paleta oscura o clara consistente con buen uso de espacio en blanco y jerarquía visual clara entre lo primario y lo secundario." },
  { icon: "newspaper", name: "Blog minimalista", desc: "Artículos, tags y búsqueda", prompt: "Un blog minimalista con tipografía editorial cuidada (buen line-height y ancho de línea legible): portada con artículo destacado grande y listado de artículos en grid/lista con imagen, título, extracto y tiempo de lectura estimado. Filtro por etiquetas con chips activos, buscador con resultados en vivo, y vista de artículo individual con tipografía de lectura cómoda, tabla de contenidos flotante opcional y navegación a artículo anterior/siguiente. Transiciones suaves entre vistas, modo claro elegante, y detalles como fecha, autor y tiempo de lectura bien jerarquizados." },
  { icon: "timer", name: "Temporizador Pomodoro", desc: "Foco, descansos y estadísticas", prompt: "Un temporizador Pomodoro con estética calmada y premium: círculo de progreso animado (SVG) que se vacía en tiempo real, transición de color entre modo foco/descanso corto/descanso largo, controles grandes (play/pausa/reiniciar) con feedback táctil visual, y configuración de duración de ciclos en un panel deslizante. Notificación visual y sonido sutil al terminar cada ciclo, contador de pomodoros completados en el día, y una vista de estadísticas simple (gráfica de sesiones por día) con transiciones suaves. Cuida la tipografía del número del timer, debe sentirse grande, legible y con presencia." },
  { icon: "utensils-crossed", name: "Recetario de cocina", desc: "Recetas, ingredientes y favoritos", prompt: "Una app de recetas con estética cálida y premium tipo revista de cocina: grid de recetas con imagen grande, tiempo de preparación (ícono de reloj de Iconify) y nivel de dificultad, buscador con filtro por ingredientes o categoría (desayuno/almuerzo/postre), y botón de favorito con animación de corazón al hacer clic. Vista de detalle de receta con lista de ingredientes con checkboxes (para ir marcando mientras cocinas), pasos numerados con buen espaciado de lectura e iconos profesionales de Iconify para cada paso. Sección de favoritos accesible desde el header. Cuida las fotos grandes, tipografía cálida, transiciones suaves al navegar y un estado vacío agradable en 'favoritos' cuando no hay ninguno guardado." },
  { icon: "rocket", name: "Landing page SaaS", desc: "Hero, precios y CTA", prompt: "Una landing page de producto SaaS con nivel de agencia premium: hero con headline fuerte, subcopy claro, CTA primario y secundario, y un mockup/ilustración con animación sutil de entrada. Sección de logos de clientes (usa Iconify: `https://api.iconify.design/simple-icons:[brand].svg`), features en grid con iconos profesionales de Iconify (Material Design, Tabler) en lugar de emojis, y microcopys concisos. Sección de precios con 3 planes (uno destacado como 'popular') y toggle mensual/anual animado, testimonios en carrusel o grid, y footer completo con CTA final. Anima la aparición de secciones al hacer scroll (fade+slide discreto), cuida mucho el spacing entre secciones, la jerarquía tipográfica y que todo se sienta cohesivo con una sola paleta de acento bien aplicada." },
];

export const FLOATING_MENU_CLASSES = ["model-floating-menu", "media-floating-menu", "chat-floating-menu"];

export const TOOL_META = {
  write_file: { icon: "file-plus", label: "Escribiendo archivo" },
  edit_file: { icon: "file-pen", label: "Editando archivo" },
  read_file: { icon: "file-search", label: "Leyendo archivo" },
  list_files: { icon: "folder", label: "Listando archivos" },
  create_directory: { icon: "folder-plus", label: "Creando carpeta" },
  delete_file: { icon: "trash-2", label: "Eliminando archivo" },
  run_tests: { icon: "shield-check", label: "QA · Ejecutando pruebas" },
  audit_security: { icon: "shield", label: "Auditando seguridad" },
  serve_and_test: { icon: "server", label: "QA · Probando servidor" },
  fetch_url: { icon: "globe", label: "Descargando página" },
  get_news: { icon: "newspaper", label: "Consultando noticias" },
  search_news: { icon: "search", label: "Buscando noticias relacionadas" },
  web_search: { icon: "globe-2", label: "Buscando en la web" },
  fetch_page: { icon: "file-text", label: "Leyendo página" },
  get_weather: { icon: "cloud-sun", label: "Consultando el clima" },
};

export let MODEL_LIST = [];

export function setModelList(list) {
  MODEL_LIST = list;
}

export function closeAllFloatingMenus() {
  FLOATING_MENU_CLASSES.forEach((cls) => {
    document.querySelectorAll(`.${cls}`).forEach((m) => m.classList.add("hidden"));
  });
}
