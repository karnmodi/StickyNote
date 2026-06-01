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
import { icon, iconButton } from "./icons.js";

let searchInputRef = null;

export function focusSearch() {
  if (searchInputRef) {
    searchInputRef.focus();
    searchInputRef.select?.();
  }
}

const THEME_ICONS = { auto: "monitor", light: "sun", dark: "moon" };

export function renderToolbar(root, state) {
  root.innerHTML = "";

  const left = el("div", { class: "toolbar-section" });
  const newBtn = el(
    "button",
    {
      class: "btn btn-primary",
      type: "button",
      onclick: () => {
        const note = addNote();
        setTimeout(() => {
          const card = document.querySelector(`.note-card[data-id="${note.id}"]`);
          if (card) {
            card.focus();
            const ta = card.querySelector(".note-textarea");
            if (ta) ta.focus();
          }
        }, 0);
      },
      title: "New note (N)",
    },
    [icon("plus"), el("span", {}, "New")],
  );
  left.appendChild(newBtn);
  left.appendChild(
    iconButton({
      name: "undo",
      title: "Undo (Ctrl+Z)",
      onClick: undo,
    }),
  );
  left.appendChild(
    iconButton({
      name: "redo",
      title: "Redo (Ctrl+Shift+Z)",
      onClick: redo,
    }),
  );

  const undoBtn = left.querySelector('[aria-label*="Undo"]');
  const redoBtn = left.querySelector('[aria-label*="Redo"]');
  if (undoBtn && !canUndo()) undoBtn.disabled = true;
  if (redoBtn && !canRedo()) redoBtn.disabled = true;

  const search = el("input", {
    class: "search-input",
    type: "search",
    placeholder: "Search notes…  (/ )",
    "aria-label": "Search notes",
    value: state.ui.search,
  });
  searchInputRef = search;
  const onSearch = debounce((value) => setUi({ search: value }), 120);
  search.addEventListener("input", (e) => onSearch(e.target.value));
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      search.value = "";
      setUi({ search: "" });
      search.blur();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const firstCard = document.querySelector(".note-card");
      if (firstCard) firstCard.focus();
    }
  });
  const searchWrap = el("div", { class: "search-wrap" }, [icon("search"), search]);
  const center = el("div", { class: "toolbar-section toolbar-search" }, [searchWrap]);

  const sortSelect = el(
    "select",
    {
      class: "select",
      "aria-label": "Sort order",
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

  const themeBtn = iconButton({
    name: THEME_ICONS[state.settings.theme] || "monitor",
    title: `Theme: ${state.settings.theme} (T)`,
    onClick: cycleTheme,
  });

  const helpBtn = iconButton({
    name: "help",
    title: "Keyboard shortcuts (?)",
    onClick: openShortcutsHelp,
  });

  const moreBtn = iconButton({
    name: "more",
    title: "More",
    onClick: () => openMoreMenu(state),
  });

  const right = el("div", { class: "toolbar-section" }, [
    sortSelect,
    themeBtn,
    helpBtn,
    moreBtn,
  ]);

  root.append(left, center, right);
}

export function cycleTheme() {
  const order = ["auto", "light", "dark"];
  const current = getState().settings.theme || "auto";
  const next = order[(order.indexOf(current) + 1) % order.length];
  setSettings({ theme: next });
  applyTheme(next);
}

function openMoreMenu(state) {
  const body = el("div", { class: "menu-list" }, [
    menuItem("download", "Export backup", exportBackup),
    menuItem("upload", "Import backup", openImportFlow),
    menuItem(
      "lock",
      state.settings.encryptionEnabled ? "Disable encryption" : "Enable encryption",
      () => toggleEncryption(state),
    ),
    state.settings.encryptionEnabled
      ? menuItem("lock", "Lock now", () => lockNow())
      : null,
    menuItem("bell", "Enable notifications", async () => {
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

function menuItem(iconName, label, onClick) {
  const btn = el(
    "button",
    {
      class: "menu-item",
      type: "button",
      onclick: () => onClick(),
    },
    [icon(iconName), el("span", {}, label)],
  );
  return btn;
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
        "Disable encryption? Notes will be stored as plain text again.",
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

function row(keys, description) {
  return el("div", { class: "shortcut-row" }, [
    el("div", { class: "shortcut-keys" }, keys.map((k) => el("kbd", {}, k))),
    el("div", {}, description),
  ]);
}

export function openShortcutsHelp() {
  const body = el("div", { class: "shortcuts-grid" }, [
    el("h3", {}, "Global"),
    row(["N"], "New note (and start editing)"),
    row(["/"], "Focus search"),
    row(["T"], "Cycle theme"),
    row(["?"], "Show this help"),
    row(["Ctrl", "Z"], "Undo"),
    row(["Ctrl", "Shift", "Z"], "Redo"),
    row(["Esc"], "Close / blur"),
    el("h3", {}, "Sidebar"),
    row(["Tab"], "Move into sidebar"),
    row(["↑", "↓"], "Navigate folders"),
    row(["Enter"], "Open folder"),
    row(["F2"], "Rename folder"),
    row(["Del"], "Delete folder"),
    el("h3", {}, "On a focused note"),
    row(["Enter"], "Edit content"),
    row(["Esc"], "Stop editing"),
    row(["←", "→", "↑", "↓"], "Move focus between notes"),
    row(["P"], "Pin / unpin"),
    row(["V"], "Toggle preview"),
    row(["C"], "Cycle color"),
    row(["M"], "Move to folder"),
    row(["R"], "Set reminder"),
    row(["A"], "Archive"),
    row(["Del"], "Archive (or delete forever in archive)"),
  ]);
  openModal({
    title: "Keyboard shortcuts",
    body,
    actions: [{ label: "Close", primary: true, onClick: () => {} }],
  });
}
