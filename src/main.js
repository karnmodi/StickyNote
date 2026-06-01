import {
  runMigrations,
  installCrossTabSync,
  subscribeStorage,
  loadSettings,
} from "./storage.js";
import {
  init as initState,
  subscribe,
  reloadFromStorage,
  getState,
  replaceAll,
} from "./state.js";
import { renderBoard } from "./ui/board.js";
import {
  renderToolbar,
  focusSearch,
  applyTheme,
  cycleTheme,
  openShortcutsHelp,
} from "./ui/toolbar.js";
import { renderSidebar } from "./ui/sidebar.js";
import { installShortcuts } from "./features/shortcuts.js";
import { startReminders } from "./features/reminders.js";
import { openModal, closeModal } from "./ui/modal.js";
import { el } from "./utils/dom.js";
import { unlock, decryptString } from "./features/encryption.js";

const toolbarRoot = document.getElementById("toolbar");
const sidebarRoot = document.getElementById("sidebar");
const boardRoot = document.getElementById("board");
const toastHost = document.getElementById("toast-host");

function showToast(message, kind = "info") {
  const toast = el("div", { class: `toast ${kind}` }, message);
  toastHost.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function render() {
  const state = getState();
  const prevFocused = document.activeElement;
  const focusedNoteId = state.ui.focusedNoteId;
  const focusedFolderId =
    prevFocused?.classList?.contains("sidebar-item") && prevFocused.dataset?.folderId
      ? prevFocused.dataset.folderId
      : null;
  const wasOnSidebar = prevFocused?.classList?.contains("sidebar-item");

  renderToolbar(toolbarRoot, state);
  renderSidebar(sidebarRoot, state);
  renderBoard(boardRoot, state);

  if (focusedNoteId) {
    const card = document.querySelector(`.note-card[data-id="${focusedNoteId}"]`);
    if (card) card.focus();
  } else if (focusedFolderId) {
    const item = document.querySelector(`.sidebar-item[data-folder-id="${focusedFolderId}"]`);
    if (item) item.focus();
  } else if (wasOnSidebar) {
    const items = document.querySelectorAll(".sidebar-item.active");
    if (items[0]) items[0].focus();
  }
}

async function decryptAllAndMark() {
  const { notes } = getState();
  const updated = [];
  for (const note of notes) {
    if (!note.encrypted || !note.ciphertext) {
      updated.push(note);
      continue;
    }
    try {
      const plain = await decryptString(note.ciphertext);
      updated.push({ ...note, content: plain, encrypted: false, ciphertext: null });
    } catch (err) {
      console.warn("decrypt failed for", note.id, err);
      updated.push(note);
    }
  }
  replaceAll({ notes: updated });
}

function buildUnlockUi(settings) {
  const passwordInput = el("input", {
    type: "password",
    class: "modal-input",
    placeholder: "Password",
  });
  const error = el("div", {
    class: "modal-error",
    style: { color: "var(--danger)", fontSize: "12px", marginTop: "6px" },
  });

  const tryUnlock = async () => {
    error.textContent = "";
    const pw = passwordInput.value;
    if (!pw) {
      error.textContent = "Enter a password.";
      return false;
    }
    try {
      await unlock(pw, settings.salt);
      const { notes } = getState();
      const sample = notes.find((n) => n.encrypted && n.ciphertext);
      if (sample) {
        try {
          await decryptString(sample.ciphertext);
        } catch {
          error.textContent = "Wrong password.";
          return false;
        }
      }
      await decryptAllAndMark();
      closeModal();
      return true;
    } catch (err) {
      error.textContent = `Unlock failed: ${err.message}`;
      return false;
    }
  };

  passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryUnlock();
  });

  openModal({
    title: "Unlock your notes",
    body: el("div", {}, [
      el(
        "p",
        { style: { marginTop: 0 } },
        "Enter the password you set to view your encrypted notes.",
      ),
      passwordInput,
      error,
    ]),
    actions: [{ label: "Unlock", primary: true, onClick: tryUnlock }],
    dismissible: false,
  });
}

async function boot() {
  runMigrations();
  installCrossTabSync();

  subscribeStorage((event) => {
    if (event.type === "external-change") {
      reloadFromStorage();
      showToast("Synced changes from another tab");
    } else if (event.type === "error") {
      showToast(
        event.error === "quota"
          ? "Storage is full — export a backup and remove notes."
          : "Could not save changes.",
        "error",
      );
    }
  });

  initState();
  const settings = loadSettings();
  applyTheme(settings.theme || "auto");

  if (settings.encryptionEnabled && settings.salt) {
    const { notes } = getState();
    const hasCiphertext = notes.some((n) => n.encrypted);
    if (hasCiphertext) {
      buildUnlockUi(settings);
    }
  }

  subscribe(render);
  installShortcuts({
    onSearch: focusSearch,
    onTheme: cycleTheme,
    onHelp: openShortcutsHelp,
  });
  startReminders();

  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (err) {
      console.warn("Service worker registration failed", err);
    }
  }
}

boot();
