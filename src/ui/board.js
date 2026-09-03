import { el, clear } from "../utils/dom.js";
import { renderCard } from "./card.js";
import { buildDraft } from "./composer.js";
import { installBoardDrag } from "./drag.js";
import { openSheet } from "./sheet.js";
import { filterNotes, sortNotes, uniqueTags } from "../features/search.js";
import { setUi, deleteNote, undeleteNote, purgeNote, emptyTrash, getState } from "../state.js";
import { showToast } from "./toast.js";
import { confirmModal } from "./modal.js";
import { SESSION_ID } from "../session.js";
import { icon } from "./icons.js";

function scopeNotes(state) {
  const { view, activeFolderId } = state.ui;
  if (view === "trash") return state.trash;
  if (view === "all") return state.notes;
  if (view === "folder") {
    if (activeFolderId === "__unfiled__") return state.notes.filter((n) => !n.folderId);
    return state.notes.filter((n) => n.folderId === activeFolderId);
  }
  // Default "this session" — pinned notes are the deliberate carry-forward.
  return state.notes.filter((n) => n.sessionId === SESSION_ID || n.pinned);
}

function viewTitle(state) {
  const { view, activeFolderId } = state.ui;
  if (view === "trash") return "Recently deleted";
  if (view === "all") return "All notes";
  if (view === "folder") {
    if (activeFolderId === "__unfiled__") return "Unfiled";
    const f = state.folders.find((f) => f.id === activeFolderId);
    return f ? f.name : "All notes";
  }
  return "This session";
}

function onDelete(id) {
  const note = deleteNote(id);
  if (!note) return;
  showToast("Note deleted", {
    actionLabel: "Undo",
    key: "delete",
    duration: 6000,
    onAction: () => undeleteNote(id),
  });
}

export function renderBoard(root, state) {
  clear(root);

  const searching = !!state.ui.search.trim();
  const scoped = scopeNotes(state);
  const isTrash = state.ui.view === "trash";

  /* heading */
  const heading = el("div", { class: "board-heading" }, [
    el("h1", { class: "board-title" }, viewTitle(state)),
  ]);
  if (isTrash && state.trash.length) {
    heading.appendChild(
      el(
        "button",
        {
          class: "btn btn-quiet",
          type: "button",
          onclick: async () => {
            if (await confirmModal("Permanently delete all notes in Recently deleted?")) emptyTrash();
          },
        },
        "Empty",
      ),
    );
  }
  if (searching) {
    heading.appendChild(el("span", { class: "board-note" }, "Searching all notes"));
  }
  root.appendChild(heading);

  /* tag filter */
  const tags = uniqueTags(scoped);
  if (tags.length && !isTrash) {
    const bar = el("div", { class: "tag-filter-bar" });
    bar.appendChild(
      el(
        "button",
        { class: `tag-chip ${!state.ui.activeTag ? "active" : ""}`, type: "button",
          onclick: () => setUi({ activeTag: null }) },
        "All",
      ),
    );
    for (const tag of tags) {
      bar.appendChild(
        el(
          "button",
          { class: `tag-chip ${state.ui.activeTag === tag ? "active" : ""}`, type: "button",
            onclick: () => setUi({ activeTag: state.ui.activeTag === tag ? null : tag }) },
          `#${tag}`,
        ),
      );
    }
    root.appendChild(bar);
  }

  /* notes — search always spans every session */
  const source = searching ? (isTrash ? state.trash : state.notes) : scoped;
  const filtered = filterNotes(source, { search: state.ui.search, tag: state.ui.activeTag });
  const sorted = isTrash ? filtered : sortNotes(filtered, state.settings.sortBy);

  const board = el("div", { class: "board" });

  for (const note of sorted) {
    board.appendChild(
      renderCard(note, {
        folders: state.folders,
        view: isTrash ? "trash" : state.ui.view,
        onOpen: openSheet,
        onDelete,
        onRestore: undeleteNote,
        onPurge: purgeNote,
      }),
    );
  }

  // The trailing draft — never in trash, never while searching.
  if (!isTrash && !searching) board.appendChild(buildDraft());

  if (!sorted.length && (isTrash || searching)) {
    board.appendChild(
      el("div", { class: "empty-state" }, isTrash ? "Nothing here." : "No notes match your search."),
    );
  }

  root.appendChild(board);
  installBoardDrag(board);

  /* quiet pointer to older notes */
  if (state.ui.view === "session" && !searching) {
    const earlier = state.notes.length - scoped.length;
    if (earlier > 0) {
      root.appendChild(
        el("div", { class: "board-earlier" }, [
          el("span", {}, `${earlier} earlier note${earlier === 1 ? "" : "s"} — `),
          el(
            "button",
            { class: "linkish", type: "button", onclick: () => setUi({ view: "all", activeFolderId: null }) },
            "show all",
          ),
        ]),
      );
    }
  }

  if (isTrash && state.trash.length) {
    root.appendChild(
      el("div", { class: "board-earlier" }, "Notes here are removed automatically after 30 days."),
    );
  }
}
