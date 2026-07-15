/* T.H.E.M.I.S. — Utilidades DOM, formateo y helpers. */

export const $ = (id) => document.getElementById(id);

export function icons() {
  window.lucide && lucide.createIcons();
}

export function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function friendlyError(rawMessage, context = "") {
  console.error(`THEMIS error${context ? " (" + context + ")" : ""}:`, rawMessage);
  return "No pude completar esa acción. Intenta de nuevo en un momento.";
}

export function scrollChat(targetId = "chat-scroll") {
  const el = $(targetId);
  if (el) el.scrollTop = el.scrollHeight;
}

export function formatProjectDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (num) => String(num).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

export function formatNewsDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function formatUptime(seconds) {
  if (!seconds && seconds !== 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatTokenCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}
