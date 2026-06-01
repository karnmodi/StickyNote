import { el, clear } from "../utils/dom.js";
import { icon, iconButton } from "./icons.js";
import {
  setUi,
  addFolder,
  renameFolder,
  deleteFolder,
  moveNoteToFolder,
  getState,
} from "../state.js";
import { promptModal, confirmModal } from "./modal.js";

let folderInputRef = null;

export function focusSidebarNewFolder() {
  if (folderInputRef) {
    folderInputRef.focus();
    folderInputRef.select?.();
  }
}

export function focusFirstFolderItem() {
  const first = document.querySelector(".sidebar-item");
  if (first) first.focus();
}

function buildItem({ label, count, iconName, active, view, folderId, onActivate, onRename, onDelete }) {
  const item = el("button", {
    type: "button",
    class: `sidebar-item ${active ? "active" : ""}`,
    tabindex: "0",
    dataset: folderId ? { folderId } : view ? { view } : {},
  });
  item.appendChild(icon(iconName));
  item.appendChild(el("span", { class: "sidebar-label" }, label));
  if (typeof count === "number") {
    item.appendChild(el("span", { class: "sidebar-count" }, String(count)));
  }
  item.addEventListener("click", onActivate);
  item.addEventListener("dragover", (e) => {
    if (e.dataTransfer.types.includes("application/x-stickynote-id")) {
      e.preventDefault();
      item.classList.add("drop-target");
    }
  });
  item.addEventListener("dragleave", () => item.classList.remove("drop-target"));
  item.addEventListener("drop", (e) => {
    const noteId = e.dataTransfer.getData("application/x-stickynote-id");
    item.classList.remove("drop-target");
    if (noteId) moveNoteToFolder(noteId, folderId || null);
  });
  item.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const all = [...document.querySelectorAll(".sidebar-item")];
      const idx = all.indexOf(item);
      const nextIdx = e.key === "ArrowDown" ? idx + 1 : idx - 1;
      const next = all[Math.max(0, Math.min(all.length - 1, nextIdx))];
      if (next) next.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate();
    } else if ((e.key === "F2" || e.key === "r") && onRename) {
      e.preventDefault();
      onRename();
    } else if ((e.key === "Delete" || e.key === "Backspace") && onDelete) {
      e.preventDefault();
      onDelete();
    }
  });
  return item;
}

export function renderSidebar(root, state) {
  clear(root);

  const counts = {
    all: state.notes.length,
    archive: state.archive.length,
    none: state.notes.filter((n) => !n.folderId).length,
  };
  const perFolder = new Map();
  for (const note of state.notes) {
    if (!note.folderId) continue;
    perFolder.set(note.folderId, (perFolder.get(note.folderId) || 0) + 1);
  }

  const header = el(
    "div",
    { class: "sidebar-header" },
    [el("span", { class: "sidebar-title" }, "Folders")],
  );
  root.appendChild(header);

  const list = el("div", { class: "sidebar-list", role: "listbox" });

  list.appendChild(
    buildItem({
      label: "All notes",
      count: counts.all,
      iconName: "inbox",
      active: state.ui.view === "notes" && state.ui.activeFolderId === null,
      view: "all",
      onActivate: () => setUi({ view: "notes", activeFolderId: null }),
    }),
  );

  list.appendChild(
    buildItem({
      label: "Unfiled",
      count: counts.none,
      iconName: "folder",
      active: state.ui.view === "notes" && state.ui.activeFolderId === "__unfiled__",
      view: "unfiled",
      onActivate: () => setUi({ view: "notes", activeFolderId: "__unfiled__" }),
    }),
  );

  const folders = [...state.folders].sort((a, b) => (a.order || 0) - (b.order || 0));
  for (const folder of folders) {
    list.appendChild(
      buildItem({
        label: folder.name,
        count: perFolder.get(folder.id) || 0,
        iconName: "folder",
        active: state.ui.view === "notes" && state.ui.activeFolderId === folder.id,
        folderId: folder.id,
        onActivate: () => setUi({ view: "notes", activeFolderId: folder.id }),
        onRename: async () => {
          const next = await promptModal({
            title: "Rename folder",
            label: "New name",
            initial: folder.name,
          });
          if (next && next.trim()) renameFolder(folder.id, next.trim());
        },
        onDelete: async () => {
          if (await confirmModal(`Delete folder "${folder.name}"? Notes inside become Unfiled.`)) {
            deleteFolder(folder.id);
          }
        },
      }),
    );
  }

  list.appendChild(el("div", { class: "sidebar-divider" }));
  list.appendChild(
    buildItem({
      label: "Archive",
      count: counts.archive,
      iconName: "archive",
      active: state.ui.view === "archive",
      view: "archive",
      onActivate: () => setUi({ view: "archive" }),
    }),
  );

  root.appendChild(list);

  const newFolderForm = el("form", { class: "sidebar-new" });
  const newFolderInput = el("input", {
    type: "text",
    class: "sidebar-new-input",
    placeholder: "New folder…",
    "aria-label": "New folder name",
    maxlength: "60",
  });
  folderInputRef = newFolderInput;
  newFolderForm.appendChild(icon("folderPlus"));
  newFolderForm.appendChild(newFolderInput);
  newFolderForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = newFolderInput.value.trim();
    if (!name) return;
    const folder = addFolder(name);
    newFolderInput.value = "";
    setUi({ view: "notes", activeFolderId: folder.id });
  });
  root.appendChild(newFolderForm);

  const help = el("div", { class: "sidebar-help" }, [
    el("kbd", {}, "?"),
    el("span", {}, " for shortcuts"),
  ]);
  root.appendChild(help);
}
