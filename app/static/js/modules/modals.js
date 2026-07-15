/* T.H.E.M.I.S. — Modales: confirmación, conectar carpeta. */
import { state } from "./state.js";
import { escapeHtml } from "./utils.js";

export function showConfirmModal({ title, messageHtml, confirmLabel = "Eliminar", onConfirm }) {
  const isAmber = document.documentElement.classList.contains("theme-amber");
  const confirmClass = isAmber
    ? "bg-amber-500 hover:bg-amber-600"
    : "bg-red-600 hover:bg-red-700";

  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-sm fade-in";
  overlay.innerHTML = `
    <div class="holo-modal-card max-w-sm w-full p-6 slide-up flex flex-col gap-4">
      <div class="flex flex-col gap-2">
        <h3 class="text-lg font-semibold text-zinc-900 font-heading">${escapeHtml(title)}</h3>
        <p class="text-sm text-zinc-500 font-body leading-relaxed">${messageHtml}</p>
      </div>
      <div class="flex justify-end gap-2 mt-2">
        <button id="confirm-modal-cancel" class="px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer">
          Cancelar
        </button>
        <button id="confirm-modal-delete" class="px-4 py-2 text-sm font-medium text-white ${confirmClass} rounded-xl transition-colors cursor-pointer">
          ${escapeHtml(confirmLabel)}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const cancelBtn = overlay.querySelector("#confirm-modal-cancel");
  const deleteBtn = overlay.querySelector("#confirm-modal-delete");
  cancelBtn.focus();

  const closeModal = () => overlay.remove();

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

export function showDeleteConfirmModal(chatName, onConfirm) {
  showConfirmModal({
    title: "¿Eliminar conversación?",
    messageHtml: `La conversación <span class="font-medium text-zinc-800">“${escapeHtml(chatName)}”</span> se eliminará permanentemente. Esta acción no se puede deshacer.`,
    confirmLabel: "Eliminar",
    onConfirm,
  });
}

export function showConnectFolderModal(onConfirm) {
  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-sm fade-in";
  overlay.innerHTML = `
    <div class="holo-modal-card max-w-lg w-full p-6 slide-up flex flex-col gap-4">
      <div class="flex flex-col gap-2">
        <h3 class="text-lg font-semibold text-zinc-900 font-heading">Conectar carpeta existente</h3>
        <p class="text-sm text-zinc-500 font-body leading-relaxed">
          Pega la ruta absoluta de la carpeta del proyecto en tu disco. El agente trabajará directamente sobre esos archivos, sin copiarlos.
        </p>
        <div class="mt-2">
          <input id="connect-folder-input" type="text" value="${escapeHtml(state.externalPath || "")}"
            placeholder="ej. C:\\Users\\tu-usuario\\mi-app o /home/tu-usuario/mi-app"
            class="w-full px-4 py-2.5 text-sm font-mono text-zinc-800 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 outline-none transition-colors" />
          <p class="text-[10px] text-zinc-400 mt-1.5 font-body">También puedes arrastrar la carpeta aquí, pero pegar la ruta es más rápido.</p>
        </div>
      </div>
      <div class="flex justify-end gap-2 mt-1">
        <button id="connect-modal-cancel" class="px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer">
          Cancelar
        </button>
        <button id="connect-modal-confirm" class="px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 rounded-xl transition-colors cursor-pointer">
          Conectar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const input = overlay.querySelector("#connect-folder-input");
  const cancelBtn = overlay.querySelector("#connect-modal-cancel");
  const confirmBtn = overlay.querySelector("#connect-modal-confirm");

  const closeModal = () => overlay.remove();

  const submit = () => {
    const trimmed = input.value.trim();
    if (!trimmed) return;
    closeModal();
    onConfirm(trimmed);
  };

  cancelBtn.addEventListener("click", closeModal);
  confirmBtn.addEventListener("click", submit);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
    if (e.key === "Escape") closeModal();
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  setTimeout(() => input.focus(), 100);
}
