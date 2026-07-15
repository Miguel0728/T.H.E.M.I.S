/* T.H.E.M.I.S. — Inicialización, navegación, modelos, templates. */
import { API, state, chatState, TEMPLATES, MODEL_LIST, setModelList, closeAllFloatingMenus } from "./state.js";
import { $, escapeHtml, formatProjectDate } from "./utils.js";
import {
  goHome, enterWorkspace, loadSidebarProjects, setupComposer, setupMediaDropdowns,
  setProjectType, removeProjectZip, renderZipChip, connectFolder, renderPathChip, removeExternalPath
} from "./workspace.js";
import { setupChatComposer, setupChatToolsDropdowns, loadChatList, newChatView, initChatBanner } from "./chat.js";
import { showDashboardPanel } from "./dashboard.js";

// ─── Model icons ───

const modelIconSrc = (m) => {
  if (m?.provider === "openai") return "/api/static/img/ChatGPT.png";
  if (m?.provider === "deepseek") return "/api/static/img/DeepSeek.png";
  return "/api/static/img/ClaudeSpark.png";
};
const modelIconAlt = (m) => {
  if (m?.provider === "openai") return "OpenAI";
  if (m?.provider === "deepseek") return "DeepSeek";
  return "Claude";
};
const modelIconClass = () => "w-4 h-4 flex-shrink-0";

// ─── Apply model to UI ───

export function applyModelToUI(modelId) {
  const m = MODEL_LIST.find((x) => x.id === modelId);
  state.model = modelId;
  document.querySelectorAll('[id$="-label"]').forEach((label) => { label.textContent = m?.name || "Modelo"; });
  document.querySelectorAll('[id$="-icon"]').forEach((img) => {
    img.src = modelIconSrc(m);
    img.alt = modelIconAlt(m);
    img.className = modelIconClass();
  });
}

// ─── Load models ───

export async function loadModels() {
  const res = await fetch(`${API}/models`);
  const data = await res.json();
  setModelList(data.models);
  state.model = data.default;

  const buildMenu = (btnId, menuId) => {
    const btn = $(btnId);
    const menu = $(menuId);
    if (!btn || !menu) return;

    const renderModelRow = (m) => `
      <button type="button" class="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-100 transition-colors text-left border-0 bg-transparent cursor-pointer" data-model="${m.id}">
        <img src="${modelIconSrc(m)}" class="w-4 h-4 flex-shrink-0 object-contain" alt="${modelIconAlt(m)}" />
        <span class="flex flex-col leading-tight flex-1 min-w-0">
          <span class="text-xs font-body text-zinc-700 truncate">${escapeHtml(m.name)}${m.recommended ? " ★" : ""}</span>
          ${m.tagline ? `<span class="text-[10px] text-zinc-400">${escapeHtml(m.tagline)}</span>` : ""}
        </span>
        ${m.id === state.model ? '<i data-lucide="check" class="w-3.5 h-3.5 text-sage-600 shrink-0"></i>' : ""}
      </button>`;

    const renderProviderGroup = (provider, label, logoSrc, models) => {
      if (!models.length) return "";
      return `<div class="provider-group relative" data-provider="${provider}">
        <button type="button" class="provider-group-btn w-full flex items-center justify-between px-3 py-2.5 hover:bg-zinc-100 transition-colors text-left border-0 bg-transparent cursor-pointer">
          <div class="flex items-center gap-2">
            <img src="${logoSrc}" class="flex-shrink-0 object-contain" style="width: 18px; height: 18px;" alt="${label}" />
            <span class="text-xs font-body font-semibold tracking-wider text-zinc-700">${label}</span>
          </div>
          <i data-lucide="chevron-right" class="w-3.5 h-3.5 text-zinc-400"></i>
        </button>
        <div class="provider-submenu hidden absolute top-0 bg-white border border-zinc-200 rounded-xl shadow-md py-1 min-w-[200px] z-[99999]">
          ${models.map((m) => renderModelRow(m)).join("")}
        </div>
      </div>`;
    };

    const positionSubmenu = (group, submenu) => {
      const rect = group.getBoundingClientRect();
      const SUBMENU_WIDTH = 210;
      const openLeft = window.innerWidth - rect.right - 8 < SUBMENU_WIDTH;
      const parentOpenedUpwards = menu.style.top === "auto";
      const spaceBelow = window.innerHeight - rect.top;
      const ESTIMATED_SUBMENU_HEIGHT = 150;
      if (parentOpenedUpwards || spaceBelow < ESTIMATED_SUBMENU_HEIGHT) {
        submenu.style.bottom = "0"; submenu.style.top = "auto";
      } else {
        submenu.style.top = "0"; submenu.style.bottom = "auto";
      }
      if (openLeft) {
        submenu.style.right = "100%"; submenu.style.left = "auto"; submenu.style.marginRight = "4px";
      } else {
        submenu.style.left = "100%"; submenu.style.right = "auto"; submenu.style.marginLeft = "4px";
      }
    };

    const renderProvidersMenu = () => {
      const anthropicModels = MODEL_LIST.filter((m) => m.provider === "anthropic");
      const openaiModels = MODEL_LIST.filter((m) => m.provider === "openai");
      const deepseekModels = MODEL_LIST.filter((m) => m.provider === "deepseek");
      menu.innerHTML = `<div class="relative py-1">
        ${renderProviderGroup("anthropic", "ANTHROPIC", "/api/static/img/AnthropicLogo.png", anthropicModels)}
        ${renderProviderGroup("openai", "OPENAI", "/api/static/img/ChatGPT.png", openaiModels)}
        ${renderProviderGroup("deepseek", "DEEPSEEK", "/api/static/img/DeepSeek.png", deepseekModels)}
      </div>`;
      menu.querySelectorAll(".provider-group").forEach((group) => {
        const groupBtn = group.querySelector(".provider-group-btn");
        const submenu = group.querySelector(".provider-submenu");
        groupBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const isHidden = submenu.classList.contains("hidden");
          menu.querySelectorAll(".provider-submenu").forEach((s) => s.classList.add("hidden"));
          if (isHidden) { positionSubmenu(group, submenu); submenu.classList.remove("hidden"); }
        });
      });
      window.lucide && lucide.createIcons();
    };

    document.body.appendChild(menu);
    menu.classList.add("model-floating-menu");

    btn.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const isHidden = menu.classList.contains("hidden");
      closeAllFloatingMenus();
      if (isHidden) {
        renderProvidersMenu();
        const rect = btn.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom - 8;
        const spaceAbove = rect.top - 8;
        const MIN_COMFORTABLE = 220;
        Object.assign(menu.style, { position: "fixed", zIndex: "99999", left: rect.left + "px", minWidth: Math.max(rect.width, 200) + "px", overflow: "visible" });
        if (spaceBelow >= MIN_COMFORTABLE || spaceBelow >= spaceAbove) {
          menu.style.top = (rect.bottom + 4) + "px"; menu.style.bottom = "auto"; menu.style.maxHeight = Math.max(spaceBelow, 80) + "px";
        } else {
          menu.style.bottom = (window.innerHeight - rect.top + 4) + "px"; menu.style.top = "auto"; menu.style.maxHeight = Math.max(spaceAbove, 80) + "px";
        }
        menu.classList.remove("hidden");
      }
    });

    menu.addEventListener("click", (e) => {
      const modelBtn = e.target.closest("[data-model]");
      if (modelBtn) { applyModelToUI(modelBtn.dataset.model); menu.classList.add("hidden"); }
    });
  };

  buildMenu("landing-model-btn", "landing-model-menu");
  buildMenu("model-btn", "model-menu");
  buildMenu("chat-start-model-btn", "chat-start-model-menu");
  buildMenu("chat-model-btn", "chat-model-menu");
}

// ─── Templates ───

export function renderTemplates() {
  const el = $("template-gallery");
  if (!el) return;
  el.innerHTML = TEMPLATES.map(
    (t) => `<div class="card lift-card group holo-card-3d rounded-xl p-5 cursor-pointer" onclick="Cosmo.useTemplate('${t.prompt.replace(/'/g, "\\'")}')">
      <div class="card-icon lift-icon w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center mb-3 text-zinc-600">
        <i data-lucide="${t.icon}" class="w-5 h-5"></i>
      </div>
      <div class="text-sm font-medium text-zinc-900 mb-1">${escapeHtml(t.name)}</div>
      <div class="text-xs text-zinc-500">${escapeHtml(t.desc)}</div>
    </div>`
  ).join("");
  window.lucide && lucide.createIcons();
}

export function useTemplate(prompt) {
  const ta = $("landing-prompt");
  ta.value = prompt;
  ta.scrollIntoView({ behavior: "smooth", block: "center" });
  ta.focus();
}

export function useChatSuggestion(prefix) {
  const ta = $("chat-start-input");
  ta.value = prefix;
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

// ─── Load recent projects ───

export async function loadRecent() {
  const res = await fetch(`${API}/projects`);
  const items = await res.json();
  const el = $("recent-projects");
  if (!items.length) {
    el.innerHTML = `<div class="text-sm text-zinc-400 col-span-full">Aún no hay proyectos. ¡Crea el primero!</div>`;
    return;
  }
  el.innerHTML = items.map((p) => `<div class="recent-card lift-card group holo-card-3d rounded-lg p-4 cursor-pointer" onclick="Cosmo.openProject('${p.id}')">
    <div class="flex items-start justify-between">
      <div class="flex items-center gap-2 min-w-0">
        <i data-lucide="${p.external_path ? "link-2" : (p.project_type === "proyecto" ? "folder-tree" : "layout-template")}" class="lift-icon w-4 h-4 text-zinc-400 shrink-0" title="${p.external_path ? `Carpeta conectada: ${p.external_path}` : (p.project_type === "proyecto" ? "Proyecto estructurado" : "App rápida")}"></i>
        <span class="text-sm text-zinc-800 truncate">${escapeHtml(p.name)}</span>
      </div>
      <button onclick="event.stopPropagation();Cosmo.deleteProject('${p.id}')" class="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-opacity">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      </button>
    </div>
    <div class="text-[11px] text-zinc-400 mt-2 font-mono">${formatProjectDate(p.updated_at)}</div>
  </div>`).join("");
  window.lucide && lucide.createIcons();
}

// ─── Sidebar mode ───

export function applySidebarMode(mode) {
  state.sidebarMode = mode;
  const isCode = mode === "code";
  const homeBtn = $("sidebar-mode-home-btn");
  const codeBtn = $("sidebar-mode-code-btn");
  const homeSection = $("sidebar-home-section");
  const codeSection = $("sidebar-code-section");

  [homeBtn, codeBtn].forEach((btn) => {
    if (!btn) return;
    const activeBtn = isCode ? codeBtn : homeBtn;
    const active = btn === activeBtn;
    btn.classList.toggle("bg-white", active);
    btn.classList.toggle("shadow-sm", active);
    btn.classList.toggle("text-zinc-900", active);
    btn.classList.toggle("text-zinc-400", !active);
  });
  if (homeSection) { homeSection.classList.toggle("hidden", isCode); homeSection.classList.toggle("flex", !isCode); }
  if (codeSection) { codeSection.classList.toggle("hidden", !isCode); codeSection.classList.toggle("flex", isCode); }
  if (isCode) loadSidebarProjects();
}

export function setSidebarMode(mode) {
  if (mode === "code") {
    if (state.projectId) enterWorkspace();
    else goHome();
  } else {
    showDashboardPanel();
  }
}

// ─── Header clock (persistente en todas las vistas) ───

function tickHeaderClock() {
  const clockEl = $("header-clock");
  if (!clockEl) return;
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false });
  const dateEl = $("header-date");
  if (dateEl) dateEl.textContent = now.toLocaleDateString("es-ES", { day: "2-digit", month: "short" }).replace(".", "").toUpperCase();
}

export function startHeaderClock() {
  tickHeaderClock();
  setInterval(tickHeaderClock, 1000);
}

// ─── Búsqueda rápida del header: Enter envía el texto al Asistente ───

export function setupHeaderSearch() {
  const input = $("header-quick-search");
  if (!input) return;
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const text = input.value.trim();
    if (!text) return;
    e.preventDefault();
    input.value = "";
    input.blur();
    window.Cosmo.toggleChatDrawer(true);
    window.Cosmo.newChatView();
    const ta = $("chat-start-input");
    if (ta) ta.value = text;
    window.Cosmo.submitChatPrompt();
  });
}

// ─── Reveal animations ───

export function setupRevealAnimations() {
  const targets = document.querySelectorAll(".reveal-up");
  if (!targets.length) return;
  const io = new IntersectionObserver(
    (entries) => { entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); io.unobserve(entry.target); } }); },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  targets.forEach((t) => io.observe(t));
}

export function triggerTechLoading(id) {
  const el = $(id);
  if (!el) return;
  el.classList.remove("tech-loading-section");
  void el.offsetWidth;
  el.classList.add("tech-loading-section");
}

// ─── Drawer & split resize ───

export function setupDrawerResize() {
  const handle = $("chat-drawer-resize-handle");
  const drawer = $("right-chat-drawer");
  if (!handle || !drawer) return;
  let startX = 0, startWidth = 0, isResizing = false;
  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    startX = e.clientX; startWidth = drawer.getBoundingClientRect().width; isResizing = true;
    document.body.classList.add("resizing-drawer"); document.body.style.cursor = "col-resize";
  });
  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;
    const deltaX = startX - e.clientX;
    const newWidth = Math.max(280, Math.min(startWidth + deltaX, window.innerWidth * 0.75));
    drawer.style.width = `${newWidth}px`;
    if (newWidth < 360) drawer.classList.add("drawer-narrow");
    else drawer.classList.remove("drawer-narrow");
  });
  document.addEventListener("mouseup", () => {
    if (!isResizing) return;
    isResizing = false;
    document.body.classList.remove("resizing-drawer"); document.body.style.cursor = "";
  });
}

export function setupSplitResize() {
  const handle = $("workspace-split-handle");
  const agentPane = $("workspace-agent-pane");
  const workspace = $("workspace-view");
  if (!handle || !agentPane || !workspace) return;
  let startX = 0, startW = 0, dragging = false;
  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    startX = e.clientX; startW = agentPane.getBoundingClientRect().width; dragging = true;
    document.body.style.cursor = "col-resize"; document.body.classList.add("resizing-drawer");
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const delta = startX - e.clientX;
    const maxW = workspace.getBoundingClientRect().width * 0.65;
    const newW = Math.max(300, Math.min(startW + delta, maxW));
    agentPane.style.width = `${newW}px`;
    agentPane.style.flexShrink = "0";
  });
  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = ""; document.body.classList.remove("resizing-drawer");
  });
}

// ─── Media upload setup ───

export function setupMediaUpload() {
  const addImages = (files, containerId) => {
    const remaining = 5 - state.imageFiles.length;
    if (remaining <= 0) return;
    const toAdd = Array.from(files).slice(0, remaining);
    state.imageFiles.push(...toAdd);
    state.videoFile = null;
    (window.Cosmo.renderMediaPreviews || (() => {}))(containerId);
  };

  $("image-input").addEventListener("change", (e) => { addImages(e.target.files, "media-previews"); e.target.value = ""; });
  $("landing-image-input").addEventListener("change", (e) => { addImages(e.target.files, "landing-media-row"); e.target.value = ""; });
  $("video-input").addEventListener("change", (e) => {
    const file = e.target.files[0]; if (!file) return;
    state.videoFile = file; state.imageFiles = [];
    (window.Cosmo.renderMediaPreviews || (() => {}))("media-previews");
    e.target.value = "";
  });
  $("landing-video-input").addEventListener("change", (e) => {
    const file = e.target.files[0]; if (!file) return;
    state.videoFile = file; state.imageFiles = [];
    (window.Cosmo.renderMediaPreviews || (() => {}))("landing-media-row");
    e.target.value = "";
  });
  $("landing-zip-input").addEventListener("change", (e) => {
    const file = e.target.files[0]; if (!file) return;
    state.projectZipFile = file; renderZipChip();
  });

  const setupPaste = (textareaId, containerId) => {
    const ta = $(textareaId); if (!ta) return;
    ta.addEventListener("paste", (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      const images = [];
      for (const item of items) { if (item.kind === "file" && item.type.startsWith("image/")) { const file = item.getAsFile(); if (file) images.push(file); } }
      if (images.length) { e.preventDefault(); addImages(images, containerId); }
    });
  };
  setupPaste("landing-prompt", "landing-media-row");
  setupPaste("composer-input", "media-previews");

  // Chat paste
  const addChatImages = (files) => {
    const remaining = 5 - chatState.imageFiles.length;
    if (remaining <= 0) return;
    chatState.imageFiles.push(...Array.from(files).slice(0, remaining));
    if (window.Cosmo.renderChatMediaPreviews) {
      window.Cosmo.renderChatMediaPreviews("chat-start-media");
      window.Cosmo.renderChatMediaPreviews("chat-composer-media");
    }
  };
  $("chat-start-image-input").addEventListener("change", (e) => { addChatImages(e.target.files); e.target.value = ""; });
  $("chat-image-input").addEventListener("change", (e) => { addChatImages(e.target.files); e.target.value = ""; });
  const setupChatPaste = (textareaId) => {
    const ta = $(textareaId); if (!ta) return;
    ta.addEventListener("paste", (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      const images = [];
      for (const item of items) { if (item.kind === "file" && item.type.startsWith("image/")) { const file = item.getAsFile(); if (file) images.push(file); } }
      if (images.length) { e.preventDefault(); addChatImages(images); }
    });
  };
  setupChatPaste("chat-start-input");
  setupChatPaste("chat-composer-input");
}

// ─── Floating menu close ───

document.addEventListener("click", (e) => {
  if (!e.target.closest("[id$='-btn']")) closeAllFloatingMenus();
});

// ─── Init ───

async function init() {
  console.log(
    "%c🤖 J.A.R.V.I.S. PROTOCOL INITIATED %c\n⚙️ Systems: Online\n⚡ Power: 100%\n🛡️ Security: Secure\n💬 Interface: HUD Active",
    "color: #24cfff; font-weight: bold; font-size: 14px; text-shadow: 0 0 5px rgba(36,207,255,0.5);",
    "color: #888; font-family: monospace;"
  );

  await loadModels();
  await loadRecent();
  renderTemplates();
  setupComposer();
  setupChatComposer();
  setupMediaDropdowns();
  setupMediaUpload();
  setupChatToolsDropdowns();
  setupRevealAnimations();
  setupDrawerResize();
  setupSplitResize();
  setupHeaderSearch();
  startHeaderClock();
  loadChatList();
  newChatView();
  showDashboardPanel();
  initChatBanner();
  window.lucide && lucide.createIcons();
}

init();
