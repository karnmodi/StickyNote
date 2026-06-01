import { el } from "../utils/dom.js";
import { COLORS } from "../model.js";
import {
  updateNote,
  archiveNote,
  setUi,
  restoreFromArchive,
  deleteForever,
} from "../state.js";
import { renderMarkdown } from "../features/markdown.js";
import { toggleChecklistItem } from "../features/checklist.js";
import { confirmModal, promptModal } from "./modal.js";
import { makeReorderable, makeCanvasDraggable, trackResize } from "./drag.js";

function formatDateTimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function renderNote(note, { boardEl, archived = false, layoutMode = "grid" }) {
  const card = el("div", {
    class: `note-card ${note.pinned ? "pinned" : ""} ${note.encrypted ? "encrypted" : ""}`,
    dataset: { id: note.id },
    tabindex: "0",
    style: { background: note.color },
  });

  card.addEventListener("focusin", () => setUi({ focusedNoteId: note.id }, { silent: true }));
  card.addEventListener("focusout", (e) => {
    if (!card.contains(e.relatedTarget)) {
      setUi({ focusedNoteId: null }, { silent: true });
    }
  });

  const handle = el("div", { class: "note-drag-handle", title: "Drag to move" }, "⋮⋮");

  const colorBtn = el(
    "button",
    {
      class: "icon-btn",
      title: "Change color",
      type: "button",
      onclick: () => openColorPalette(card, note),
    },
    "🎨",
  );

  const pinBtn = el(
    "button",
    {
      class: `icon-btn ${note.pinned ? "active" : ""}`,
      title: note.pinned ? "Unpin" : "Pin",
      type: "button",
      onclick: () => updateNote(note.id, { pinned: !note.pinned }),
    },
    note.pinned ? "📌" : "📍",
  );

  const previewBtn = el(
    "button",
    {
      class: "icon-btn",
      title: "Toggle preview",
      type: "button",
      onclick: () => togglePreview(card),
    },
    "👁",
  );

  const dueBtn = el(
    "button",
    {
      class: `icon-btn ${note.dueAt ? "active" : ""}`,
      title: note.dueAt ? `Due ${new Date(note.dueAt).toLocaleString()}` : "Set reminder",
      type: "button",
      onclick: () => editDueAt(note),
    },
    "⏰",
  );

  const archiveBtn = el(
    "button",
    {
      class: "icon-btn",
      title: archived ? "Restore" : "Archive",
      type: "button",
      onclick: async () => {
        if (archived) {
          restoreFromArchive(note.id);
        } else {
          archiveNote(note.id);
        }
      },
    },
    archived ? "↩" : "🗄",
  );

  const deleteBtn = archived
    ? el(
        "button",
        {
          class: "icon-btn danger",
          title: "Delete forever",
          type: "button",
          onclick: async () => {
            if (await confirmModal("Delete this note permanently?")) deleteForever(note.id);
          },
        },
        "✕",
      )
    : null;

  const controls = el("div", { class: "note-controls" }, [
    colorBtn,
    pinBtn,
    previewBtn,
    dueBtn,
    archiveBtn,
    deleteBtn,
  ]);

  const header = el("div", { class: "note-header" }, [handle, controls]);

  const textarea = el("textarea", {
    class: "note-textarea",
    placeholder: "Type something… use #tag, [ ] for checklists, **bold**, *italic*.",
    spellcheck: "true",
  });
  textarea.value = note.encrypted ? "🔒 Encrypted — unlock to view" : note.content;
  if (note.encrypted) textarea.disabled = true;

  textarea.addEventListener("input", () => {
    if (note.encrypted) return;
    updateNote(note.id, { content: textarea.value }, { silent: true });
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

  const footer = el("div", { class: "note-footer" }, [
    tagsRow,
    note.dueAt
      ? el("span", { class: "note-due" }, `⏰ ${new Date(note.dueAt).toLocaleString()}`)
      : null,
  ]);

  card.append(header, body, footer);

  if (note.position && layoutMode === "canvas") {
    card.classList.add("canvas-positioned");
    card.style.left = note.position.x + "px";
    card.style.top = note.position.y + "px";
  }

  if (!archived) {
    makeReorderable(card, boardEl);
    makeCanvasDraggable(card);
  }
  trackResize(card, note.size);

  return card;
}

function renderTags(container, note) {
  container.innerHTML = "";
  for (const tag of note.tags || []) {
    const chip = el(
      "span",
      {
        class: "tag-chip",
        onclick: () => setUi({ activeTag: tag }),
      },
      `#${tag}`,
    );
    const remove = el(
      "button",
      {
        class: "tag-remove",
        type: "button",
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
    textarea.focus();
  } else {
    preview.innerHTML = renderMarkdown(textarea.value);
    preview.hidden = false;
    textarea.hidden = true;
  }
}

function openColorPalette(card, note) {
  const existing = card.querySelector(".color-palette");
  if (existing) {
    existing.remove();
    return;
  }
  const palette = el("div", { class: "color-palette" });
  for (const color of COLORS) {
    palette.appendChild(
      el("button", {
        class: "color-swatch",
        type: "button",
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
