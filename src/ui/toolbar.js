import { el } from "../utils/dom.js";
import { debounce } from "../utils/debounce.js";
import { setUi, setSettings, undo, redo, canUndo, canRedo, getState } from "../state.js";
import { exportBackup, importBackup } from "../features/backup.js";
import { confirmModal, openModal, promptModal } from "./modal.js";
import { generateSalt, unlock, lock, encryptString, isUnlocked } from "../features/encryption.js";
import { requestNotificationPermission } from "../features/reminders.js";
import { icon, iconButton } from "./icons.js";
import { showToast } from "./toast.js";

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

  const undoBtn = iconButton({ name: "undo", title: "Undo (⌘Z)", onClick: undo });
  const redoBtn = iconButton({ name: "redo", title: "Redo (⇧⌘Z)", onClick: redo });
  if (!canUndo()) undoBtn.disabled = true;
  if (!canRedo()) redoBtn.disabled = true;

  const left = el("div", { class: "toolbar-section" }, [
    el("span", { class: "wordmark" }, "Notes"),
    undoBtn,
    redoBtn,
  ]);

  const search = el("input", {
    class: "search-input",
    type: "search",
    placeholder: "Search",
    "aria-label": "Search notes",
    value: state.ui.search,
  });
  searchInputRef = search;
  const onSearch = debounce((v) => setUi({ search: v }), 120);
  search.addEventListener("input", (e) => onSearch(e.target.value));
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      search.value = "";
      setUi({ search: "" });
      search.blur();
    } else if (e.key === "Enter") {
      e.preventDefault();
      document.querySelector(".note-card:not(.draft)")?.focus();
    }
  });

  const center = el("div", { class: "toolbar-section toolbar-search" }, [
    el("div", { class: "search-wrap" }, [icon("search"), search]),
  ]);

  const sortSelect = el(
    "select",
    { class: "select", "aria-label": "Sort", onchange: (e) => setSettings({ sortBy: e.target.value }) },
    [
      el("option", { value: "manual", selected: state.settings.sortBy === "manual" ? "" : null }, "Manual"),
      el("option", { value: "updated", selected: state.settings.sortBy === "updated" ? "" : null }, "Edited"),
      el("option", { value: "created", selected: state.settings.sortBy === "created" ? "" : null }, "Created"),
      el("option", { value: "alpha", selected: state.settings.sortBy === "alpha" ? "" : null }, "Title"),
    ],
  );

  const right = el("div", { class: "toolbar-section" }, [
    sortSelect,
    iconButton({ name: THEME_ICONS[state.settings.theme] || "monitor", title: `Theme: ${state.settings.theme} (T)`, onClick: cycleTheme }),
    iconButton({ name: "help", title: "Shortcuts (?)", onClick: openShortcutsHelp }),
    iconButton({ name: "more", title: "More", onClick: () => openMoreMenu(state) }),
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

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "auto" ? "" : theme;
}

function menuItem(iconName, label, onClick) {
  return el("button", { class: "menu-item", type: "button", onclick: () => onClick() }, [
    icon(iconName),
    el("span", {}, label),
  ]);
}

function openMoreMenu(state) {
  const body = el("div", { class: "menu-list" }, [
    menuItem("download", "Export backup", exportBackup),
    menuItem("upload", "Import backup", openImportFlow),
    menuItem("lock", state.settings.encryptionEnabled ? "Disable encryption" : "Enable encryption", () =>
      toggleEncryption(state),
    ),
    state.settings.encryptionEnabled ? menuItem("lock", "Lock now", lockNow) : null,
    menuItem("bell", "Enable notifications", async () => {
      const result = await requestNotificationPermission();
      showToast(`Notifications: ${result}`);
    }),
  ]);
  openModal({ title: "More", body, actions: [{ label: "Close", onClick: () => {} }] });
}

async function openImportFlow() {
  const input = el("input", { type: "file", accept: "application/json" });
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const mode = (await confirmModal("Merge with existing notes? Cancel replaces everything instead."))
      ? "merge"
      : "replace";
    try {
      const result = await importBackup(file, mode);
      showToast(`Imported ${result.imported} notes`);
    } catch (err) {
      showToast(`Import failed: ${err.message}`, { kind: "error" });
    }
  });
  input.click();
}

async function toggleEncryption(state) {
  if (state.settings.encryptionEnabled) {
    if (!(await confirmModal("Disable encryption? Notes will be stored as plain text."))) return;
    setSettings({ encryptionEnabled: false, salt: null });
    return;
  }
  const pw = await promptModal({
    title: "Set a password",
    label: "This cannot be recovered if forgotten",
    type: "password",
  });
  if (!pw) return;
  const again = await promptModal({ title: "Confirm password", label: "Re-enter it", type: "password" });
  if (pw !== again) {
    showToast("Passwords didn't match", { kind: "error" });
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

function row(keys, description) {
  return el("div", { class: "shortcut-row" }, [
    el("div", { class: "shortcut-keys" }, keys.map((k) => el("kbd", {}, k))),
    el("div", {}, description),
  ]);
}

export function openShortcutsHelp() {
  const body = el("div", { class: "shortcuts-grid" }, [
    el("h3", {}, "Anywhere"),
    row(["N"], "Jump to the new-note box"),
    row(["/"], "Search"),
    row(["T"], "Cycle theme"),
    row(["?"], "This help"),
    row(["⌘", "Z"], "Undo"),
    row(["⇧", "⌘", "Z"], "Redo"),
    row(["Esc"], "Close / clear"),
    el("h3", {}, "On a note"),
    row(["Enter"], "Open the editor"),
    row(["←", "→", "↑", "↓"], "Move between notes"),
    row(["P"], "Pin (keeps it on every session)"),
    row(["Del"], "Delete"),
    el("h3", {}, "Sidebar"),
    row(["↑", "↓"], "Move"),
    row(["Enter"], "Open"),
    row(["F2"], "Rename folder"),
    row(["Del"], "Delete folder"),
    el("h3", {}, "In the editor"),
    row(["Esc"], "Close and save"),
    row(["Tab"], "Move between controls"),
  ]);
  openModal({ title: "Keyboard shortcuts", body, actions: [{ label: "Done", primary: true, onClick: () => {} }] });
}
