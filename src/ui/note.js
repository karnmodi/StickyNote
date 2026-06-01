import { el } from "../utils/dom.js";
import { COLORS } from "../model.js";
import {
  updateNote,
  archiveNote,
  setUi,
  restoreFromArchive,
  deleteForever,
  getState,
  moveNoteToFolder,
} from "../state.js";
import { renderMarkdown } from "../features/markdown.js";
import { toggleChecklistItem } from "../features/checklist.js";
import { confirmModal, promptModal, openModal, closeModal } from "./modal.js";
import { makeReorderable, trackResize } from "./drag.js";
import { icon, iconButton } from "./icons.js";

function formatDateTimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function folderName(folderId, folders) {
  if (!folderId) return null;
  const folder = folders.find((f) => f.id === folderId);
  return folder ? folder.name : null;
}

export function renderNote(note, { boardEl, archived = false, folders = [] }) {
  const card = el("div", {
    class: `note-card ${note.pinned ? "pinned" : ""} ${note.encrypted ? "encrypted" : ""}`,
    dataset: { id: note.id },
    tabindex: "0",
    role: "article",
    "aria-label": `Note ${note.content?.slice(0, 40) || "empty"}`,
    style: { background: note.color },
    draggable: !archived ? "true" : null,
  });

  card.addEventListener("focusin", () => setUi({ focusedNoteId: note.id }, { silent: true }));
  card.addEventListener("focusout", (e) => {
    if (!card.contains(e.relatedTarget)) {
      setUi({ focusedNoteId: null }, { silent: true });
    }
  });

  if (!archived) {
    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("application/x-stickynote-id", note.id);
      e.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
  }

  const handle = el("div", { class: "note-drag-handle", title: "Drag to reorder", "aria-hidden": "true" });
  handle.appendChild(icon("drag"));

  const colorBtn = iconButton({
    name: "palette",
    title: "Change color (C)",
    onClick: () => openColorPalette(card, note),
  });
  const pinBtn = iconButton({
    name: "pin",
    title: note.pinned ? "Unpin (P)" : "Pin (P)",
    active: note.pinned,
    onClick: () => updateNote(note.id, { pinned: !note.pinned }),
  });
  const previewBtn = iconButton({
    name: "eye",
    title: "Toggle preview (V)",
    onClick: () => togglePreview(card),
  });
  const dueBtn = iconButton({
    name: "clock",
    title: note.dueAt ? `Due ${new Date(note.dueAt).toLocaleString()}` : "Set reminder (R)",
    active: !!note.dueAt,
    onClick: () => editDueAt(note),
  });
  const moveBtn = iconButton({
    name: "move",
    title: "Move to folder (M)",
    onClick: () => openMovePicker(note),
  });
  const archiveBtn = iconButton({
    name: archived ? "restore" : "archive",
    title: archived ? "Restore" : "Archive (A)",
    onClick: () => (archived ? restoreFromArchive(note.id) : archiveNote(note.id)),
  });
  const deleteBtn = archived
    ? iconButton({
        name: "trash",
        title: "Delete forever",
        danger: true,
        onClick: async () => {
          if (await confirmModal("Delete this note permanently?")) deleteForever(note.id);
        },
      })
    : null;

  const controls = el("div", { class: "note-controls" }, [
    colorBtn,
    pinBtn,
    previewBtn,
    !archived ? dueBtn : null,
    !archived ? moveBtn : null,
    archiveBtn,
    deleteBtn,
  ]);
  for (const btn of controls.querySelectorAll(".icon-btn")) btn.tabIndex = -1;

  const header = el("div", { class: "note-header" }, [handle, controls]);

  const textarea = el("textarea", {
    class: "note-textarea",
    placeholder: "Type something… #tag · [ ] task · **bold** · *italic*",
    spellcheck: "true",
    tabindex: "-1",
  });
  textarea.value = note.encrypted ? "🔒 Encrypted — unlock to view" : note.content;
  if (note.encrypted) textarea.disabled = true;

  textarea.addEventListener("input", () => {
    if (note.encrypted) return;
    updateNote(note.id, { content: textarea.value }, { silent: true });
  });
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      card.focus();
    }
  });

  const preview = el("div", { class: "note-preview", hidden: true });
  preview.innerHTML = note.encrypted ? "<em>Encrypted</em>" : renderMarkdown(note.content);
  preview.addEventListener("click", (e) => {
    const cb = e.target.closest('input[type="checkbox"][data-check-index]');
    if (!cb) return;
    e.preventDefault();
    const idx = parseInt(cb.dataset.checkIndex, 10);
    const next = toggleChecklistItem(textarea.value, idx);
    textarea.value = next;
    updateNote(note.id, { content: next });
  });

  const body = el(
    "div",
    {
      class: "note-body",
      style: { width: note.size.w + "px", height: note.size.h + "px" },
    },
    [textarea, preview],
  );

  const tagsRow = el("div", { class: "note-tags" });
  renderTags(tagsRow, note);

  const meta = el("div", { class: "note-meta" });
  const fname = folderName(note.folderId, folders);
  if (fname) {
    const chip = el("span", { class: "note-folder" });
    chip.appendChild(icon("folder"));
    chip.appendChild(el("span", {}, fname));
    meta.appendChild(chip);
  }
  if (note.dueAt) {
    const dueEl = el("span", { class: "note-due" });
    dueEl.appendChild(icon("clock"));
    dueEl.appendChild(el("span", {}, new Date(note.dueAt).toLocaleString()));
    meta.appendChild(dueEl);
  }

  const footer = el("div", { class: "note-footer" }, [tagsRow, meta]);
  card.append(header, body, footer);

  card.addEventListener("keydown", (e) => handleCardKeydown(e, card, note, textarea, archived));

  if (!archived) makeReorderable(card, boardEl);
  trackResize(card, note.size);

  return card;
}

function handleCardKeydown(e, card, note, textarea, archived) {
  if (e.target !== card) return;
  const key = e.key;
  if (key === "Enter" || key === "e" || key === "E") {
    if (note.encrypted) return;
    e.preventDefault();
    textarea.focus();
    const len = textarea.value.length;
    textarea.setSelectionRange(len, len);
    return;
  }
  if (key === "p" || key === "P") {
    e.preventDefault();
    if (!archived) updateNote(note.id, { pinned: !note.pinned });
    return;
  }
  if (key === "a" || key === "A") {
    e.preventDefault();
    if (archived) restoreFromArchive(note.id);
    else archiveNote(note.id);
    return;
  }
  if (key === "v" || key === "V") {
    e.preventDefault();
    togglePreview(card);
    return;
  }
  if (key === "c" || key === "C") {
    e.preventDefault();
    cycleColor(note);
    return;
  }
  if (key === "m" || key === "M") {
    if (archived) return;
    e.preventDefault();
    openMovePicker(note);
    return;
  }
  if (key === "r" || key === "R") {
    if (archived) return;
    e.preventDefault();
    editDueAt(note);
    return;
  }
  if (key === "Delete" || key === "Backspace") {
    e.preventDefault();
    if (archived) {
      confirmModal("Delete this note permanently?").then((ok) => ok && deleteForever(note.id));
    } else {
      archiveNote(note.id);
    }
    return;
  }
  if (key === "ArrowDown" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowLeft") {
    moveFocus(card, key);
    e.preventDefault();
  }
}

function moveFocus(card, key) {
  const cards = [...document.querySelectorAll(".note-card")];
  const idx = cards.indexOf(card);
  if (idx === -1) return;
  if (cards.length === 1) return;
  const rect = card.getBoundingClientRect();
  if (key === "ArrowRight" || key === "ArrowDown") {
    if (key === "ArrowRight") {
      for (let i = idx + 1; i < cards.length; i++) {
        const r = cards[i].getBoundingClientRect();
        if (Math.abs(r.top - rect.top) < 20) return cards[i].focus();
      }
    }
    const next = cards[Math.min(cards.length - 1, idx + 1)];
    next.focus();
  } else {
    if (key === "ArrowLeft") {
      for (let i = idx - 1; i >= 0; i--) {
        const r = cards[i].getBoundingClientRect();
        if (Math.abs(r.top - rect.top) < 20) return cards[i].focus();
      }
    }
    const prev = cards[Math.max(0, idx - 1)];
    prev.focus();
  }
}

function renderTags(container, note) {
  container.innerHTML = "";
  for (const tag of note.tags || []) {
    const chip = el(
      "span",
      {
        class: "tag-chip",
        tabindex: "-1",
        onclick: () => setUi({ activeTag: tag }),
      },
      `#${tag}`,
    );
    const remove = el(
      "button",
      {
        class: "tag-remove",
        type: "button",
        tabindex: "-1",
        "aria-label": "Remove tag",
        onclick: (e) => {
          e.stopPropagation();
          const next = (note.tags || []).filter((t) => t !== tag);
          updateNote(note.id, { tags: next });
        },
      },
      "×",
    );
    chip.appendChild(remove);
    container.appendChild(chip);
  }
  const addBtn = el(
    "button",
    {
      class: "tag-add",
      type: "button",
      tabindex: "-1",
      onclick: async () => {
        const value = await promptModal({
          title: "Add tag",
          label: "Tag name",
          initial: "",
        });
        if (!value) return;
        const clean = value.trim().toLowerCase().replace(/^#/, "");
        if (!clean) return;
        const next = [...new Set([...(note.tags || []), clean])];
        updateNote(note.id, { tags: next });
      },
    },
    "+ tag",
  );
  container.appendChild(addBtn);
}

function togglePreview(card) {
  const textarea = card.querySelector(".note-textarea");
  const preview = card.querySelector(".note-preview");
  const showingPreview = !preview.hidden;
  if (showingPreview) {
    preview.hidden = true;
    textarea.hidden = false;
  } else {
    preview.innerHTML = renderMarkdown(textarea.value);
    preview.hidden = false;
    textarea.hidden = true;
  }
}

function cycleColor(note) {
  const idx = COLORS.indexOf(note.color);
  const next = COLORS[(idx + 1) % COLORS.length];
  updateNote(note.id, { color: next });
}

function openColorPalette(card, note) {
  const existing = card.querySelector(".color-palette");
  if (existing) {
    existing.remove();
    return;
  }
  const palette = el("div", { class: "color-palette", role: "listbox" });
  for (const color of COLORS) {
    palette.appendChild(
      el("button", {
        class: "color-swatch",
        type: "button",
        tabindex: "-1",
        "aria-label": `Set color ${color}`,
        style: { background: color },
        onclick: () => {
          updateNote(note.id, { color });
          palette.remove();
        },
      }),
    );
  }
  card.querySelector(".note-controls").appendChild(palette);
  setTimeout(() => {
    const off = (e) => {
      if (!palette.contains(e.target)) {
        palette.remove();
        document.removeEventListener("click", off);
      }
    };
    document.addEventListener("click", off);
  }, 0);
}

async function editDueAt(note) {
  const value = await promptModal({
    title: "Reminder",
    label: "Due date and time (leave blank to clear)",
    type: "datetime-local",
    initial: formatDateTimeLocal(note.dueAt),
  });
  if (value === null) return;
  if (!value) {
    updateNote(note.id, { dueAt: null, reminded: false });
    return;
  }
  const iso = new Date(value).toISOString();
  updateNote(note.id, { dueAt: iso, reminded: false });
}

function openMovePicker(note) {
  const { folders } = getState();
  const list = el("div", { class: "picker-list", role: "listbox" });

  const buildRow = (label, folderId, active) => {
    const row = el(
      "button",
      {
        type: "button",
        class: `picker-row ${active ? "active" : ""}`,
        onclick: () => {
          moveNoteToFolder(note.id, folderId);
          closeModal();
        },
      },
      [icon(folderId ? "folder" : "inbox"), el("span", {}, label)],
    );
    row.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const rows = [...list.querySelectorAll(".picker-row")];
        const idx = rows.indexOf(row);
        const next =
          rows[
            e.key === "ArrowDown"
              ? Math.min(rows.length - 1, idx + 1)
              : Math.max(0, idx - 1)
          ];
        if (next) next.focus();
      } else if (e.key === "Enter") {
        e.preventDefault();
        moveNoteToFolder(note.id, folderId);
        closeModal();
      }
    });
    return row;
  };

  list.appendChild(buildRow("Unfiled", null, !note.folderId));
  for (const folder of folders) {
    list.appendChild(buildRow(folder.name, folder.id, note.folderId === folder.id));
  }

  openModal({
    title: "Move to folder",
    body: list,
    actions: [{ label: "Cancel", onClick: () => {} }],
  });

  setTimeout(() => {
    const active = list.querySelector(".picker-row.active") || list.querySelector(".picker-row");
    if (active) active.focus();
  }, 0);
}
