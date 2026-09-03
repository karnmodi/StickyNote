import { runMigrations, installCrossTabSync, subscribeStorage, loadSettings } from "./storage.js";
import {
  init as initState,
  subscribe,
  reloadFromStorage,
  getState,
  replaceAll,
  purgeExpiredTrash,
} from "./state.js";
import { renderBoard } from "./ui/board.js";
import { renderSidebar } from "./ui/sidebar.js";
import {
  renderToolbar,
  focusSearch,
  applyTheme,
  cycleTheme,
  openShortcutsHelp,
} from "./ui/toolbar.js";
import { installShortcuts } from "./features/shortcuts.js";
import { startReminders } from "./features/reminders.js";
import { openModal, closeModal } from "./ui/modal.js";
import { showToast } from "./ui/toast.js";
import { el } from "./utils/dom.js";
import { unlock, decryptString } from "./features/encryption.js";
import "./session.js";

const toolbarRoot = document.getElementById("toolbar");
const sidebarRoot = document.getElementById("sidebar");
const boardRoot = document.getElementById("board");

function render() {
  const state = getState();
  const prev = document.activeElement;
  const focusedNoteId = state.ui.focusedNoteId;
  const focusedFolderId =
    prev?.classList?.contains("sidebar-item") && prev.dataset?.folderId ? prev.dataset.folderId : null;
  const wasOnSidebar = prev?.classList?.contains("sidebar-item");
  const cardId = prev?.classList?.contains("note-card") ? prev.dataset.id : null;

  renderToolbar(toolbarRoot, state);
  renderSidebar(sidebarRoot, state);
  renderBoard(boardRoot, state);

  // The sheet owns focus while it is open — never yank it back to the board.
  if (state.ui.sheetNoteId) return;

  const restoreId = cardId || focusedNoteId;
  if (restoreId) {
    document.querySelector(`.note-card[data-id="${restoreId}"]`)?.focus();
  } else if (focusedFolderId) {
    document.querySelector(`.sidebar-item[data-folder-id="${focusedFolderId}"]`)?.focus();
  } else if (wasOnSidebar) {
    document.querySelector(".sidebar-item.active")?.focus();
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
      updated.push({
        ...note,
        content: await decryptString(note.ciphertext),
        encrypted: false,
        ciphertext: null,
      });
    } catch (err) {
      console.warn("decrypt failed for", note.id, err);
      updated.push(note);
    }
  }
  replaceAll({ notes: updated });
}

function buildUnlockUi(settings) {
  const input = el("input", { type: "password", class: "modal-input", placeholder: "Password" });
  const error = el("div", { class: "modal-error" });

  const tryUnlock = async () => {
    error.textContent = "";
    if (!input.value) {
      error.textContent = "Enter a password.";
      return false;
    }
    try {
      await unlock(input.value, settings.salt);
      const sample = getState().notes.find((n) => n.encrypted && n.ciphertext);
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

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryUnlock();
  });

  openModal({
    title: "Unlock your notes",
    body: el("div", {}, [
      el("p", { class: "modal-lede" }, "Enter the password you set to read your notes."),
      input,
      error,
    ]),
    actions: [{ label: "Unlock", primary: true, onClick: tryUnlock }],
    dismissible: false,
  });
}

async function boot() {
  const migration = runMigrations();
  installCrossTabSync();

  subscribeStorage((event) => {
    if (event.type === "external-change") {
      reloadFromStorage();
    } else if (event.type === "error") {
      showToast(
        event.error === "quota"
          ? "Storage is full — export a backup and remove some notes."
          : "Could not save changes.",
        { kind: "error", duration: 6000 },
      );
    }
  });

  initState();
  purgeExpiredTrash();

  const settings = loadSettings();
  applyTheme(settings.theme || "auto");

  if (settings.encryptionEnabled && settings.salt) {
    if (getState().notes.some((n) => n.encrypted)) buildUnlockUi(settings);
  }

  subscribe(render);
  installShortcuts({ onSearch: focusSearch, onTheme: cycleTheme, onHelp: openShortcutsHelp });
  startReminders();

  if (migration.migrated) {
    showToast(`Upgraded ${migration.count} notes to the new format`, { duration: 6000 });
  }

  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (err) {
      console.warn("Service worker registration failed", err);
    }
  }
}

boot();
