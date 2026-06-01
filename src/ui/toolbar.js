import { el } from "../utils/dom.js";
import { debounce } from "../utils/debounce.js";
import {
  addNote,
  setUi,
  setSettings,
  undo,
  redo,
  canUndo,
  canRedo,
  getState,
} from "../state.js";
import { exportBackup, importBackup } from "../features/backup.js";
import { confirmModal, openModal, promptModal } from "./modal.js";
import {
  generateSalt,
  unlock,
  lock,
  encryptString,
  isUnlocked,
} from "../features/encryption.js";
import { requestNotificationPermission } from "../features/reminders.js";

let searchInputRef = null;

export function focusSearch() {
  if (searchInputRef) searchInputRef.focus();
}

export function renderToolbar(root, state) {
  root.innerHTML = "";

  const left = el("div", { class: "toolbar-section" }, [
    el(
      "button",
      {
        class: "btn btn-primary",
        type: "button",
        onclick: () => addNote(),
        title: "New note (Ctrl/Cmd+N)",
      },
      "+ New",
    ),
    el(
      "button",
      {
        class: "btn",
        type: "button",
        disabled: !canUndo() ? "" : null,
        onclick: () => undo(),
        title: "Undo (Ctrl+Z)",
      },
      "↶ Undo",
    ),
    el(
      "button",
      {
        class: "btn",
        type: "button",
        disabled: !canRedo() ? "" : null,
        onclick: () => redo(),
        title: "Redo (Ctrl+Shift+Z)",
      },
      "↷ Redo",
    ),
  ]);

  const search = el("input", {
    class: "search-input",
    type: "search",
    placeholder: "Search notes…  (Ctrl/Cmd+F)",
    value: state.ui.search,
  });
  searchInputRef = search;
  const onSearch = debounce((value) => setUi({ search: value }), 120);
  search.addEventListener("input", (e) => onSearch(e.target.value));

  const center = el("div", { class: "toolbar-section toolbar-search" }, [search]);

  const sortSelect = el(
    "select",
    {
      class: "select",
      onchange: (e) => setSettings({ sortBy: e.target.value }),
      title: "Sort order",
    },
    [
      el("option", { value: "manual", selected: state.settings.sortBy === "manual" ? "" : null }, "Manual"),
      el("option", { value: "updated", selected: state.settings.sortBy === "updated" ? "" : null }, "Last updated"),
      el("option", { value: "created", selected: state.settings.sortBy === "created" ? "" : null }, "Created"),
      el("option", { value: "alpha", selected: state.settings.sortBy === "alpha" ? "" : null }, "Alphabetical"),
    ],
  );

  const layoutToggle = el(
    "button",
    {
      class: "btn",
      type: "button",
      onclick: () =>
        setSettings({
          layoutMode: state.settings.layoutMode === "grid" ? "canvas" : "grid",
        }),
      title: "Toggle layout",
    },
    state.settings.layoutMode === "grid" ? "▦ Grid" : "✥ Canvas",
  );

  const themeToggle = el(
    "button",
    {
      class: "btn",
      type: "button",
      onclick: () => {
        const order = ["auto", "light", "dark"];
        const next = order[(order.indexOf(state.settings.theme) + 1) % order.length];
        setSettings({ theme: next });
        applyTheme(next);
      },
      title: "Theme",
    },
    state.settings.theme === "dark" ? "🌙 Dark" : state.settings.theme === "light" ? "☀ Light" : "🌓 Auto",
  );

  const archiveToggle = el(
    "button",
    {
      class: `btn ${state.ui.showArchive ? "btn-primary" : ""}`,
      type: "button",
      onclick: () => setUi({ showArchive: !state.ui.showArchive }),
      title: "Toggle archive",
    },
    state.ui.showArchive ? `← Notes` : `🗄 Archive (${state.archive.length})`,
  );

  const moreBtn = el(
    "button",
    {
      class: "btn",
      type: "button",
      onclick: () => openMoreMenu(state),
      title: "More",
    },
    "⋯",
  );

  const right = el("div", { class: "toolbar-section" }, [
    sortSelect,
    layoutToggle,
    themeToggle,
    archiveToggle,
    moreBtn,
  ]);

  root.append(left, center, right);
}

function openMoreMenu(state) {
  const body = el("div", { class: "menu-list" }, [
    menuItem("⬇ Export backup", exportBackup),
    menuItem("⬆ Import backup", openImportFlow),
    menuItem(
      state.settings.encryptionEnabled ? "🔓 Disable encryption" : "🔒 Enable encryption",
      () => toggleEncryption(state),
    ),
    state.settings.encryptionEnabled
      ? menuItem("🔐 Lock now", () => {
          lockNow();
        })
      : null,
    menuItem("🔔 Enable notifications", async () => {
      const result = await requestNotificationPermission();
      alert(`Notifications: ${result}`);
    }),
  ]);
  openModal({
    title: "More",
    body,
    actions: [{ label: "Close", onClick: () => {} }],
  });
}

function menuItem(label, onClick) {
  return el(
    "button",
    {
      class: "menu-item",
      type: "button",
      onclick: () => {
        onClick();
      },
    },
    label,
  );
}

async function openImportFlow() {
  const input = el("input", { type: "file", accept: "application/json" });
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const mode = (await confirmModal(
      "Merge with existing notes? Click Cancel to REPLACE everything instead.",
    ))
      ? "merge"
      : "replace";
    try {
      const result = await importBackup(file, mode);
      alert(`Imported ${result.imported} items.`);
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  });
  input.click();
}

async function toggleEncryption(state) {
  if (state.settings.encryptionEnabled) {
    if (
      !(await confirmModal(
        "Disable encryption? Notes will be stored as plain text again. (Lock-now will no longer be available.)",
      ))
    )
      return;
    setSettings({ encryptionEnabled: false, salt: null });
    return;
  }
  const pw = await promptModal({
    title: "Set encryption password",
    label: "Choose a password (cannot be recovered if forgotten)",
    type: "password",
  });
  if (!pw) return;
  const confirm = await promptModal({
    title: "Confirm password",
    label: "Re-enter the password",
    type: "password",
  });
  if (pw !== confirm) {
    alert("Passwords didn't match.");
    return;
  }
  const salt = generateSalt();
  await unlock(pw, salt);
  setSettings({ encryptionEnabled: true, salt });
  await lockNow();
}

async function lockNow() {
  const { notes } = getState();
  const updated = [];
  for (const note of notes) {
    if (!isUnlocked()) break;
    try {
      const payload = await encryptString(note.content || "");
      updated.push({ ...note, ciphertext: payload, encrypted: true, content: "" });
    } catch (err) {
      console.warn("encrypt failed", err);
      updated.push(note);
    }
  }
  const { replaceAll } = await import("../state.js");
  replaceAll({ notes: updated });
  lock();
  window.location.reload();
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "auto" ? "" : theme;
}
