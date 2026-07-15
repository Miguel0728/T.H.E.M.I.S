/* T.H.E.M.I.S. — Dashboard, noticias, galería y navegación. */
import { API, state, newsState } from "./state.js";
import { $, escapeHtml, friendlyError, formatUptime, formatTokenCount, formatNewsDate, formatProjectDate } from "./utils.js";

const DASHBOARD_TIMEZONE = "America/Puerto_Rico";

const dashboardState = {
  clockInterval: null,
  weatherUnit: (() => { try { return localStorage.getItem("cosmo_weather_unit") || "c"; } catch (_) { return "c"; } })(),
};

function convertTemp(celsius, unit) {
  if (celsius == null) return "—";
  const c = Number(celsius);
  if (unit === "f") return Math.round(c * 9 / 5 + 32);
  return Math.round(c);
}

function tempUnitLabel(unit) {
  return unit === "f" ? "°F" : "°C";
}

function prNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: DASHBOARD_TIMEZONE }));
}

// ─── Navegación entre secciones ───

const NAV_BREADCRUMB = {
  dashboard: "T.H.E.M.I.S. / Dashboard",
  news: "T.H.E.M.I.S. / Noticias",
  gallery: "T.H.E.M.I.S. / Galería",
  chats: "T.H.E.M.I.S. / Asistente",
  webdesign: "T.H.E.M.I.S. / Construir",
};

export function highlightNavSection(section) {
  ["chats", "news", "webdesign", "gallery", "dashboard"].forEach((sec) => {
    const btn = $(`nav-${sec}-btn`);
    if (btn) {
      const active = section === sec;
      btn.classList.toggle("bg-zinc-200/60", active);
      btn.classList.toggle("text-zinc-900", active);
    }
  });
  const label = $("header-breadcrumb-label");
  if (label) label.textContent = NAV_BREADCRUMB[section] || "T.H.E.M.I.S.";
}

export function hideNewsPanel() {
  const panel = $("chat-news");
  panel.classList.add("hidden");
  panel.classList.remove("flex");
}

function hideAllPanels() {
  document.documentElement.classList.remove("theme-amber");
  stopDashboardClock();
  $("landing-view").classList.add("hidden");
  $("workspace-view").classList.add("hidden");
  $("workspace-view").classList.remove("flex");
  $("chat-news").classList.add("hidden");
  $("chat-news").classList.remove("flex");
  $("chat-gallery").classList.add("hidden");
  $("chat-gallery").classList.remove("flex");
  $("chat-dashboard").classList.add("hidden");
  $("chat-dashboard").classList.remove("flex");
}

// ─── Dashboard ───

export function showDashboardPanel() {
  hideAllPanels();
  const panel = $("chat-dashboard");
  panel.classList.remove("hidden");
  panel.classList.add("flex");
  triggerTechLoading("chat-dashboard");

  if (window._highlightActiveChatInList) window._highlightActiveChatInList(null);
  highlightNavSection("dashboard");
  if (window._applySidebarMode) window._applySidebarMode("home");
  if (window._toggleChatSidebar) window._toggleChatSidebar(false);
  loadDashboard();
}

export function stopDashboardClock() {
  if (dashboardState.clockInterval) { clearInterval(dashboardState.clockInterval); dashboardState.clockInterval = null; }
}

function startDashboardClock() {
  stopDashboardClock();
  tickDashboardClock();
  dashboardState.clockInterval = setInterval(tickDashboardClock, 1000);
}

function tickDashboardClock() {
  const el = $("dash-clock");
  if (!el) { stopDashboardClock(); return; }
  el.textContent = prNow().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function dashboardGreeting() {
  const h = prNow().getHours();
  if (h < 6) return "Todo tranquilo por aquí, comandante";
  if (h < 12) return "Buenos días, comandante";
  if (h < 19) return "Buenas tardes, comandante";
  return "Buenas noches, comandante";
}

const DASH_QUOTES = [
  "El código bien escrito documenta su propia intención.",
  "Un sistema en línea no es un sistema terminado — es uno que sigue escuchando.",
  "La mejor automatización es la que nadie nota que está ahí.",
  "Cada proyecto pequeño de hoy es la base de uno grande mañana.",
  "La claridad en el prompt es la mitad del trabajo del agente.",
  "Los datos en vivo valen más que las suposiciones de ayer.",
];

function dashQuoteOfDay() {
  const dayOfYear = Math.floor((prNow() - new Date(prNow().getFullYear(), 0, 0)) / 86400000);
  return DASH_QUOTES[dayOfYear % DASH_QUOTES.length];
}

const DOT_COLOR = { cyan: "#69e2ff", emerald: "#59f0b1", amber: "#ffb347", rose: "#ff6b8a" };
const TAG_STYLE = {
  cyan: "background: rgba(105,226,255,.12); color: #69e2ff;",
  emerald: "background: rgba(89,240,177,.12); color: #59f0b1;",
  amber: "background: rgba(255,179,71,.14); color: #ffb347;",
  rose: "background: rgba(255,107,138,.14); color: #ff6b8a;",
};

function dashActivityRow({ icon, title, subtitle, date, onClick, accent = "cyan" }) {
  const dotColor = DOT_COLOR[accent] || DOT_COLOR.cyan;
  return `<button type="button" onclick="${onClick}" class="lite-row-btn w-full flex items-center gap-2.5 py-2 text-left bg-transparent border-0 cursor-pointer rounded-md px-1.5 -mx-1.5">
    <span class="lite-dot" style="background:${dotColor}; color:${dotColor}"></span>
    <div class="flex flex-col leading-tight flex-1 min-w-0">
      <span class="text-[12.5px] text-zinc-200 truncate">${escapeHtml(title)}</span>
      <span class="text-[10px] text-zinc-500">${escapeHtml(subtitle)}</span>
    </div>
    <span class="text-[9.5px] font-mono text-zinc-600 shrink-0">${escapeHtml(date)}</span>
  </button>`;
}

function dashHighlightItem({ icon, title, subtitle, accent = "cyan" }) {
  const dotColor = DOT_COLOR[accent] || DOT_COLOR.cyan;
  return `<div class="flex items-start gap-2.5 min-w-0">
    <span class="lite-dot w-2 h-2 rounded-[3px] mt-1 shrink-0" style="background:${dotColor}; color:${dotColor}"></span>
    <div class="flex flex-col leading-tight min-w-0 gap-1">
      <span class="text-[12.5px] font-semibold text-zinc-200 truncate">${escapeHtml(title)}</span>
      <span class="lite-tag inline-block w-fit" style="${TAG_STYLE[accent] || TAG_STYLE.cyan}">${escapeHtml(subtitle)}</span>
    </div>
  </div>`;
}

function dashStat({ icon, label, value, sub, accent = "cyan" }) {
  const color = accent === "emerald" ? "emerald" : accent === "amber" ? "amber" : "cyan";
  return `<div class="kpi-holo kpi-holo-${color} group">
    <div class="kpi-holo-icon">
      <i data-lucide="${icon}" class="kpi-holo-value-${color}"></i>
    </div>
    <div class="flex flex-col leading-tight min-w-0">
      <span class="kpi-holo-value kpi-holo-value-${color}">${value}</span>
      <span class="kpi-holo-label kpi-holo-label-${color}">${escapeHtml(label)}</span>
    </div>
    <div class="kpi-holo-scan kpi-holo-scan-${color}"></div>
  </div>`;
}

function dashWeatherDetail({ icon, label, value }) {
  return `<div class="flex items-center justify-between gap-3 py-1.5 border-b border-zinc-800/30 last:border-0">
    <span class="flex items-center gap-2 text-[11px] text-zinc-500"><i data-lucide="${icon}" class="w-3 h-3 text-cyan-400/60"></i> ${escapeHtml(label)}</span>
    <span class="text-[11px] font-mono text-zinc-300">${value}</span>
  </div>`;
}

// Traduce la descripción textual de Open-Meteo (ej. "lluvia ligera") al icono
// de Lucide más representativo, para que cada día del pronóstico muestre su
// condición real en vez de un genérico "cloud-sun".
function weatherIconFor(condition) {
  const c = (condition || "").toLowerCase();
  if (c.includes("tormenta")) return "cloud-lightning";
  if (c.includes("nieve")) return "cloud-snow";
  if (c.includes("chubasco") || c.includes("lluvia")) return "cloud-rain";
  if (c.includes("llovizna")) return "cloud-drizzle";
  if (c.includes("neblina")) return "cloud-fog";
  if (c.includes("nublado")) return "cloud";
  if (c.includes("parcialmente")) return "cloud-sun";
  if (c.includes("despejado")) return "sun";
  return "cloud-sun";
}

function dashForecastRow({ dayLabel, icon, max_c, min_c, unit }) {
  // max_c / min_c son valores crudos en Celsius; unit es "c" o "f"
  const maxVal = convertTemp(max_c, unit);
  const minVal = convertTemp(min_c, unit);
  return `<div class="flex items-center justify-between gap-2 py-1.5 border-b border-zinc-800/20 last:border-0">
    <span class="text-[11px] text-zinc-400 w-9 shrink-0">${escapeHtml(dayLabel)}</span>
    <i data-lucide="${icon}" class="w-3.5 h-3.5 text-cyan-400/70 shrink-0"></i>
    <span class="text-[11px] font-mono text-zinc-300 ml-auto"><span data-temp-c="${max_c}" class="w-fc-max">${maxVal}°</span> <span class="text-zinc-600">/ <span data-temp-c="${min_c}" class="w-fc-min">${minVal}°</span></span></span>
  </div>`;
}

function dashTokenProgressBar({ name, used, budget, pct, provider }) {
  const providerIconMap = { anthropic: "/api/static/img/ClaudeSpark.png", openai: "/api/static/img/ChatGPT.png", deepseek: "/api/static/img/DeepSeek.png" };
  const providerBalanceUrl = {
    anthropic: "https://console.anthropic.com/settings/cost",
    openai: "https://platform.openai.com/usage",
    deepseek: "https://platform.deepseek.com/usage",
  };
  const balanceUrl = providerBalanceUrl[provider] || "#";
  const icon = providerIconMap[provider] || "/api/static/img/ClaudeSpark.png";
  const balanceLinkHtml = `<a href="${balanceUrl}" target="_blank" rel="noopener noreferrer" title="Ver consumo en ${provider}" class="inline-flex items-center text-zinc-500 hover:text-cyan-400 transition-colors ml-0.5 flex-shrink-0" onclick="event.stopPropagation()"><i data-lucide="external-link" class="w-3 h-3"></i></a>`;

  if (!budget) {
    return `<div class="flex flex-col gap-1 py-1.5 border-b border-zinc-800/10 last:border-0">
      <div class="flex items-center justify-between text-[11px]">
        <div class="flex items-center gap-1.5 min-w-0"><img src="${icon}" class="w-3.5 h-3.5 object-contain" /><span class="text-zinc-400 font-mono tracking-tight truncate">${escapeHtml(name)}</span>${balanceLinkHtml}</div>
        <span class="text-zinc-600 font-mono text-[10px]">N/A / N/A</span>
      </div>
      <div class="w-full bg-zinc-800/20 rounded-full h-1 border border-zinc-700/20"></div>
    </div>`;
  }
  const usedPct = pct ?? 0;
  const barColorClass = usedPct < 50 ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]" : usedPct < 85 ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]";
  return `<div class="flex flex-col gap-1 py-1.5 border-b border-zinc-800/20 last:border-0">
    <div class="flex items-center justify-between text-[11px]">
      <div class="flex items-center gap-1.5 min-w-0"><img src="${icon}" class="w-3.5 h-3.5 object-contain flex-shrink-0" /><span class="text-zinc-300 font-mono tracking-tight truncate">${escapeHtml(name)}</span>${balanceLinkHtml}</div>
      <span class="text-zinc-400 font-mono text-[9px]">${formatTokenCount(used)} / ${formatTokenCount(budget)}</span>
    </div>
    <div class="w-full bg-zinc-950/60 rounded-full h-1 border border-zinc-850/40 overflow-hidden">
      <div class="${barColorClass} h-full rounded-full transition-all duration-500" style="width: ${Math.min(usedPct, 100)}%;"></div>
    </div>
  </div>`;
}

export async function loadDashboard() {
  const grid = $("dashboard-grid");
  if (!grid) return;
  grid.innerHTML = `<div class="flex flex-col items-center justify-center py-16 gap-4 text-center">
    <div class="relative w-16 h-16 flex items-center justify-center">
      <div class="absolute inset-0 rounded-full border border-dashed border-cyan-400/30 animate-[spin_10s_linear_infinite]"></div>
      <div class="absolute inset-2 rounded-full border border-cyan-400/60 border-t-transparent animate-[spin_1.5s_linear_infinite]"></div>
      <div class="absolute w-2 h-2 rounded-full bg-cyan-400 animate-ping"></div>
    </div>
    <div class="font-heading text-xs uppercase tracking-widest text-cyan-400 animate-pulse">Sincronizando métricas…</div>
  </div>`;
  window.lucide && lucide.createIcons();

  try {
    const [statsRes, projects, chats] = await Promise.all([
      fetch(`${API}/dashboard/stats`).then((r) => r.json().then((data) => ({ ok: r.ok, data }))),
      fetch(`${API}/projects`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`${API}/chats`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    if (!statsRes.ok) throw new Error(statsRes.data.detail || "Error cargando el dashboard");
    window._lastDashboardData = statsRes.data;
    window._lastDashboardProjects = projects || [];
    window._lastDashboardChats = chats || [];
    renderDashboard(statsRes.data, projects || [], chats || []);
  } catch (e) {
    stopDashboardClock();
    grid.innerHTML = `<div class="text-center py-16 text-rose-400 font-mono">⚠ Error al cargar el dashboard: ${escapeHtml(e.message)}</div>`;
  }
}

function renderDashboard(data, projects, chats) {
  const grid = $("dashboard-grid");
  if (!grid) return;
  const { counts, health, weather, token_usage } = data;
  const today = prNow().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

  const heroHtml = `<div class="holo-hero p-4 sm:p-5 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative z-10">
    <div class="relative z-10">
      <h1 class="text-xl sm:text-2xl font-heading font-bold text-zinc-100 mb-1 leading-none">${dashboardGreeting()}</h1>
      <p class="text-zinc-500 text-xs capitalize">${escapeHtml(today)} · <span id="dash-clock" class="font-mono">--:--:--</span></p>
    </div>
    <div class="flex items-center gap-2 flex-wrap sm:shrink-0 relative z-10">
      <button type="button" onclick="Cosmo.goHome()" class="lite-pill rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300"><i data-lucide="plus" class="w-3.5 h-3.5"></i><span class="hidden xs:inline">Nuevo proyecto</span><span class="xs:hidden">Nuevo</span></button>
      <button type="button" onclick="Cosmo.toggleChatDrawer(true)" class="lite-pill rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-[11px] font-semibold !text-cyan-300 !border-cyan-500/40 hover:!border-cyan-400/60 hover:!bg-cyan-500/10 shadow-[0_0_12px_rgba(34,211,238,0.15)]"><i data-lucide="sparkles" class="w-3.5 h-3.5 text-cyan-400"></i><span class="hidden xs:inline">Consultar a THEMIS</span><span class="xs:hidden">THEMIS</span></button>
      <button type="button" onclick="Cosmo.loadDashboard()" title="Actualizar" class="lite-pill rounded-lg p-1.5 text-zinc-400 hover:text-zinc-200"><i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i></button>
    </div>
  </div>`;

  // ─── "Tu sistema, en una sola pasada" — resumen + 3 hitos ───
  const latestProject = projects[0];
  const latestChat = chats[0];
  const healthOkCount = ["anthropic", "openai", "deepseek", "news_api"].filter((k) => health[k]).length;

  const summaryDescription = `Tienes ${counts.projects} proyecto${counts.projects === 1 ? "" : "s"} y ${counts.chats} conversación${counts.chats === 1 ? "" : "es"} registrada${counts.chats === 1 ? "" : "s"}. ${healthOkCount}/4 servicios están operativos ahora mismo.`;

  const highlightItems = [
    latestProject
      ? dashHighlightItem({ title: latestProject.name, subtitle: "Proyecto reciente", accent: "cyan" })
      : dashHighlightItem({ title: "Sin proyectos aún", subtitle: "Modo Construir", accent: "cyan" }),
    latestChat
      ? dashHighlightItem({ title: latestChat.name, subtitle: "Última conversación", accent: "amber" })
      : dashHighlightItem({ title: "Sin conversaciones aún", subtitle: "Modo Chat", accent: "amber" }),
    dashHighlightItem({
      title: `${healthOkCount}/4 servicios activos`,
      subtitle: "Estado del sistema",
      accent: healthOkCount === 4 ? "emerald" : "amber",
    }),
  ].join("");

  const summaryHtml = `<div class="lite-card p-4 sm:p-5 flex flex-col gap-3">
    <span class="text-[10px] uppercase tracking-[0.14em] text-zinc-500 font-semibold">Tu sistema, en una sola pasada</span>
    <p class="text-[13px] text-zinc-300 leading-relaxed">${escapeHtml(summaryDescription)}</p>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-zinc-800/40 mt-1">${highlightItems}</div>
  </div>`;

  const statsHtml = `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
    ${dashStat({ icon: "newspaper", label: "Noticias hoy", value: counts.news ?? "—", accent: "cyan" })}
    ${dashStat({ icon: "image", label: "Imágenes", value: counts.images, accent: "emerald" })}
    ${dashStat({ icon: "layout-template", label: "Proyectos", value: counts.projects, accent: "cyan" })}
    ${dashStat({ icon: "message-square", label: "Chats", value: counts.chats, accent: "amber" })}
  </div>`;

  // ─── Actividad reciente (proyectos + chats fusionados por fecha) ───
  const activityItems = [
    ...projects.map((p) => ({
      title: p.name, subtitle: "Proyecto", date: formatProjectDate(p.updated_at), updated_at: p.updated_at,
      onClick: `Cosmo.openProject('${p.id}')`, accent: "cyan",
    })),
    ...chats.map((c) => ({
      title: c.name, subtitle: "Conversación", date: formatProjectDate(c.updated_at), updated_at: c.updated_at,
      onClick: `Cosmo.openChat('${c.id}')`, accent: "amber",
    })),
  ].sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")).slice(0, 8);

  const activityHtml = `<div class="lite-card p-4 sm:p-5 flex flex-col">
    <span class="text-[10px] uppercase tracking-[0.14em] text-zinc-500 font-semibold mb-2">Actividad reciente</span>
    <div class="flex flex-col">
      ${activityItems.length ? activityItems.map(dashActivityRow).join("") : `<div class="text-[11px] text-zinc-500 font-mono py-8 text-center">Aún no hay actividad registrada</div>`}
    </div>
  </div>`;

  let weatherHtml;
  if (weather && weather.ok) {
    const unit = dashboardState.weatherUnit;
    const uLabel = tempUnitLabel(unit);
    const uvSuffix = weather.today.uv_index_max != null ? ` (${weather.today.uv_label})` : "";
    const isF = unit === "f";
    const toggleHtml = `<div class="flex items-center gap-1.5 ml-auto">
      <span id="w-unit-c" class="text-[10px] font-mono ${isF ? "text-zinc-500" : "text-cyan-400"}">°C</span>
      <button type="button" id="w-unit-toggle" onclick="Cosmo.toggleWeatherUnit()" class="relative w-8 h-[18px] rounded-full transition-colors duration-200 cursor-pointer border-0 p-0 ${isF ? "bg-cyan-500" : "bg-zinc-700"}" title="Alternar entre Celsius y Fahrenheit">
        <span class="absolute top-[2px] left-[2px] w-3.5 h-3.5 rounded-full bg-white shadow transition-transform duration-200" style="transform: translateX(${isF ? "14px" : "0"})"></span>
      </button>
      <span id="w-unit-f" class="text-[10px] font-mono ${isF ? "text-cyan-400" : "text-zinc-500"}">°F</span>
    </div>`;
    window._lastDashboardWeather = weather;
    const dayFmt = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "").slice(0, 3);
    const forecastRows = (weather.forecast || []).map((d) => dashForecastRow({
      dayLabel: dayFmt(d.date), icon: weatherIconFor(d.condition),
      max_c: d.max_c, min_c: d.min_c, unit,
    })).join("");
    weatherHtml = `<div id="dashboard-weather" class="lite-card p-4 sm:p-5 flex flex-col">
      <div class="flex items-center gap-2 mb-3">
        <span class="text-[10px] uppercase tracking-[0.14em] text-zinc-500 font-semibold">Clima · ${escapeHtml(weather.location)}</span>
        ${toggleHtml}
      </div>
      <div class="flex items-center gap-3 mb-3">
        <div class="text-4xl font-heading font-bold text-zinc-100 leading-none"><span id="w-main-temp" data-temp-c="${weather.current.temperature_c}">${convertTemp(weather.current.temperature_c, unit)}</span><span id="w-main-unit" class="text-xl">${uLabel}</span></div>
        <div class="flex flex-col gap-0.5"><i data-lucide="cloud-sun" class="w-6 h-6 text-cyan-400"></i><span class="text-xs text-zinc-400 capitalize">${escapeHtml(weather.current.condition)}</span></div>
      </div>
      <div class="flex flex-col">
        <div class="flex items-center justify-between gap-3 py-1.5 border-b border-zinc-800/30 last:border-0">
          <span class="flex items-center gap-2 text-[11px] text-zinc-500"><i data-lucide="thermometer" class="w-3 h-3 text-cyan-400/60"></i> Sensación térmica</span>
          <span class="text-[11px] font-mono text-zinc-300"><span id="w-feels-temp" data-temp-c="${weather.current.feels_like_c}">${convertTemp(weather.current.feels_like_c, unit)}</span><span id="w-feels-unit">${uLabel}</span></span>
        </div>
        ${dashWeatherDetail({ icon: "droplets", label: "Humedad", value: weather.current.humidity_pct + "%" })}
        ${dashWeatherDetail({ icon: "wind", label: "Viento", value: Math.round(weather.current.wind_kmh) + " km/h" })}
        ${weather.today.uv_index_max != null ? dashWeatherDetail({ icon: "sun", label: "Índice UV", value: Math.round(weather.today.uv_index_max) + uvSuffix }) : ""}
      </div>
      ${forecastRows ? `<span class="text-[9.5px] uppercase tracking-[0.14em] text-zinc-600 font-semibold mt-3 mb-1">Próximos días</span><div id="w-forecast" class="flex flex-col">${forecastRows}</div>` : ""}
    </div>`;
  } else {
    weatherHtml = `<div class="lite-card p-5 flex flex-col items-center justify-center gap-2 text-center h-full">
      <i data-lucide="cloud-off" class="w-5 h-5 text-rose-400"></i><span class="text-xs text-zinc-400">${escapeHtml((weather && weather.error) || "Clima no disponible")}</span>
    </div>`;
  }

  const services = [
    { key: "anthropic", label: "Claude", sub: "Anthropic", icon: "/api/static/img/ClaudeSpark.png" },
    { key: "openai", label: "OpenAI", sub: "Imágenes/GPT", icon: "/api/static/img/ChatGPT.png" },
    { key: "deepseek", label: "DeepSeek", sub: "DeepSeek v4", icon: "/api/static/img/DeepSeek.png" },
    { key: "news_api", label: "NewsAPI", sub: "Noticias", icon: null },
  ];
  const healthRows = services.map((s) => {
    const ok = health[s.key];
    const iconEl = s.icon
      ? `<img src="${s.icon}" class="w-5 h-5 object-contain rounded flex-shrink-0" alt="${s.label}" />`
      : `<i data-lucide="newspaper" class="w-4 h-4 text-cyan-400/70 flex-shrink-0"></i>`;
    return `<div class="flex items-center gap-2.5 py-2 border-b border-zinc-800/30 last:border-0">
      ${iconEl}
      <div class="flex flex-col leading-tight flex-1 min-w-0"><span class="text-[12px] text-zinc-300">${s.label}</span></div>
      <span class="flex items-center gap-1.5 text-[10.5px] font-mono ${ok ? "text-emerald-400" : "text-zinc-500"}">
        <span class="w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-zinc-600"}"></span>${ok ? "Operativo" : "Inactivo"}
      </span>
    </div>`;
  }).join("");

  const gaugeList = token_usage || [];
  window._currentTokenUsage = gaugeList;

  const initialListHtml = gaugeList.length
    ? gaugeList.map((t) => dashTokenProgressBar(t)).join("")
    : `<div class="text-[10px] text-zinc-600 font-mono py-8 text-center">Sin consumo registrado hoy</div>`;

  window._filterTokens = (provider) => {
    ["all", "anthropic", "openai", "deepseek"].forEach((tab) => {
      const btn = document.getElementById(`token-tab-${tab}`);
      if (btn) {
        if (tab === provider) {
          btn.className = "token-tab-btn px-2 py-0.5 rounded text-[8px] sm:text-[9px] uppercase font-mono tracking-wider font-semibold border border-cyan-500/50 bg-cyan-950/20 text-cyan-400 transition-all duration-200 cursor-pointer";
        } else {
          btn.className = "token-tab-btn px-2 py-0.5 rounded text-[8px] sm:text-[9px] uppercase font-mono tracking-wider font-semibold border border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:text-zinc-300 transition-all duration-200 cursor-pointer";
        }
      }
    });
    const listContainer = document.getElementById("token-usage-list");
    if (listContainer && window._currentTokenUsage) {
      const filtered = provider === "all" ? window._currentTokenUsage : window._currentTokenUsage.filter((t) => t.provider === provider);
      if (filtered.length) listContainer.innerHTML = filtered.map((t) => dashTokenProgressBar(t)).join("");
      else listContainer.innerHTML = `<div class="text-[10px] text-zinc-600 font-mono py-8 text-center">Sin consumo registrado hoy</div>`;
      window.lucide && lucide.createIcons();
    }
  };

  const healthHtml = `<div class="lite-card p-4 sm:p-5 flex flex-col">
    <div class="flex items-center justify-between mb-3">
      <span class="text-[10px] uppercase tracking-[0.14em] text-zinc-500 font-semibold">Salud del sistema</span>
      <span class="text-[9.5px] text-zinc-600 font-mono">uptime ${formatUptime(health.uptime_seconds)}</span>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 flex flex-col min-w-0">
        <div class="flex items-center gap-1.5 mb-2 overflow-x-auto pb-1 no-scrollbar">
          <button type="button" onclick="Cosmo.filterTokens('all')" id="token-tab-all" class="token-tab-btn px-2 py-0.5 rounded text-[8px] sm:text-[9px] uppercase font-mono tracking-wider font-semibold border border-cyan-500/50 bg-cyan-950/20 text-cyan-400 transition-all duration-200 cursor-pointer">Todos</button>
          <button type="button" onclick="Cosmo.filterTokens('anthropic')" id="token-tab-anthropic" class="token-tab-btn px-2 py-0.5 rounded text-[8px] sm:text-[9px] uppercase font-mono tracking-wider font-semibold border border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:text-zinc-300 transition-all duration-200 cursor-pointer">Claude</button>
          <button type="button" onclick="Cosmo.filterTokens('openai')" id="token-tab-openai" class="token-tab-btn px-2 py-0.5 rounded text-[8px] sm:text-[9px] uppercase font-mono tracking-wider font-semibold border border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:text-zinc-300 transition-all duration-200 cursor-pointer">GPT</button>
          <button type="button" onclick="Cosmo.filterTokens('deepseek')" id="token-tab-deepseek" class="token-tab-btn px-2 py-0.5 rounded text-[8px] sm:text-[9px] uppercase font-mono tracking-wider font-semibold border border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:text-zinc-300 transition-all duration-200 cursor-pointer">DeepSeek</button>
        </div>
        <div id="token-usage-list" class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0">${initialListHtml}</div>
      </div>
      <div class="flex flex-col border-t lg:border-t-0 lg:border-l border-zinc-800/30 lg:pl-4 pt-3 lg:pt-0">${healthRows}</div>
    </div>
  </div>`;

  const quoteHtml = `<div class="lite-card p-4 sm:p-5 flex flex-col justify-center gap-2">
    <span class="text-[10px] uppercase tracking-[0.14em] text-zinc-500 font-semibold">Transmisión · hoy</span>
    <p class="text-[13px] text-zinc-300 italic leading-relaxed">"${escapeHtml(dashQuoteOfDay())}"</p>
    <span class="text-[10px] text-zinc-600 font-mono">— THEMIS</span>
  </div>`;

  const quickHtml = `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
    <button type="button" onclick="Cosmo.goHome()" class="lite-pill p-3.5 flex flex-col items-center justify-center gap-2 text-center cursor-pointer"><i data-lucide="code-2" class="w-4 h-4 text-cyan-400"></i><span class="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-400">Construir app</span></button>
    <button type="button" onclick="Cosmo.toggleChatDrawer(true)" class="lite-pill p-3.5 flex flex-col items-center justify-center gap-2 text-center cursor-pointer !border-cyan-500/30 hover:!border-cyan-400/50 hover:!bg-cyan-500/10 shadow-[0_0_10px_rgba(34,211,238,0.1)]"><i data-lucide="message-square" class="w-4 h-4 text-cyan-400"></i><span class="text-[10.5px] font-semibold uppercase tracking-wider text-cyan-300">Abrir asistente</span></button>
    <button type="button" onclick="Cosmo.showNewsPanel()" class="lite-pill p-3.5 flex flex-col items-center justify-center gap-2 text-center cursor-pointer"><i data-lucide="newspaper" class="w-4 h-4 text-cyan-400"></i><span class="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-400">Ver noticias</span></button>
    <button type="button" onclick="Cosmo.showGalleryPanel()" class="lite-pill p-3.5 flex flex-col items-center justify-center gap-2 text-center cursor-pointer"><i data-lucide="image" class="w-4 h-4 text-emerald-400"></i><span class="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-400">Ver galería</span></button>
  </div>`;

  grid.innerHTML = `<div class="w-full max-w-[1600px] mx-auto flex flex-col gap-4">
    <div class="dash-stagger-1">${heroHtml}</div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 dash-stagger-2">
      <div class="lg:col-span-2 flex flex-col gap-4">
        <div>${summaryHtml}</div>
        <div>${statsHtml}</div>
        <div>${activityHtml}</div>
      </div>
      <div class="flex flex-col gap-4">
        <div>${weatherHtml}</div>
        ${quoteHtml}
      </div>
    </div>
    <div class="dash-stagger-3">${healthHtml}</div>
    <div class="dash-stagger-4">${quickHtml}</div>
  </div>`;
  window.lucide && lucide.createIcons();
  startDashboardClock();
}

// ─── News ───

export function showNewsPanel() {
  hideAllPanels();
  const panel = $("chat-news");
  panel.classList.remove("hidden");
  panel.classList.add("flex");
  triggerTechLoading("chat-news");

  if (window._highlightActiveChatInList) window._highlightActiveChatInList(null);
  highlightNavSection("news");
  if (window._applySidebarMode) window._applySidebarMode("home");
  if (window._toggleChatSidebar) window._toggleChatSidebar(false);
  loadNews(newsState.region);
}

function setNewsTabsUI() {
  document.querySelectorAll(".news-tab-btn").forEach((btn) => {
    const active = btn.id === `news-tab-${newsState.region}`;
    btn.classList.toggle("bg-white", active);
    btn.classList.toggle("shadow-sm", active);
    btn.classList.toggle("text-zinc-900", active);
    btn.classList.toggle("text-zinc-500", !active);
    btn.classList.toggle("hover:text-zinc-700", !active);
  });
}

export async function loadNews(region) {
  if (region) newsState.region = region;
  setNewsTabsUI();
  const grid = $("news-grid");
  grid.innerHTML = `<div class="col-span-full flex flex-col items-center justify-center py-16 gap-4 text-center">
    <div class="relative w-16 h-16 flex items-center justify-center">
      <div class="absolute inset-0 rounded-full border border-dashed border-cyan-400/30 animate-[spin_10s_linear_infinite]"></div>
      <div class="absolute inset-2 rounded-full border border-cyan-400/60 border-t-transparent animate-[spin_1.5s_linear_infinite]"></div>
      <div class="absolute w-2 h-2 rounded-full bg-cyan-400 animate-ping"></div>
    </div>
    <div class="font-heading text-xs uppercase tracking-widest text-cyan-400 animate-pulse">Cargando noticias…</div>
  </div>`;
  window.lucide && lucide.createIcons();
  try {
    const res = await fetch(`${API}/news?region=${newsState.region}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Error cargando noticias");
    renderNewsGrid(data.articles || []);
  } catch (e) {
    grid.innerHTML = `<div class="text-sm text-red-500 py-16 text-center">⚠ ${escapeHtml(friendlyError(e.message, "noticias"))}</div>`;
  }
}

function renderNewsGrid(articles) {
  const grid = $("news-grid");
  if (!articles.length) { grid.innerHTML = `<div class="text-sm text-zinc-400 py-16 text-center">No se encontraron noticias.</div>`; return; }
  grid.innerHTML = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">${articles.map(renderNewsCard).join("")}</div>`;
  window.lucide && lucide.createIcons();
}

function renderNewsCard(a) {
  const thumb = a.image
    ? `<div class="w-full h-48 overflow-hidden rounded-t-xl bg-zinc-100"><img src="${a.image}" alt="" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onerror="this.parentElement.style.display='none'" /></div>`
    : `<div class="w-full h-48 bg-zinc-100 rounded-t-xl flex items-center justify-center"><i data-lucide="newspaper" class="w-10 h-10 text-zinc-300"></i></div>`;
  return `<a href="${a.url}" target="_blank" rel="noopener noreferrer" class="news-card group holo-card-3d flex flex-col rounded-xl overflow-hidden">
    ${thumb}
    <div class="flex flex-col gap-2 p-4 flex-1">
      <span class="text-[10px] font-mono uppercase tracking-widest text-zinc-400">${escapeHtml(a.source || "")} · ${formatNewsDate(a.publishedAt)}</span>
      <h3 class="text-sm font-semibold text-zinc-900 leading-snug line-clamp-3 group-hover:text-zinc-600 transition-colors">${escapeHtml(a.title || "")}</h3>
      ${a.description ? `<p class="text-xs text-zinc-500 leading-relaxed line-clamp-3 mt-auto pt-1">${escapeHtml(a.description)}</p>` : ""}
    </div>
  </a>`;
}

// ─── Gallery ───

export function showGalleryPanel() {
  hideAllPanels();
  const panel = $("chat-gallery");
  panel.classList.remove("hidden");
  panel.classList.add("flex");
  triggerTechLoading("chat-gallery");

  if (window._highlightActiveChatInList) window._highlightActiveChatInList(null);
  highlightNavSection("gallery");
  if (window._applySidebarMode) window._applySidebarMode("home");
  if (window._toggleChatSidebar) window._toggleChatSidebar(false);
  loadGallery();
}

export async function loadGallery() {
  const grid = $("gallery-grid");
  if (!grid) return;
  grid.innerHTML = `<div class="col-span-full flex flex-col items-center justify-center py-16 gap-4 text-center">
    <div class="relative w-16 h-16 flex items-center justify-center">
      <div class="absolute inset-0 rounded-full border border-dashed border-cyan-400/30 animate-[spin_10s_linear_infinite]"></div>
      <div class="absolute inset-2 rounded-full border border-cyan-400/60 border-t-transparent animate-[spin_1.5s_linear_infinite]"></div>
      <div class="absolute w-2 h-2 rounded-full bg-cyan-400 animate-ping"></div>
    </div>
    <div class="font-heading text-xs uppercase tracking-widest text-cyan-400 animate-pulse">Cargando galería…</div>
  </div>`;
  window.lucide && lucide.createIcons();
  try {
    const res = await fetch("/api/gallery");
    const data = await res.json();
    renderGalleryItems(data.images || []);
  } catch (err) {
    grid.innerHTML = `<div class="col-span-full text-center py-16 text-rose-400 font-mono">⚠ Error al cargar la galería.</div>`;
  }
}

function renderGalleryItems(items) {
  const grid = $("gallery-grid");
  if (!grid) return;
  if (!items || !items.length) {
    grid.innerHTML = `<div class="col-span-full flex flex-col items-center justify-center py-16 text-zinc-400"><i data-lucide="image-off" class="w-12 h-12 mb-3 text-zinc-500/50"></i><p class="text-sm font-medium">No se han generado imágenes todavía.</p></div>`;
    window.lucide && lucide.createIcons();
    return;
  }
  const cards = items.map((item) => `<div class="gallery-card group relative holo-card-3d flex flex-col rounded-xl overflow-hidden">
    <div class="aspect-square w-full overflow-hidden bg-zinc-100 relative">
      <img src="${item.image_url}" alt="${escapeHtml(item.prompt)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
      <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
        <a href="${item.image_url}" target="_blank" class="p-2 bg-white rounded-full text-zinc-800 hover:scale-110 active:scale-95 transition-all shadow" title="Ver original"><i data-lucide="external-link" class="w-4 h-4"></i></a>
        <button onclick="Cosmo.deleteGalleryItem('${item.id}')" class="p-2 bg-rose-500 rounded-full text-white hover:scale-110 active:scale-95 transition-all shadow cursor-pointer border-0" title="Eliminar de galería"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
      </div>
    </div>
    <div class="flex flex-col gap-2 p-4 flex-1">
      <span class="text-[10px] font-mono uppercase tracking-widest text-zinc-400">IA CREACIÓN · ${formatNewsDate(item.created_at)}</span>
      <h3 class="text-sm font-semibold text-zinc-900 leading-snug line-clamp-4 text-left" title="${escapeHtml(item.prompt)}">${escapeHtml(item.prompt)}</h3>
    </div>
  </div>`).join("");
  grid.innerHTML = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">${cards}</div>`;
  window.lucide && lucide.createIcons();
}

export async function deleteGalleryItem(id) {
  const { showConfirmModal } = await import("./modals.js");
  showConfirmModal({
    title: "¿Eliminar imagen?",
    messageHtml: "La imagen se eliminará permanentemente de la galería. Esta acción no se puede deshacer.",
    confirmLabel: "Eliminar",
    onConfirm: async () => {
      try {
        const res = await fetch(`/api/gallery/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (data.ok) loadGallery();
      } catch (err) { alert("No se pudo eliminar la imagen."); }
    },
  });
}

// ─── Weather unit toggle (quirúrgico — solo actualiza el DOM del clima) ───

export function toggleWeatherUnit() {
  const next = dashboardState.weatherUnit === "c" ? "f" : "c";
  dashboardState.weatherUnit = next;
  try { localStorage.setItem("cosmo_weather_unit", next); } catch (_) { /* noop */ }

  const card = document.getElementById("dashboard-weather");
  if (!card) return;

  const uLabel = tempUnitLabel(next);
  const isF = next === "f";

  // Actualizar temperatura principal
  const mainTemp = card.querySelector("#w-main-temp");
  const mainUnit = card.querySelector("#w-main-unit");
  if (mainTemp && mainUnit) {
    const c = parseFloat(mainTemp.getAttribute("data-temp-c"));
    if (!isNaN(c)) mainTemp.textContent = convertTemp(c, next);
    mainUnit.textContent = uLabel;
  }

  // Actualizar sensación térmica
  const feelsTemp = card.querySelector("#w-feels-temp");
  const feelsUnit = card.querySelector("#w-feels-unit");
  if (feelsTemp && feelsUnit) {
    const c = parseFloat(feelsTemp.getAttribute("data-temp-c"));
    if (!isNaN(c)) feelsTemp.textContent = convertTemp(c, next);
    feelsUnit.textContent = uLabel;
  }

  // Actualizar filas de pronóstico (máximas y mínimas)
  const forecast = card.querySelector("#w-forecast");
  if (forecast) {
    forecast.querySelectorAll("[data-temp-c]").forEach((span) => {
      const c = parseFloat(span.getAttribute("data-temp-c"));
      if (!isNaN(c)) span.textContent = convertTemp(c, next) + "°";
    });
  }

  // Actualizar toggle switch visual y labels °C / °F
  const toggleBtn = document.getElementById("w-unit-toggle");
  const labelC = document.getElementById("w-unit-c");
  const labelF = document.getElementById("w-unit-f");
  if (toggleBtn) {
    toggleBtn.classList.toggle("bg-cyan-500", isF);
    toggleBtn.classList.toggle("bg-zinc-700", !isF);
    const knob = toggleBtn.querySelector("span");
    if (knob) knob.style.transform = `translateX(${isF ? "14px" : "0"})`;
  }
  if (labelC) {
    labelC.classList.toggle("text-cyan-400", !isF);
    labelC.classList.toggle("text-zinc-500", isF);
  }
  if (labelF) {
    labelF.classList.toggle("text-cyan-400", isF);
    labelF.classList.toggle("text-zinc-500", !isF);
  }
}

// ─── Tech loading helper ───

function triggerTechLoading(id) {
  const el = $(id);
  if (!el) return;
  el.classList.remove("tech-loading-section");
  void el.offsetWidth;
  el.classList.add("tech-loading-section");
}
