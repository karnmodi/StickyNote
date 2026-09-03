import { el, clear } from "../utils/dom.js";
import { icon, iconButton, TYPE_ICON } from "./icons.js";
import { COLORS } from "../model.js";
import { TYPES, effectiveType, deriveTitle } from "../features/noteType.js";
import {
  subscribe,
  getState,
  updateNote,
  deleteNote,
  moveNoteToFolder,
  setUi,
} from "../state.js";
import { renderMarkdown } from "../features/markdown.js";
import { showToast } from "./toast.js";

let currentId = null;
let unsub = null;
let refs = null;
let returnSelector = null;
let escHandler = null;

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])';

function hostEl() {
  let host = document.getElementById("sheet-host");
  if (!host) {
    host = el("div", { id: "sheet-host" });
    document.body.appendChild(host);
  }
  return host;
}

export function isSheetOpen() {
  return currentId !== null;
}

function formatDateTimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildDom(note) {
  const r = {};

  r.textarea = el("textarea", {
    class: "sheet-editor",
    placeholder: "Write something…  #tag · [ ] task · ```code",
    spellcheck: "true",
  });
  r.textarea.value = note.encrypted ? "" : note.content;
  if (note.encrypted) r.textarea.disabled = true;

  r.preview = el("div", { class: "sheet-preview", hidden: true });

  // Type segmented control
  r.typeSeg = el("div", { class: "segmented", role: "tablist" });
  r.typeButtons = {};
  for (const t of TYPES) {
    const b = el(
      "button",
      {
        class: "segment",
        type: "button",
        role: "tab",
        title: t[0].toUpperCase() + t.slice(1),
        onclick: () => updateNote(currentId, { type: t, typeLocked: true }),
      },
      [icon(TYPE_ICON[t])],
    );
    r.typeButtons[t] = b;
    r.typeSeg.appendChild(b);
  }
  r.autoBtn = el(
    "button",
    { class: "segment segment-auto", type: "button", title: "Auto-detect type",
      onclick: () => updateNote(currentId, { typeLocked: false }) },
    "Auto",
  );
  r.typeSeg.appendChild(r.autoBtn);

  r.previewBtn = iconButton({
    name: "eye",
    title: "Toggle preview",
    onClick: () => {
      const showing = !r.preview.hidden;
      if (showing) {
        r.preview.hidden = true;
        r.textarea.hidden = false;
        r.textarea.focus();
      } else {
        r.preview.innerHTML = renderMarkdown(r.textarea.value);
        r.preview.hidden = false;
        r.textarea.hidden = true;
      }
    },
  });

  r.pinBtn = iconButton({
    name: "pin",
    title: "Pin to every session",
    onClick: () => {
      const note = getState().notes.find((n) => n.id === currentId);
      if (note) updateNote(currentId, { pinned: !note.pinned });
    },
  });

  r.closeBtn = iconButton({ name: "x", title: "Close (Esc)", onClick: () => closeSheet() });

  const header = el("div", { class: "sheet-header" }, [
    r.typeSeg,
    el("div", { class: "sheet-header-actions" }, [r.previewBtn, r.pinBtn, r.closeBtn]),
  ]);

  /* metadata rail */
  r.colorRow = el("div", { class: "sheet-colors" });
  for (const c of COLORS) {
    const sw = el("button", {
      class: "color-swatch",
      type: "button",
      dataset: { color: c },
      "aria-label": `Colour ${c}`,
      onclick: () => updateNote(currentId, { color: c }),
    });
    r.colorRow.appendChild(sw);
  }

  r.folderSelect = el("select", { class: "sheet-select", "aria-label": "Folder" });
  r.folderSelect.addEventListener("change", (e) => {
    moveNoteToFolder(currentId, e.target.value || null);
  });

  r.tagsRow = el("div", { class: "sheet-tags" });
  r.tagInput = el("input", {
    class: "sheet-tag-input",
    type: "text",
    placeholder: "Add tag…",
    "aria-label": "Add tag",
  });
  r.tagInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const value = r.tagInput.value.trim().toLowerCase().replace(/^#/, "");
    if (!value) return;
    const note = getState().notes.find((n) => n.id === currentId);
    if (!note) return;
    updateNote(currentId, { tags: [...new Set([...(note.tags || []), value])] });
    r.tagInput.value = "";
  });

  r.dueInput = el("input", { class: "sheet-select", type: "datetime-local", "aria-label": "Reminder" });
  r.dueInput.addEventListener("change", () => {
    const v = r.dueInput.value;
    updateNote(currentId, v ? { dueAt: new Date(v).toISOString(), reminded: false } : { dueAt: null, reminded: false });
  });

  const meta = el("div", { class: "sheet-meta" }, [
    el("div", { class: "sheet-field" }, [el("label", {}, "Colour"), r.colorRow]),
    el("div", { class: "sheet-field" }, [el("label", {}, "Folder"), r.folderSelect]),
    el("div", { class: "sheet-field" }, [el("label", {}, "Tags"), r.tagsRow, r.tagInput]),
    el("div", { class: "sheet-field" }, [el("label", {}, "Reminder"), r.dueInput]),
  ]);

  r.stamp = el("span", { class: "sheet-stamp" });
  const footer = el("div", { class: "sheet-footer" }, [
    r.stamp,
    el(
      "button",
      {
        class: "btn btn-danger",
        type: "button",
        onclick: () => {
          const id = currentId;
          const note = deleteNote(id);
          closeSheet();
          if (note) {
            showToast("Note deleted", {
              actionLabel: "Undo",
              key: "delete",
              duration: 6000,
              onAction: () => import("../state.js").then((m) => m.undeleteNote(id)),
            });
          }
        },
      },
      [icon("trash"), el("span", {}, "Delete")],
    ),
  ]);

  r.panel = el("aside", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": "Note editor" }, [
    header,
    el("div", { class: "sheet-body" }, [r.textarea, r.preview]),
    meta,
    footer,
  ]);

  r.scrim = el("div", { class: "sheet-scrim", onclick: () => closeSheet() });
  r.root = el("div", { class: "sheet-root" }, [r.scrim, r.panel]);

  // Content edits stay SILENT so the board never re-renders mid-keystroke.
  r.textarea.addEventListener("input", () => {
    if (!currentId) return;
    updateNote(currentId, { content: r.textarea.value }, { silent: true });
  });

  r.panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      closeSheet();
      return;
    }
    if (e.key !== "Tab") return;
    const items = [...r.panel.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  return r;
}

function syncChrome(note) {
  const state = getState();
  const type = effectiveType(note);

  for (const t of TYPES) {
    refs.typeButtons[t].classList.toggle("active", type === t);
  }
  refs.autoBtn.classList.toggle("active", !note.typeLocked);

  refs.pinBtn.classList.toggle("active", !!note.pinned);
  refs.pinBtn.title = note.pinned ? "Unpin" : "Pin to every session";

  refs.panel.dataset.color = note.color;
  for (const sw of refs.colorRow.children) {
    sw.classList.toggle("active", sw.dataset.color === note.color);
  }

  // folders
  clear(refs.folderSelect);
  refs.folderSelect.appendChild(el("option", { value: "" }, "Unfiled"));
  for (const f of state.folders) {
    refs.folderSelect.appendChild(
      el("option", { value: f.id, selected: note.folderId === f.id ? "" : null }, f.name),
    );
  }
  refs.folderSelect.value = note.folderId || "";

  // tags
  clear(refs.tagsRow);
  for (const tag of note.tags || []) {
    const chip = el("span", { class: "sheet-tag" }, `#${tag}`);
    chip.appendChild(
      el(
        "button",
        {
          class: "sheet-tag-x",
          type: "button",
          "aria-label": `Remove ${tag}`,
          onclick: () => updateNote(currentId, { tags: (note.tags || []).filter((t) => t !== tag) }),
        },
        "×",
      ),
    );
    refs.tagsRow.appendChild(chip);
  }

  if (document.activeElement !== refs.dueInput) {
    refs.dueInput.value = formatDateTimeLocal(note.dueAt);
  }

  refs.stamp.textContent = `Edited ${new Date(note.updatedAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export function openSheet(noteId) {
  if (currentId === noteId) return;
  if (currentId) closeSheet({ silentFocus: true });

  const note = getState().notes.find((n) => n.id === noteId);
  if (!note) return;

  currentId = noteId;
  returnSelector = `.note-card[data-id="${noteId}"]`;
  refs = buildDom(note);
  hostEl().appendChild(refs.root);
  requestAnimationFrame(() => refs.root.classList.add("open"));

  // The sheet owns its own subscription and does targeted updates. It is never
  // rebuilt by the board's render(), so an edit in progress can't be destroyed.
  unsub = subscribe((s) => {
    const live = s.notes.find((n) => n.id === currentId);
    if (!live) return closeSheet();
    syncChrome(live);
    if (document.activeElement !== refs.textarea && refs.textarea.value !== live.content) {
      refs.textarea.value = live.content; // cross-tab / undo sync only
    }
  });

  setUi({ sheetNoteId: noteId }, { silent: true });
  refs.textarea.focus();
  const len = refs.textarea.value.length;
  refs.textarea.setSelectionRange(len, len);
}

export function closeSheet({ silentFocus = false } = {}) {
  if (!currentId) return;
  const id = currentId;
  const value = refs?.textarea?.value;
  const root = refs?.root;

  if (unsub) unsub();
  unsub = null;
  currentId = null;

  // One non-silent commit so board + sidebar counts catch up.
  const live = getState().notes.find((n) => n.id === id);
  if (live && value !== undefined && !live.encrypted && live.content !== value) {
    updateNote(id, { content: value });
  } else {
    setUi({ sheetNoteId: null });
  }
  setUi({ sheetNoteId: null }, { silent: true });

  if (root) {
    root.classList.remove("open");
    setTimeout(() => root.remove(), 200);
  }
  refs = null;

  if (!silentFocus && returnSelector) {
    const sel = returnSelector;
    requestAnimationFrame(() => document.querySelector(sel)?.focus());
  }
  returnSelector = null;
}
