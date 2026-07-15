/* T.H.E.M.I.S. — Entry point modular.
   Importa todos los módulos y expone la API pública en window.Cosmo
   para que los templates (onclick="Cosmo.xxx") sigan funcionando. */

// ─── Configuración de librerías externas ───
if (window.marked) {
  // Opciones del núcleo (gfm, breaks) se configuran con setOptions,
  // no con marked.use(), para compatibilidad con marked v4+ y v12+.
  marked.setOptions({ gfm: true, breaks: true });
  // El renderer personalizado sí va en marked.use() como extensión.
  marked.use({
    renderer: {
      link({ href, title, text }) {
        const titleAttr = title ? ` title="${title}"` : "";
        const safeHref = href || text;
        return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`;
      }
    }
  });
}

// ─── Helper: post-procesa HTML para garantizar que todo <a> sea clickeable ───
window._sanitizeChatLinks = function(rootEl) {
  if (!rootEl) return;
  rootEl.querySelectorAll('a').forEach((a) => {
    // Si no tiene href, intentar usar el texto como URL
    if (!a.getAttribute('href') || a.getAttribute('href') === '#') {
      const txt = a.textContent.trim();
      if (/^https?:\/\/.+/.test(txt)) {
        a.setAttribute('href', txt);
      }
    }
    // Garantizar target y rel
    if (!a.getAttribute('target')) a.setAttribute('target', '_blank');
    if (!a.getAttribute('rel')) a.setAttribute('rel', 'noopener noreferrer');
  });
};

// ─── Delegación global: todo clic en enlaces del chat los abre ───
document.addEventListener('click', function(e) {
  const anchor = e.target.closest('a');
  if (!anchor) return;
  // Intercepta enlaces dentro del thread del chat
  if (!anchor.closest('#chat-thread-scroll')) return;
  const url = anchor.getAttribute('href');
  if (url && url !== '#' && /^https?:\/\//.test(url)) {
    e.preventDefault();
    window.open(url, '_blank', 'noopener,noreferrer');
  }
});

// ─── Inicialización (ejecuta init() al cargar) ───
import "./modules/init.js";

// ─── Puentes cross-módulo ───
import { applyModelToUI, loadRecent, applySidebarMode, triggerTechLoading } from "./modules/init.js";
import { stopDashboardClock } from "./modules/dashboard.js";
import { highlightActiveChatInList, toggleChatSidebar, toggleChatDrawer } from "./modules/chat.js";

window._applyModelToUI = applyModelToUI;
window._loadRecent = loadRecent;
window._applySidebarMode = applySidebarMode;
window._triggerTechLoading = triggerTechLoading;
window._stopDashboardClock = stopDashboardClock;
window._highlightActiveChatInList = highlightActiveChatInList;
window._toggleChatSidebar = toggleChatSidebar;
window._toggleChatDrawer = toggleChatDrawer;
window._hideNewsPanel = hideNewsPanel;
window._highlightNavSection = highlightNavSection;

// ─── Re-exportaciones públicas para window.Cosmo ───
import { goHome, startFromLanding, openProject, deleteProject, sendFromComposer,
         setDevice, showTab, setPreviewSrc, refreshPreview, loadFiles, viewFile,
         copyCurrentFile, toggleAgentPane, setProjectType, removeProjectZip,
         connectFolder, removeExternalPath,
         setServerPreview, refreshServerPreview,
         renderMediaPreviews, removeImage, removeVideo } from "./modules/workspace.js";
import { newChatView, openChat, deleteChat, submitChatPrompt, sendFromChatComposer,
         generateChatImage, toggleChatImageMode,
         renderChatMediaPreviews, removeChatImage,
         initChatBanner, dismissChatBanner, dismissSystemAlert, saSlide, saGoTo } from "./modules/chat.js";
import { showNewsPanel, loadNews, showGalleryPanel, loadGallery, deleteGalleryItem,
         showDashboardPanel, loadDashboard, highlightNavSection, hideNewsPanel,
         toggleWeatherUnit } from "./modules/dashboard.js";
import { useTemplate, useChatSuggestion, setSidebarMode } from "./modules/init.js";

window.Cosmo = {
  goHome, startFromLanding, openProject, deleteProject, sendFromComposer,
  useTemplate, removeImage, removeVideo, refreshPreview, setDevice, showTab, viewFile,
  setServerPreview, refreshServerPreview,
  toggleChatMode: toggleChatDrawer, newChatView, openChat, deleteChat,
  submitChatPrompt, sendFromChatComposer, generateChatImage, toggleChatImageMode,
  showNewsPanel, loadNews, useChatSuggestion,
  toggleChatSidebar, removeChatImage, toggleChatDrawer,
  showGalleryPanel, loadGallery, deleteGalleryItem,
  showDashboardPanel, loadDashboard,
  toggleWeatherUnit,
  setSidebarMode, copyCurrentFile, setProjectType, removeProjectZip, toggleAgentPane,
  connectFolder, removeExternalPath,
  dismissChatBanner, dismissSystemAlert, saSlide, saGoTo,
  // Helpers accesibles desde templates e init
  renderMediaPreviews, renderChatMediaPreviews,
  // Token filter callback
  filterTokens: (provider) => { if (window._filterTokens) window._filterTokens(provider); },
  currentTokenUsage: null,
};
