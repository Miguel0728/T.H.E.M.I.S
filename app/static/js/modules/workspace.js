/* T.H.E.M.I.S. — Modo Construir: workspace, preview, archivos y media. */
import { API, MAX_IMAGES, state, WORKFLOW_HINTS, TOOL_META, closeAllFloatingMenus } from "./state.js";
import { $, escapeHtml, friendlyError, scrollChat, formatProjectDate } from "./utils.js";
import { showConfirmModal, showConnectFolderModal } from "./modals.js";
import {
  addUserBubble, startAssistantTurn, finalizeCurrentText, appendText,
  addPhaseBadge, setAgentStatus, showAgentStatus, addToolCard, updateToolCard,
  resolvePendingTools, addStaticAssistant
} from "./streaming.js";

// ─── Navegación del workspace ───

export function goHome() {
  document.documentElement.classList.add("theme-amber");
  state.projectId = null;
  state.serverUrl = null;
  state.streaming = false;
  clearMediaState();
  if (window._stopDashboardClock) window._stopDashboardClock();
  $("workspace-view").classList.add("hidden");
  $("workspace-view").classList.remove("flex");
  $("chat-news").classList.add("hidden");
  $("chat-news").classList.remove("flex");
  $("chat-gallery").classList.add("hidden");
  $("chat-gallery").classList.remove("flex");
  $("chat-dashboard").classList.add("hidden");
  $("chat-dashboard").classList.remove("flex");
  $("landing-view").classList.remove("hidden");
  if (window._triggerTechLoading) window._triggerTechLoading("landing-view");
  $("landing-prompt").value = "";
  renderMediaPreviews("landing-media-row");
  if (window._loadRecent) window._loadRecent();
  setProjectType("app");
  if (window._highlightNavSection) window._highlightNavSection("webdesign");
  if (window._applySidebarMode) window._applySidebarMode("code");
}

export function enterWorkspace() {
  document.documentElement.classList.add("theme-amber");
  if (window._stopDashboardClock) window._stopDashboardClock();
  state.activeFile = null;
  state.serverUrl = null;
  updateServerPane();
  const pathEl = $("code-file-path");
  if (pathEl) pathEl.textContent = "Selecciona un archivo para ver su código";
  const copyBtn = $("code-copy-btn");
  if (copyBtn) {
    copyBtn.classList.add("hidden");
    copyBtn.classList.remove("flex");
  }
  $("code-view").textContent = "";
  $("code-line-numbers").textContent = "";
  $("landing-view").classList.add("hidden");
  $("chat-news").classList.add("hidden");
  $("chat-news").classList.remove("flex");
  $("chat-gallery").classList.add("hidden");
  $("chat-gallery").classList.remove("flex");
  $("chat-dashboard").classList.add("hidden");
  $("chat-dashboard").classList.remove("flex");
  $("workspace-view").classList.remove("hidden");
  $("workspace-view").classList.add("flex");
  if (window._triggerTechLoading) window._triggerTechLoading("workspace-view");
  if (window._highlightNavSection) window._highlightNavSection("webdesign");
  if (window._applySidebarMode) window._applySidebarMode("code");
}

export function toggleAgentPane() {
  const pane = $("workspace-agent-pane");
  const btn = $("toggle-agent-pane-btn");
  const handle = $("workspace-split-handle");
  if (!pane) return;
  const isCollapsed = pane.classList.contains("pane-collapsed");
  if (isCollapsed) {
    pane.classList.remove("pane-collapsed");
    if (handle) { handle.style.opacity = ""; handle.style.pointerEvents = ""; }
  } else {
    pane.classList.add("pane-collapsed");
    if (handle) { handle.style.opacity = "0"; handle.style.pointerEvents = "none"; }
  }
  if (btn) {
    btn.innerHTML = isCollapsed
      ? '<i data-lucide="panel-right-close" class="w-4 h-4"></i>'
      : '<i data-lucide="panel-right-open" class="w-4 h-4"></i>';
    window.lucide && lucide.createIcons();
  }
}

// ─── Preview & files ───

export function setPreviewSrc() {
  const url = `${API}/preview/${state.projectId}/index.html`;
  $("preview-iframe").src = url;
  $("open-new").href = url;
}

export function refreshPreview() {
  if (!state.projectId) return;
  const url = `${API}/preview/${state.projectId}/index.html?t=${Date.now()}`;
  $("preview-iframe").src = url;
  $("open-new").href = `${API}/preview/${state.projectId}/index.html`;
}

// ─── Live Server Preview ───

export function setServerPreview(baseUrl) {
  state.serverUrl = baseUrl;
  updateServerPane();
  // Cambiar automáticamente a la pestaña Servidor
  showTab("server");
}

export function refreshServerPreview() {
  if (!state.serverUrl) return;
  const url = state.serverUrl + (state.serverUrl.includes("?") ? "&" : "?") + "_t=" + Date.now();
  $("server-iframe").src = url;
}

function updateServerPane() {
  const empty = $("server-empty");
  const live = $("server-live");
  const urlDisplay = $("server-url-display");
  if (!empty || !live) return;
  if (state.serverUrl) {
    empty.classList.add("hidden");
    empty.classList.remove("flex");
    live.classList.remove("hidden");
    live.classList.add("flex");
    if (urlDisplay) urlDisplay.textContent = state.serverUrl;
    $("server-iframe").src = state.serverUrl;
  } else {
    empty.classList.remove("hidden");
    empty.classList.add("flex");
    live.classList.add("hidden");
    live.classList.remove("flex");
    $("server-iframe").src = "";
  }
}

export function setDevice(d) {
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

export function showTab(tab) {
  const preview = tab === "preview";
  const server = tab === "server";
  const code = tab === "code";
  $("preview-pane").classList.toggle("hidden", !preview);
  $("preview-pane").classList.toggle("flex", preview);
  $("server-pane").classList.toggle("hidden", !server);
  $("server-pane").classList.toggle("flex", server);
  $("code-pane").classList.toggle("hidden", !code);
  $("code-pane").classList.toggle("flex", code);
  $("tab-preview").className = `text-xs font-medium px-2.5 py-1 rounded ${preview ? "text-white" : "text-zinc-500 hover:text-white"} transition-colors`;
  $("tab-server").className = `text-xs font-medium px-2.5 py-1 rounded ${server ? "text-white" : "text-zinc-500 hover:text-white"} transition-colors`;
  $("tab-code").className = `text-xs font-medium px-2.5 py-1 rounded ${code ? "text-white" : "text-zinc-500 hover:text-white"} transition-colors`;
  if (code) loadFiles();
}

export async function loadFiles() {
  if (!state.projectId) return;
  const res = await fetch(`${API}/projects/${state.projectId}/files`);
  const data = await res.json();
  const el = $("file-list");
  const countEl = $("file-count");
  if (countEl) countEl.textContent = data.files.length ? String(data.files.length) : "";
  if (!data.files.length) {
    el.innerHTML = `<div class="px-3 py-2 text-xs text-zinc-600">Sin archivos aún</div>`;
    return;
  }
  el.innerHTML = data.files
    .map((f) => {
      const active = f === state.activeFile;
      return `<div class="file-list-item flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-100 cursor-pointer transition-colors ${active ? "bg-zinc-200/60 text-zinc-900" : "text-zinc-500 hover:text-zinc-800"}" data-file-path="${escapeHtml(f)}" onclick="Cosmo.viewFile('${f.replace(/'/g, "\\'")}')">
        <i data-lucide="file" class="w-3.5 h-3.5 shrink-0"></i> <span class="truncate">${escapeHtml(f)}</span>
      </div>`;
    })
    .join("");
  window.lucide && lucide.createIcons();
}

export async function viewFile(path) {
  const res = await fetch(`${API}/projects/${state.projectId}/file?path=${encodeURIComponent(path)}`);
  const data = await res.json();
  const content = data.content || "";
  state.activeFile = path;

  const pathEl = $("code-file-path");
  if (pathEl) pathEl.textContent = path;
  const copyBtn = $("code-copy-btn");
  if (copyBtn) { copyBtn.classList.remove("hidden"); copyBtn.classList.add("flex"); }

  const lines = content.length ? content.split("\n") : [""];
  const lineNumbersEl = $("code-line-numbers");
  if (lineNumbersEl) lineNumbersEl.textContent = lines.map((_, i) => i + 1).join("\n");
  $("code-view").textContent = content;

  document.querySelectorAll("#file-list .file-list-item").forEach((item) => {
    const active = item.dataset.filePath === path;
    item.classList.toggle("bg-zinc-200/60", active);
    item.classList.toggle("text-zinc-900", active);
    item.classList.toggle("text-zinc-500", !active);
  });
}

export function copyCurrentFile() {
  const el = $("code-view");
  const text = el ? el.textContent : "";
  if (!text || !navigator.clipboard) return;
  navigator.clipboard.writeText(text);
}

// ─── Project type & ZIP ───

export function setProjectType(type) {
  state.projectType = type === "proyecto" ? "proyecto" : "app";
  const isProyecto = state.projectType === "proyecto";
  const appBtn = $("workflow-app-btn");
  const proyectoBtn = $("workflow-proyecto-btn");
  [appBtn, proyectoBtn].forEach((btn) => {
    if (!btn) return;
    const active = btn === (isProyecto ? proyectoBtn : appBtn);
    btn.classList.toggle("bg-white", active);
    btn.classList.toggle("shadow-sm", active);
    btn.classList.toggle("text-zinc-900", active);
    btn.classList.toggle("text-zinc-400", !active);
  });
  const hint = $("landing-workflow-hint");
  if (hint) hint.innerHTML = WORKFLOW_HINTS[state.projectType];
  const zipMenuItem = $("landing-zip-menu-item");
  if (zipMenuItem) {
    zipMenuItem.classList.toggle("hidden", !isProyecto);
    zipMenuItem.classList.toggle("flex", isProyecto);
  }
  if (!isProyecto) removeProjectZip();
}

export function renderZipChip() {
  const row = $("landing-zip-row");
  if (!row) return;
  if (!state.projectZipFile) {
    row.innerHTML = "";
    row.classList.add("hidden");
    row.classList.remove("flex");
    return;
  }
  row.classList.remove("hidden");
  row.classList.add("flex");
  row.innerHTML = `<div class="flex items-center gap-1.5 bg-zinc-100 border border-zinc-200 rounded-full pl-3 pr-1.5 py-1 text-xs text-zinc-700">
    <i data-lucide="folder-up" class="w-3.5 h-3.5 text-zinc-500 shrink-0"></i>
    <span class="truncate max-w-[220px]">${escapeHtml(state.projectZipFile.name)}</span>
    <button onclick="Cosmo.removeProjectZip()" class="p-0.5 rounded-full hover:bg-zinc-200 text-zinc-400 hover:text-zinc-700 transition-colors shrink-0 bg-transparent border-0 cursor-pointer">
      <i data-lucide="x" class="w-3 h-3"></i>
    </button>
  </div>`;
  window.lucide && lucide.createIcons();
}

export function removeProjectZip() {
  state.projectZipFile = null;
  const input = $("landing-zip-input");
  if (input) input.value = "";
  renderZipChip();
}

export async function uploadProjectZip(pid, file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/projects/${pid}/import-zip`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Error al importar el proyecto");
  }
  return res.json();
}

// ─── Carpeta Conectada ───

export function connectFolder() {
  showConnectFolderModal((newPath) => {
    if (!newPath) return;
    state.externalPath = newPath;
    removeProjectZip();
    renderPathChip();
  });
}

export function removeExternalPath() {
  state.externalPath = null;
  renderPathChip();
}

export function renderPathChip() {
  const row = $("landing-path-row");
  if (!row) return;
  if (!state.externalPath) {
    row.innerHTML = "";
    row.classList.add("hidden");
    row.classList.remove("flex");
    return;
  }
  row.classList.remove("hidden");
  row.classList.add("flex");
  row.innerHTML = `<div class="flex items-center gap-1.5 bg-zinc-100 border border-zinc-200 rounded-full pl-3 pr-1.5 py-1 text-xs text-zinc-700">
    <i data-lucide="link-2" class="w-3.5 h-3.5 text-zinc-500 shrink-0"></i>
    <span class="truncate max-w-[280px]" title="${escapeHtml(state.externalPath)}">${escapeHtml(state.externalPath)}</span>
    <button onclick="Cosmo.removeExternalPath()" class="p-0.5 rounded-full hover:bg-zinc-200 text-zinc-400 hover:text-zinc-700 transition-colors shrink-0 bg-transparent border-0 cursor-pointer">
      <i data-lucide="x" class="w-3 h-3"></i>
    </button>
  </div>`;
  window.lucide && lucide.createIcons();
}

// ─── Composer & Streaming ───

export function setupComposer() {
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

function setSending(on) {
  const btn = $("send-btn");
  if (btn) btn.disabled = on;
  const agentPane = $("workspace-agent-pane");
  if (agentPane) agentPane.classList.toggle("jarvis-scanning", on);
}

export function buildMessageText(prompt, imagePaths, videoPath) {
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

export async function sendFromComposer() {
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

export async function startFromLanding() {
  const rawPrompt = $("landing-prompt").value.trim();
  const prompt = rawPrompt || (state.externalPath ? "Analiza el proyecto conectado y preséntame un diagnóstico." : "");
  if (!prompt) return;
  const btn = $("landing-build");
  btn.disabled = true;

  const createBody = { name: rawPrompt.slice(0, 50) || null, model: state.model, project_type: state.projectType };
  if (state.externalPath) createBody.external_path = state.externalPath;

  const res = await fetch(`${API}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createBody),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Error al crear el proyecto");
    btn.disabled = false;
    return;
  }
  const proj = await res.json();
  state.projectId = proj.id;
  removeExternalPath();
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

  let zipNote = "";
  if (state.projectType === "proyecto" && state.projectZipFile) {
    const zipName = state.projectZipFile.name;
    try {
      const zipResult = await uploadProjectZip(proj.id, state.projectZipFile);
      zipNote = `[📦 Proyecto existente adjuntado ('${zipName}'): ${zipResult.count} archivo(s) importado(s) al workspace. Audítalo primero, según las instrucciones de Modo Auditoría, antes de proponer o aplicar cambios.]\n\n`;
    } catch (e) {
      zipNote = `[⚠️ No se pudo importar el proyecto adjunto '${zipName}': ${e.message}]\n\n`;
    }
    removeProjectZip();
  }

  clearMediaState();
  renderMediaPreviews("media-previews");
  await streamMessage(zipNote + buildMessageText(prompt, imagePaths, videoPath), imagesB64);
}

export async function openProject(pid) {
  const res = await fetch(`${API}/projects/${pid}`);
  const data = await res.json();
  state.projectId = pid;
  if (window._applyModelToUI) window._applyModelToUI(data.project.model || state.model);
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

export async function deleteProject(pid) {
  let projectName = "este proyecto";
  const card = document.querySelector(`#recent-projects [onclick*="'${pid}'"]`)
            || document.querySelector(`#sidebar-project-list [data-project-id="${pid}"]`);
  if (card) {
    const nameEl = card.querySelector("span.truncate, .text-sm.truncate");
    if (nameEl) projectName = nameEl.textContent.trim();
  }

  showConfirmModal({
    title: "¿Eliminar proyecto?",
    messageHtml: `El proyecto <span class="font-medium text-zinc-800">“${escapeHtml(projectName)}”</span> se eliminará permanentemente. Esta acción no se puede deshacer.`,
    confirmLabel: "Eliminar",
    onConfirm: async () => {
      await fetch(`${API}/projects/${pid}`, { method: "DELETE" });
      if (window._loadRecent) window._loadRecent();
      if (state.sidebarMode === "code" && window._loadSidebarProjects) window._loadSidebarProjects();
    },
  });
}

async function streamMessage(text, imagesB64) {
  if (state.streaming) return;
  state.streaming = true;
  setSending(true);
  const attachCount = imagesB64 && imagesB64.length > 0 ? imagesB64.length : 0;
  let effectiveImages = attachCount > 0 ? imagesB64 : null;
  const isDeepSeek = state.model && state.model.startsWith("deepseek");

  addUserBubble(text + (attachCount > 0 ? `  📎 [${attachCount} archivo(s) adjunto(s)]` : ""));
  startAssistantTurn();
  showAgentStatus(true);

  if (attachCount > 0 && isDeepSeek) {
    appendText("⚠️ Los modelos DeepSeek no tienen capacidad de visión y no pueden procesar imágenes. Las imágenes adjuntadas serán ignoradas en esta solicitud. Considera usar Claude u OpenAI para trabajar con imágenes.\n\n");
    effectiveImages = null;
  }

  try {
    const res = await fetch(`${API}/projects/${state.projectId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, model: state.model, images_base64: effectiveImages }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `Error del servidor (${res.status})`);
    }
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
    const badge = $("agent-phase-badge");
    if (badge) { badge.classList.add("hidden"); badge.classList.remove("flex"); }
    loadFiles();
    refreshPreview();
  }
}

function handleEvent(ev) {
  switch (ev.type) {
    case "text_delta": appendText(ev.content); break;
    case "phase": addPhaseBadge(ev.agent, ev.label, ev.message); break;
    case "tool_start":
      if (ev.name === "set_phase") break;
      addToolCard(ev.id, ev.name);
      break;
    case "tool_result": updateToolCard(ev.id, ev.name, ev.path, ev.ok, ev.result);
      // Si serve_and_test tuvo éxito, mostrar el servidor en vivo
      if (ev.name === "serve_and_test" && ev.ok && ev.result && ev.result.base_url) {
        setServerPreview(ev.result.base_url);
      }
      break;
    case "preview_update": refreshPreview(); loadFiles(); break;
    case "message_done": finalizeCurrentText(); break;
    case "error": resolvePendingTools(); appendText("\n⚠️ " + friendlyError(ev.message, "build")); break;
  }
}

// ─── Sidebar projects ───

export async function loadSidebarProjects() {
  const el = $("sidebar-project-list");
  if (!el) return;
  const res = await fetch(`${API}/projects`);
  const items = await res.json();
  if (!items.length) {
    el.innerHTML = `<div class="px-3 py-2 text-xs text-zinc-400">Sin proyectos aún</div>`;
    return;
  }
  el.innerHTML = items
    .map((p) => {
      const active = p.id === state.projectId;
      const isProyecto = p.project_type === "proyecto";
      const icon = p.external_path ? "link-2" : (isProyecto ? "folder-tree" : "layout-template");
      const title = p.external_path ? `Carpeta conectada: ${p.external_path}` : (isProyecto ? "Proyecto estructurado" : "App rápida");
      return `<div class="sidebar-project-item group flex items-center justify-between gap-1 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${active ? "bg-zinc-200/60 text-zinc-900" : "text-zinc-600 hover:bg-zinc-100"}" data-project-id="${p.id}" onclick="Cosmo.openProject('${p.id}')">
        <span class="truncate flex items-center gap-2 min-w-0" title="${title}"><i data-lucide="${icon}" class="w-3.5 h-3.5 shrink-0 text-zinc-400"></i><span class="truncate">${escapeHtml(p.name)}</span></span>
        <button onclick="event.stopPropagation();Cosmo.deleteProject('${p.id}')" class="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-opacity shrink-0">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>`;
    })
    .join("");
  window.lucide && lucide.createIcons();
}

// ─── Media upload ───

export function clearMediaState() {
  state.imageFiles = [];
  state.videoFile = null;
}

export function renderMediaPreviews(containerId) {
  const container = $(containerId);
  if (!container) return;
  const hasMedia = state.imageFiles.length > 0 || state.videoFile;
  container.innerHTML = "";
  container.classList.toggle("hidden", !hasMedia);
  if (!hasMedia) return;

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

  if (state.imageFiles.length > 0) {
    const badge = document.createElement("div");
    badge.className = "inline-flex items-center self-center text-[10px] font-mono text-zinc-500 px-1";
    badge.textContent = `${state.imageFiles.length}/${MAX_IMAGES}`;
    container.appendChild(badge);
  }

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
  window.lucide && lucide.createIcons();
}

export function removeImage(idx, containerId) {
  URL.revokeObjectURL(state.imageFiles[idx]);
  state.imageFiles.splice(idx, 1);
  renderMediaPreviews(containerId);
}

export function removeVideo(containerId) {
  state.videoFile = null;
  renderMediaPreviews(containerId);
}

export async function uploadImages(pid, files) {
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

export async function uploadVideo(pid, file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/projects/${pid}/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error("Error al subir el video");
  const data = await res.json();
  return data.path;
}

export async function getImagesBase64(files) {
  const MAX_DIM = 1568;
  const results = await Promise.all(
    files.map((file) =>
      new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let w = img.naturalWidth, h = img.naturalHeight;
          if (w > MAX_DIM || h > MAX_DIM) {
            const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]);
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        img.src = url;
      })
    )
  );
  return results.filter(Boolean);
}

export function extractVideoFrame(file) {
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

// ─── Floating dropdown setup ───

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

export function setupMediaDropdowns() {
  ["landing-media-dropdown", "media-dropdown"].forEach((dropdownId) =>
    setupFloatingDropdown(dropdownId.replace("-dropdown", "-btn"), dropdownId.replace("-dropdown", "-menu"), "media-floating-menu", "140px")
  );
}
