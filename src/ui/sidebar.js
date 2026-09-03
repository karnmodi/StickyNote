import { el, clear } from "../utils/dom.js";
import { icon } from "./icons.js";
import { setUi, addFolder, renameFolder, deleteFolder, getState } from "../state.js";
import { promptModal, confirmModal } from "./modal.js";
import { SESSION_ID } from "../session.js";

let folderInputRef = null;

export function focusNewFolder() {
  folderInputRef?.focus();
}

function item({ label, count, iconName, active, folderId, view, onActivate, onRename, onDelete }) {
  const node = el("button", {
    type: "button",
    class: `sidebar-item ${active ? "active" : ""}`,
    dataset: { ...(folderId ? { folderId } : {}), ...(view ? { view } : {}) },
  });
  node.appendChild(icon(iconName));
  node.appendChild(el("span", { class: "sidebar-label" }, label));
  if (typeof count === "number") {
    node.appendChild(el("span", { class: "sidebar-count" }, String(count)));
  }
  node.addEventListener("click", onActivate);
  node.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const all = [...document.querySelectorAll(".sidebar-item")];
      const i = all.indexOf(node);
      const next = all[Math.max(0, Math.min(all.length - 1, e.key === "ArrowDown" ? i + 1 : i - 1))];
      next?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate();
    } else if (e.key === "F2" && onRename) {
      e.preventDefault();
      onRename();
    } else if ((e.key === "Delete" || e.key === "Backspace") && onDelete) {
      e.preventDefault();
      onDelete();
    }
  });
  return node;
}

export function renderSidebar(root, state) {
  clear(root);

  const sessionCount = state.notes.filter((n) => n.sessionId === SESSION_ID || n.pinned).length;
  const perFolder = new Map();
  for (const n of state.notes) {
    if (n.folderId) perFolder.set(n.folderId, (perFolder.get(n.folderId) || 0) + 1);
  }

  const list = el("div", { class: "sidebar-list" });

  list.appendChild(
    item({
      label: "This session",
      count: sessionCount,
      iconName: "inbox",
      active: state.ui.view === "session",
      view: "session",
      onActivate: () => setUi({ view: "session", activeFolderId: null, search: "" }),
    }),
  );
  list.appendChild(
    item({
      label: "All notes",
      count: state.notes.length,
      iconName: "text",
      active: state.ui.view === "all",
      view: "all",
      onActivate: () => setUi({ view: "all", activeFolderId: null }),
    }),
  );
  list.appendChild(
    item({
      label: "Unfiled",
      count: state.notes.filter((n) => !n.folderId).length,
      iconName: "folder",
      active: state.ui.view === "folder" && state.ui.activeFolderId === "__unfiled__",
      view: "unfiled",
      onActivate: () => setUi({ view: "folder", activeFolderId: "__unfiled__" }),
    }),
  );

  const folders = [...state.folders].sort((a, b) => (a.order || 0) - (b.order || 0));
  if (folders.length) list.appendChild(el("div", { class: "sidebar-divider" }));
  for (const folder of folders) {
    list.appendChild(
      item({
        label: folder.name,
        count: perFolder.get(folder.id) || 0,
        iconName: "folder",
        active: state.ui.view === "folder" && state.ui.activeFolderId === folder.id,
        folderId: folder.id,
        onActivate: () => setUi({ view: "folder", activeFolderId: folder.id }),
        onRename: async () => {
          const next = await promptModal({ title: "Rename folder", label: "Name", initial: folder.name });
          if (next && next.trim()) renameFolder(folder.id, next.trim());
        },
        onDelete: async () => {
          if (await confirmModal(`Delete "${folder.name}"? Notes inside become Unfiled.`)) {
            deleteFolder(folder.id);
          }
        },
      }),
    );
  }

  list.appendChild(el("div", { class: "sidebar-divider" }));
  list.appendChild(
    item({
      label: "Recently deleted",
      count: state.trash.length,
      iconName: "trash",
      active: state.ui.view === "trash",
      view: "trash",
      onActivate: () => setUi({ view: "trash", activeFolderId: null }),
    }),
  );

  root.appendChild(list);

  const form = el("form", { class: "sidebar-new" });
  const input = el("input", {
    type: "text",
    class: "sidebar-new-input",
    placeholder: "New folder",
    "aria-label": "New folder name",
    maxlength: "60",
  });
  folderInputRef = input;
  form.appendChild(icon("folderPlus"));
  form.appendChild(input);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    const folder = addFolder(name);
    input.value = "";
    setUi({ view: "folder", activeFolderId: folder.id });
  });
  root.appendChild(form);

  root.appendChild(
    el("div", { class: "sidebar-help" }, [el("kbd", {}, "?"), el("span", {}, "shortcuts")]),
  );
}
