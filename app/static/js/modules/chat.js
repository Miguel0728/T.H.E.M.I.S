/* T.H.E.M.I.S. — Modo Chat: conversaciones, imágenes, drawer. */
import { API, MAX_IMAGES, state, chatState, closeAllFloatingMenus } from "./state.js";
import { $, escapeHtml, friendlyError, scrollChat, formatNewsDate } from "./utils.js";
import { showDeleteConfirmModal } from "./modals.js";
import {
  addUserBubble, startAssistantTurn, finalizeCurrentText, appendText,
  addToolCard, updateToolCard, resolvePendingTools
} from "./streaming.js";

// ─── System Briefing Modal (pop-up: carrusel de noticias) ───
// Cada slide es UNA noticia (imagen grande arriba + descripción abajo). El
// número de slides es dinámico: uno por noticia recibida de /chat/banner.

let saCurrentSlide = 0;
let saTotalSlides = 0;

export function initChatBanner() {
  const overlay = $("system-alert-overlay");
  if (!overlay) return;

  // No mostrar si ya fue descartado en esta sesión
  try {
    if (sessionStorage.getItem("cosmo_sa_dismissed") === "1") return;
  } catch (_) { /* noop */ }

  // Mostrar el modal con estado de carga
  saCurrentSlide = 0;
  saTotalSlides = 0;
  overlay.classList.remove("hidden", "sa-closing");
  overlay.classList.add("loading");
  window.lucide && lucide.createIcons();

  // Cerrar al hacer click en el overlay (fuera del modal) o con Escape
  overlay.onclick = (e) => { if (e.target === overlay) dismissSystemAlert(); };
  document.addEventListener("keydown", saKeyHandler);

  fetch(`${API}/chat/banner`)
    .then((r) => r.json())
    .then((data) => {
      overlay.classList.remove("loading");
      renderSystemAlert(data);
      window.lucide && lucide.createIcons();
    })
    .catch(() => {
      overlay.classList.remove("loading");
      renderSystemAlert({ news_items: [] });
      window.lucide && lucide.createIcons();
    });
}

function saKeyHandler(e) {
  const overlay = $("system-alert-overlay");
  if (!overlay || overlay.classList.contains("hidden")) return;
  if (e.key === "Escape") dismissSystemAlert();
  else if (e.key === "ArrowRight") saSlide(1);
  else if (e.key === "ArrowLeft") saSlide(-1);
}

// Avanza/retrocede el carrusel; hace wrap-around en los extremos
export function saSlide(dir) {
  if (saTotalSlides <= 0) return;
  saCurrentSlide = (saCurrentSlide + dir + saTotalSlides) % saTotalSlides;
  saUpdateCarousel();
}

export function saGoTo(index) {
  if (saTotalSlides <= 0) return;
  saCurrentSlide = Math.max(0, Math.min(saTotalSlides - 1, index));
  saUpdateCarousel();
}

function saUpdateCarousel() {
  const track = $("sa-track");
  if (track) track.style.transform = `translateX(-${saCurrentSlide * 100}%)`;
  const dots = document.querySelectorAll("#sa-dots .sa-dot");
  dots.forEach((d, i) => d.classList.toggle("active", i === saCurrentSlide));

  // Oculta las flechas cuando hay una sola noticia (nada que deslizar)
  const nav = saTotalSlides > 1;
  const prev = $("sa-prev"), next = $("sa-next");
  if (prev) prev.style.visibility = nav ? "visible" : "hidden";
  if (next) next.style.visibility = nav ? "visible" : "hidden";
}

// Un slide = una noticia. Imagen grande (hero) arriba con chip de sección,
// y debajo fuente/fecha, titular y descripción + enlace a la nota completa.
function saNewsSlide(n) {
  const cat = n.category ? `<span class="sa-hero-chip">${escapeHtml(n.category)}</span>` : "";
  const meta = [n.source, formatNewsDate(n.publishedAt)].filter(Boolean).map(escapeHtml).join(" · ");
  const desc = n.description
    ? `<p class="sa-news-desc">${escapeHtml(n.description)}</p>`
    : "";
  const link = n.url
    ? `<a class="sa-slide-link" href="${escapeHtml(n.url)}" target="_blank" rel="noopener noreferrer">
         Leer noticia completa <i data-lucide="external-link" class="w-3 h-3"></i>
       </a>`
    : "";
  const hero = n.image
    ? `<div class="sa-news-hero"><img src="${escapeHtml(n.image)}" alt="" onerror="this.closest('.sa-news-hero').classList.add('sa-news-hero-fallback')" />${cat}</div>`
    : `<div class="sa-news-hero sa-news-hero-fallback">${cat}</div>`;
  return `<div class="sa-slide sa-slide-news">
    ${hero}
    <div class="sa-news-content">
      ${meta ? `<p class="sa-news-metaline">${meta}</p>` : ""}
      <h4 class="sa-news-headline">${escapeHtml(n.title || "Sin titular")}</h4>
      ${desc}
      ${link}
    </div>
  </div>`;
}

function renderSystemAlert(data) {
  const track = $("sa-track");
  const dots = $("sa-dots");
  const items = Array.isArray(data.news_items) && data.news_items.length
    ? data.news_items
    : (data.news ? [data.news] : []);

  saCurrentSlide = 0;
  saTotalSlides = items.length;

  if (!track) return;

  if (!items.length) {
    track.innerHTML = `<div class="sa-slide sa-slide-news"><div class="sa-news-empty">No hay noticias disponibles en este momento.</div></div>`;
    if (dots) dots.innerHTML = "";
    saTotalSlides = 1;
    saUpdateCarousel();
    return;
  }

  track.innerHTML = items.map(saNewsSlide).join("");
  if (dots) {
    dots.innerHTML = items.map((_, i) =>
      `<button class="sa-dot${i === 0 ? " active" : ""}" onclick="Cosmo.saGoTo(${i})" aria-label="Ir a noticia ${i + 1}"></button>`
    ).join("");
  }
  saUpdateCarousel();

  // Leer los titulares en voz alta con J.A.R.V.I.S. al cargar
  ttsReadNewsHeadlines(items);
}

/**
 * Lee los titulares del carrusel de noticias con la voz de J.A.R.V.I.S.
 * usando el endpoint TTS de Fish Audio. Silencioso ante cualquier error.
 */
async function ttsReadNewsHeadlines(items) {
  if (!items || !items.length) return;

  // Construir un resumen hablado: "Buenos días señor. 3 noticias: titular 1. titular 2. titular 3."
  const headlines = items.map((n, i) => `${i + 1}: ${n.title || "sin titular"}`).join(". ");
  const greeting = "Buenos días, señor. Estas son las noticias de hoy. ";
  const text = greeting + headlines;

  // Truncar si excede los 2000 caracteres del límite de Fish Audio
  const finalText = text.length > 2000 ? text.slice(0, 1997) + "..." : text;

  try {
    const res = await fetch(`${API}/tts/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: finalText }),
    });

    if (!res.ok) return;

    const data = await res.json();
    if (data.audio_base64) {
      const audio = new Audio("data:audio/mp3;base64," + data.audio_base64);
      audio.volume = 0.85;
      audio.play().catch(() => {
        // Silencioso: autoplay puede estar bloqueado por el navegador
      });
    }
  } catch (_) {
    // Silencioso: el TTS es opcional, no debe interrumpir la experiencia
  }
}

export function dismissSystemAlert() {
  const overlay = $("system-alert-overlay");
  if (!overlay || overlay.classList.contains("hidden")) return;
  overlay.classList.add("sa-closing");
  document.removeEventListener("keydown", saKeyHandler);
  setTimeout(() => {
    overlay.classList.add("hidden");
    overlay.classList.remove("sa-closing");
  }, 260);
  try { sessionStorage.setItem("cosmo_sa_dismissed", "1"); } catch (_) { /* noop */ }
}

export function dismissChatBanner() {
  // Compatibilidad con código antiguo — redirige al nuevo nombre
  dismissSystemAlert();
}

// ─── Chat drawer ───

export function toggleChatDrawer(forceOpen) {
  const drawer = $("right-chat-drawer");
  const backdrop = $("chat-drawer-backdrop");
  if (!drawer || !backdrop) return;
  const isMobile = window.innerWidth < 768;
  const willOpen = forceOpen !== undefined ? forceOpen : (isMobile ? drawer.classList.contains("translate-x-full") : drawer.classList.contains("pane-collapsed"));
  if (isMobile) {
    drawer.classList.remove("pane-collapsed");
    drawer.classList.toggle("translate-x-full", !willOpen);
  } else {
    drawer.classList.remove("translate-x-full");
    drawer.classList.toggle("pane-collapsed", !willOpen);
  }
  backdrop.classList.toggle("hidden", !willOpen);
}

export function toggleChatMode() { toggleChatDrawer(); }

// ─── Empty / thread state ───

export function showChatEmptyState() {
  $("chat-thread").classList.add("hidden");
  $("chat-thread").classList.remove("flex");
  $("chat-empty").classList.remove("hidden");
  $("chat-empty").classList.add("flex");
}

export function showChatThreadState() {
  $("chat-empty").classList.add("hidden");
  $("chat-empty").classList.remove("flex");
  $("chat-thread").classList.remove("hidden");
  $("chat-thread").classList.add("flex");
}

// ─── Sidebar ───

export function toggleChatSidebar(forceOpen) {
  const sidebar = $("chat-sidebar");
  const backdrop = $("chat-sidebar-backdrop");
  const willOpen = forceOpen !== undefined ? forceOpen : sidebar.classList.contains("-translate-x-full");
  sidebar.classList.toggle("-translate-x-full", !willOpen);
  backdrop.classList.toggle("hidden", !willOpen);
}

// ─── Chat list ───

export async function loadChatList() {
  const res = await fetch(`${API}/chats`);
  const items = await res.json();
  const el = $("chat-list");
  if (!items.length) {
    el.innerHTML = `<div class="px-3 py-2 text-xs text-zinc-400">Sin conversaciones aún</div>`;
    return;
  }
  el.innerHTML = items.map((c) => `<div class="chat-list-item group flex items-center justify-between gap-1 px-3 py-2 rounded-lg cursor-pointer text-sm text-zinc-600 hover:bg-zinc-100 transition-colors" data-chat-id="${c.id}" onclick="Cosmo.openChat('${c.id}')">
    <span class="truncate">${escapeHtml(c.name)}</span>
    <button onclick="event.stopPropagation();Cosmo.deleteChat('${c.id}')" class="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-opacity shrink-0">
      <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
    </button>
  </div>`).join("");
  window.lucide && lucide.createIcons();
  highlightActiveChatInList(chatState.chatId);
}

export function highlightActiveChatInList(cid) {
  document.querySelectorAll("#chat-list .chat-list-item").forEach((el) => {
    const active = cid && el.dataset.chatId === cid;
    el.classList.toggle("bg-zinc-100", active);
    el.classList.toggle("text-zinc-900", active);
  });
}

export async function openChat(cid) {
  const res = await fetch(`${API}/chats/${cid}`);
  if (!res.ok) return;
  const data = await res.json();
  toggleChatDrawer(true);
  chatState.chatId = cid;
  if (window._applyModelToUI) window._applyModelToUI(data.chat.model || state.model);
  $("chat-thread-scroll").innerHTML = "";
  if (window._hideNewsPanel) window._hideNewsPanel();
  showChatThreadState();
  data.messages.forEach((m) => {
    if (m.role === "user") addUserBubble(m.content, "chat-thread-scroll");
    else {
      const wrap = document.createElement("div");
      wrap.className = "flex flex-col gap-1 mb-6 px-4 md:px-6";
      const contentHtml = window.marked ? marked.parse(m.content) : escapeHtml(m.content);
      const contentClass = window.marked ? "markdown-content" : "whitespace-pre-wrap";
      wrap.innerHTML = `<div class="flex items-center gap-2 mb-1"><span class="px-2 py-0.5 rounded-full border border-zinc-200 bg-zinc-100 text-[10px] font-mono uppercase tracking-widest text-zinc-500">THEMIS</span></div><div class="text-zinc-700 leading-relaxed text-base ${contentClass}">${contentHtml}</div><div class="turn-actions flex items-center gap-2 mt-2"></div>`;
      $("chat-thread-scroll").appendChild(wrap);
      // Post-procesar enlaces para garantizar que sean clickeables
      if (window.marked && window._sanitizeChatLinks) {
        const contentEl = wrap.querySelector('.markdown-content');
        if (contentEl) window._sanitizeChatLinks(contentEl);
      }
    }
  });
  scrollChat("chat-thread-scroll");
  highlightActiveChatInList(cid);
  if (window._highlightNavSection) window._highlightNavSection("chats");
  toggleChatSidebar(false);
}

export async function deleteChat(cid) {
  const chatItem = document.querySelector(`#chat-list [data-chat-id="${cid}"]`);
  const chatName = chatItem ? chatItem.querySelector("span.truncate").textContent : "esta conversación";
  showDeleteConfirmModal(chatName, async () => {
    await fetch(`${API}/chats/${cid}`, { method: "DELETE" });
    if (chatState.chatId === cid) newChatView();
    loadChatList();
  });
}

export async function createChatConversation(name) {
  const res = await fetch(`${API}/chats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.slice(0, 50), model: state.model }),
  });
  return res.json();
}

// ─── New chat view ───

export function newChatView() {
  chatState.chatId = null;
  $("chat-start-input").value = "";
  $("chat-thread-scroll").innerHTML = "";
  if (window._hideNewsPanel) window._hideNewsPanel();
  showChatEmptyState();
  highlightActiveChatInList(null);
  if (window._highlightNavSection) window._highlightNavSection("chats");
  toggleChatSidebar(false);
}

// ─── Image mode ───

export function toggleChatImageMode(active) {
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
    </span>` : "";
  if (startBadges) { startBadges.innerHTML = badgeHtml; startBadges.classList.toggle("hidden", !active); startBadges.classList.toggle("flex", active); }
  if (threadBadges) { threadBadges.innerHTML = badgeHtml; threadBadges.classList.toggle("hidden", !active); threadBadges.classList.toggle("flex", active); }
  const startInput = $("chat-start-input");
  const composerInput = $("chat-composer-input");
  if (startInput) startInput.placeholder = active ? "Describe la imagen que quieres crear..." : "Escribe un mensaje...";
  if (composerInput) composerInput.placeholder = active ? "Describe la imagen que quieres crear..." : "Escribe un mensaje...";
  window.lucide && lucide.createIcons();
}

// ─── Image generation ───

export async function generateChatImage() {
  const inEmptyState = !$("chat-empty").classList.contains("hidden");
  const ta = inEmptyState ? $("chat-start-input") : $("chat-composer-input");
  const prompt = ta.value.trim();
  if (!prompt || chatState.streaming) return;

  const imgFiles = [...chatState.imageFiles];
  const imagesB64 = imgFiles.length > 0 ? await getChatImagesBase64(imgFiles) : [];

  ta.value = "";
  if (!inEmptyState) ta.style.height = "auto";
  clearChatMediaState();

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
      body: JSON.stringify({ prompt, images_base64: imagesB64 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Error generando la imagen");
    resolveImageBubble(bodyEl, data.image_url, null);
  } catch (e) {
    console.error("THEMIS error (generar imagen):", e.message);
    resolveImageBubble(bodyEl, null, e.message || "No pude generar la imagen. Intenta de nuevo en un momento.");
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
  const drawer = $("right-chat-drawer");
  if (drawer) drawer.classList.toggle("jarvis-scanning", on);
}

function addImageLoadingBubble(targetId) {
  const wrap = document.createElement("div");
  wrap.className = "flex flex-col gap-1 mb-6 px-4 md:px-6 slide-up";
  wrap.innerHTML = `<div class="flex items-center gap-2 mb-1">
      <span class="px-2 py-0.5 rounded-full border border-cyan-500/25 bg-cyan-950/20 text-[10px] font-heading uppercase tracking-widest text-cyan-400 flex items-center gap-1">
        <i data-lucide="image" class="w-3 h-3"></i> THEMIS
      </span>
    </div>
    <div class="image-result-body flex items-center gap-3 text-sm text-zinc-400 py-4">
      <div class="relative w-8 h-8 flex items-center justify-center shrink-0">
        <div class="absolute inset-0 rounded-full border border-dashed border-cyan-400/30 animate-[spin_10s_linear_infinite]"></div>
        <div class="absolute inset-1 rounded-full border border-cyan-400/60 border-t-transparent animate-[spin_1.2s_linear_infinite]"></div>
      </div>
      <span class="font-heading text-[10px] uppercase tracking-widest text-cyan-400 animate-pulse">Generando imagen…</span>
    </div>`;
  $(targetId).appendChild(wrap);
  window.lucide && lucide.createIcons();
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

// ─── Streaming ───

export async function streamChatMessage(text, imagesB64) {
  if (chatState.streaming) return;
  chatState.streaming = true;
  $("chat-send-btn").disabled = true;
  const drawer = $("right-chat-drawer");
  if (drawer) drawer.classList.add("jarvis-scanning");

  const attachCount = imagesB64 && imagesB64.length > 0 ? imagesB64.length : 0;
  let effectiveImages = attachCount > 0 ? imagesB64 : null;
  const isDeepSeek = state.model && state.model.startsWith("deepseek");

  addUserBubble(text + (attachCount > 0 ? `  📎 [${attachCount} imagen(es) adjunta(s)]` : ""), "chat-thread-scroll");
  startAssistantTurn("chat-thread-scroll", "THEMIS");

  if (attachCount > 0 && isDeepSeek) {
    appendText("⚠️ Los modelos DeepSeek no tienen capacidad de visión y no pueden procesar imágenes. Las imágenes adjuntadas serán ignoradas en esta solicitud. Considera usar Claude u OpenAI para trabajar con imágenes.\n\n");
    effectiveImages = null;
  }

  try {
    const res = await fetch(`${API}/chats/${chatState.chatId}/message`, {
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
        handleChatEvent(ev);
      }
    }
  } catch (e) {
    appendText("\n⚠️ " + friendlyError(e.message, "conexión chat"));
  } finally {
    resolvePendingTools();
    finalizeCurrentText();
    chatState.streaming = false;
    $("chat-send-btn").disabled = false;
    if (drawer) drawer.classList.remove("jarvis-scanning");
    scrollChat("chat-thread-scroll");
  }
}

function handleChatEvent(ev) {
  switch (ev.type) {
    case "text_delta": appendText(ev.content); break;
    case "tool_start": addToolCard(ev.id, ev.name, "chat-thread-scroll"); break;
    case "tool_result": updateToolCard(ev.id, ev.name, ev.query, ev.ok, ev.result, "chat-thread-scroll"); break;
    case "message_done": finalizeCurrentText(); break;
    case "error": resolvePendingTools(); appendText("\n⚠️ " + friendlyError(ev.message, "chat")); break;
  }
}

// ─── Submit ───

export async function submitChatPrompt() {
  const ta = $("chat-start-input");
  const text = ta.value.trim();
  if (!text || chatState.streaming) return;
  if (chatState.imageMode) { await generateChatImage(); toggleChatImageMode(false); return; }

  const imgFiles = [...chatState.imageFiles];
  const imagesB64 = imgFiles.length > 0 ? await getChatImagesBase64(imgFiles) : [];
  ta.value = "";
  clearChatMediaState();

  const chatRow = await createChatConversation(text);
  chatState.chatId = chatRow.id;
  $("chat-thread-scroll").innerHTML = "";
  showChatThreadState();
  await streamChatMessage(text, imagesB64);
  loadChatList();
}

export async function sendFromChatComposer() {
  const ta = $("chat-composer-input");
  const text = ta.value.trim();
  if (!text || chatState.streaming) return;
  if (chatState.imageMode) { await generateChatImage(); toggleChatImageMode(false); return; }

  const imgFiles = [...chatState.imageFiles];
  const imagesB64 = imgFiles.length > 0 ? await getChatImagesBase64(imgFiles) : [];
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

// ─── Composer setup ───

export function setupChatComposer() {
  const ta = $("chat-composer-input");
  if (ta) {
    const auto = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 180) + "px"; };
    ta.addEventListener("input", auto);
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendFromChatComposer(); }
    });
  }
  const startTa = $("chat-start-input");
  if (startTa) {
    startTa.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitChatPrompt(); }
    });
  }
}

// ─── Tools dropdown ───

function positionFloatingMenu(btn, menu, minWidth) {
  const rect = btn.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - 6;
  const spaceAbove = rect.top - 6;
  if (spaceBelow >= spaceAbove) {
    menu.style.top = (rect.bottom + 6) + "px"; menu.style.bottom = "auto";
    menu.style.maxHeight = Math.max(spaceBelow, 80) + "px";
  } else {
    menu.style.bottom = (window.innerHeight - rect.top + 6) + "px"; menu.style.top = "auto";
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
    e.preventDefault(); e.stopPropagation();
    const isHidden = menu.classList.contains("hidden");
    closeAllFloatingMenus();
    if (isHidden) { positionFloatingMenu(btn, menu, minWidth); menu.classList.remove("hidden"); }
  });
}

export function setupChatToolsDropdowns() {
  ["chat-start-tools-dropdown", "chat-tools-dropdown"].forEach((dropdownId) =>
    setupFloatingDropdown(dropdownId.replace("-dropdown", "-btn"), dropdownId.replace("-dropdown", "-menu"), "chat-floating-menu", "160px")
  );
}

// ─── Chat media ───

export function clearChatMediaState() {
  chatState.imageFiles = [];
  renderChatMediaPreviews("chat-start-media");
  renderChatMediaPreviews("chat-composer-media");
}

export function renderChatMediaPreviews(containerId) {
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
      <button onclick="Cosmo.removeChatImage(${idx})" class="absolute -top-1.5 -right-1.5 bg-zinc-800 rounded-full p-0.5 border border-white/20 hover:bg-zinc-700 transition-colors">
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
  window.lucide && lucide.createIcons();
}

export function removeChatImage(idx) {
  URL.revokeObjectURL(chatState.imageFiles[idx]);
  chatState.imageFiles.splice(idx, 1);
  renderChatMediaPreviews("chat-start-media");
  renderChatMediaPreviews("chat-composer-media");
}

async function getChatImagesBase64(files) {
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
