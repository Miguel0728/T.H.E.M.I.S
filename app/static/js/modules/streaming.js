/* T.H.E.M.I.S. — Renderizado de burbujas de chat, tool cards y SSE. */
import { state, API } from "./state.js";
import { $, escapeHtml, scrollChat } from "./utils.js";
import { TOOL_META } from "./state.js";

export function addUserBubble(text, targetId = "chat-scroll") {
  const wrap = document.createElement("div");
  wrap.className = "flex flex-col gap-1 mb-6 px-4 md:px-6 items-end slide-up";
  wrap.innerHTML = `<div class="self-end max-w-[85%] holo-bubble-user bg-zinc-900 text-white border border-zinc-800 rounded-2xl rounded-tr-sm px-4 py-3 text-base whitespace-pre-wrap">${escapeHtml(text)}</div>`;
  $(targetId).appendChild(wrap);
  scrollChat(targetId);
}

export function startAssistantTurn(targetId = "chat-scroll", label = "THEMIS") {
  const wrap = document.createElement("div");
  wrap.className = "flex flex-col gap-1 mb-6 px-4 md:px-6 slide-up";

  const badgeHtml = label === "THEMIS"
    ? `<span class="px-2.5 py-1 rounded-full border border-cyan-500/25 bg-cyan-950/20 text-[10px] font-heading uppercase tracking-widest text-cyan-400 flex items-center gap-1.5 shadow-[0_0_15px_rgba(36,207,255,0.06)]">
        <span class="jarvis-glow-ring"><span class="jarvis-dot"></span></span> ${escapeHtml(label)}
       </span>`
    : `<span class="px-2 py-0.5 rounded-full border border-zinc-200 bg-zinc-100 text-[10px] font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-1">
        <i data-lucide="sparkles" class="w-3 h-3"></i> ${escapeHtml(label)}
       </span>`;

  wrap.innerHTML = `<div class="flex items-center gap-2 mb-1">
      ${badgeHtml}
    </div>
    <div class="turn-body flex flex-col gap-2 w-full text-base"></div>
    <div class="turn-actions flex items-center gap-2 mt-2"></div>`;
  $(targetId).appendChild(wrap);
  state.turnEl = wrap.querySelector(".turn-body");
  state.turnActionsEl = wrap.querySelector(".turn-actions");
  state.currentTextEl = null;
  window.lucide && lucide.createIcons();
  scrollChat(targetId);
}

export function finalizeCurrentText() {
  if (state.currentTextEl) {
    state.currentTextEl.classList.remove("cursor-blink");
    const rawText = state.currentTextEl.textContent;
    state.currentTextEl.classList.remove("whitespace-pre-wrap");
    state.currentTextEl.classList.add("markdown-content");
    if (window.marked) {
      state.currentTextEl.innerHTML = marked.parse(rawText);
      // Post-procesar enlaces para garantizar que sean clickeables
      if (window._sanitizeChatLinks) window._sanitizeChatLinks(state.currentTextEl);
    }
    state.currentTextEl = null;
  }
}

export function appendText(content) {
  if (!state.currentTextEl) {
    const p = document.createElement("div");
    p.className = "text-zinc-700 leading-relaxed whitespace-pre-wrap cursor-blink";
    state.turnEl.appendChild(p);
    state.currentTextEl = p;
  }
  state.currentTextEl.textContent += content;
  scrollChat();
}

export function addPhaseBadge(_agent, label, message) {
  finalizeCurrentText();
  const el = document.createElement("div");
  el.className = "flex items-center gap-2 mt-1 fade-in";
  el.innerHTML = `<span class="px-2 py-0.5 rounded-full bg-zinc-100 border border-zinc-200 text-[10px] font-mono uppercase tracking-widest text-zinc-600">${escapeHtml(label)}</span>
    <span class="text-xs text-zinc-400">${escapeHtml(message || "")}</span>`;
  state.turnEl.appendChild(el);
  setAgentStatus(label + (message ? " · " + message : ""));
  const badge = $("agent-phase-badge");
  const badgeLabel = $("agent-phase-label");
  if (badge && badgeLabel) {
    badgeLabel.textContent = label;
    badge.classList.remove("hidden");
    badge.classList.add("flex");
  }
  scrollChat();
}

export function setAgentStatus(text) {
  const el = $("agent-status-text");
  if (el) el.textContent = text;
}

export function showAgentStatus(on) {
  const el = $("agent-status");
  if (!el) return;
  el.classList.toggle("hidden", !on);
  el.classList.toggle("flex", on);
}

export function addToolCard(id, name, targetId = "chat-scroll") {
  finalizeCurrentText();
  state.pendingToolIds.add(id);
  const meta = TOOL_META[name] || { icon: "wrench", label: name };
  const card = document.createElement("div");
  card.className = "tool-card holo-tool-card border border-zinc-200 bg-zinc-50 rounded-lg overflow-hidden font-mono fade-in";
  card.innerHTML = `<div class="flex items-center justify-between px-3 py-2 border-b border-zinc-200 bg-zinc-100 text-xs text-zinc-600">
      <span class="flex items-center gap-2"><i data-lucide="${meta.icon}" class="w-3.5 h-3.5"></i> ${meta.label} <span class="tool-path text-zinc-400"></span></span>
      <span class="tool-status"><i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i></span>
    </div>
    <div class="tool-body hidden p-3 text-xs text-zinc-600 bg-white"></div>`;
  state.turnEl.appendChild(card);
  state.toolCards[id] = card;
  window.lucide && lucide.createIcons();
  scrollChat(targetId);
}

export function resolvePendingTools() {
  state.pendingToolIds.forEach((id) => {
    const card = state.toolCards[id];
    if (card) {
      const status = card.querySelector(".tool-status");
      if (status) {
        status.innerHTML = `<i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-amber-500"></i>`;
        window.lucide && lucide.createIcons();
      }
    }
  });
  state.pendingToolIds.clear();
}

export function updateToolCard(id, name, path, ok, result, targetId = "chat-scroll") {
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
  } else if ((name === "get_news" || name === "search_news") && result && result.articles) {
    detail = result.articles.length
      ? result.articles.map((a) => "• " + a.title).join("\n")
      : "Sin resultados.";
  } else if (name === "web_search" && result && result.results) {
    detail = result.results.length
      ? result.results.map((r) => "• " + r.title).join("\n")
      : "Sin resultados.";
  } else if (name === "fetch_page" && result) {
    detail = ok ? (result.content || "").slice(0, 300) + "…" : "";
  } else if (name === "get_weather" && result && result.current) {
    const c = result.current;
    detail = `${result.location}: ${c.temperature_c}°C (sensación ${c.feels_like_c}°C), ${c.condition}`;
  }
  if (detail) {
    body.textContent = detail;
    body.classList.remove("hidden");
  }
  window.lucide && lucide.createIcons();
  scrollChat(targetId);
}

export function addStaticAssistant(text, targetId = "chat-scroll") {
  const wrap = document.createElement("div");
  wrap.className = "flex flex-col gap-1 mb-6 px-4 md:px-6";
  const contentHtml = window.marked ? marked.parse(text) : escapeHtml(text);
  const contentClass = window.marked ? "markdown-content" : "whitespace-pre-wrap";
  wrap.innerHTML = `<div class="flex items-center gap-2 mb-1">
      <span class="px-2 py-0.5 rounded-full border border-zinc-200 bg-zinc-100 text-[10px] font-mono uppercase tracking-widest text-zinc-500">THEMIS</span>
    </div>
    <div class="text-zinc-700 leading-relaxed text-base ${contentClass}">${contentHtml}</div>
    <div class="turn-actions flex items-center gap-2 mt-2"></div>`;
  $(targetId).appendChild(wrap);
  // Post-procesar enlaces para garantizar que sean clickeables
  if (window.marked && window._sanitizeChatLinks) {
    const contentEl = wrap.querySelector('.markdown-content');
    if (contentEl) window._sanitizeChatLinks(contentEl);
  }
}
