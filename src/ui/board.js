import { el, clear } from "../utils/dom.js";
import { renderNote } from "./note.js";
import { filterNotes, sortNotes, uniqueTags } from "../features/search.js";
import { setUi } from "../state.js";

function applyFolderFilter(notes, activeFolderId) {
  if (!activeFolderId) return notes;
  if (activeFolderId === "__unfiled__") return notes.filter((n) => !n.folderId);
  return notes.filter((n) => n.folderId === activeFolderId);
}

function currentFolderLabel(state) {
  if (state.ui.view === "archive") return "Archive";
  if (state.ui.activeFolderId === "__unfiled__") return "Unfiled";
  if (state.ui.activeFolderId) {
    const f = state.folders.find((f) => f.id === state.ui.activeFolderId);
    return f ? f.name : "All notes";
  }
  return "All notes";
}

export function renderBoard(root, state) {
  clear(root);

  const heading = el("div", { class: "board-heading" }, [
    el("h1", { class: "board-title" }, currentFolderLabel(state)),
  ]);
  root.appendChild(heading);

  const board = el("div", { class: "board board-grid" });

  if (state.ui.view === "archive") {
    if (!state.archive.length) {
      board.appendChild(el("div", { class: "empty-state" }, "No archived notes."));
    } else {
      for (const note of state.archive) {
        board.appendChild(
          renderNote(note, { boardEl: board, archived: true, folders: state.folders }),
        );
      }
    }
    root.appendChild(board);
    return;
  }

  const folderScoped = applyFolderFilter(state.notes, state.ui.activeFolderId);
  const tags = uniqueTags(folderScoped);
  if (tags.length) {
    const tagBar = el("div", { class: "tag-filter-bar" });
    tagBar.appendChild(
      el(
        "button",
        {
          class: `tag-chip ${!state.ui.activeTag ? "active" : ""}`,
          type: "button",
          tabindex: "0",
          onclick: () => setUi({ activeTag: null }),
        },
        "all",
      ),
    );
    for (const tag of tags) {
      tagBar.appendChild(
        el(
          "button",
          {
            class: `tag-chip ${state.ui.activeTag === tag ? "active" : ""}`,
            type: "button",
            tabindex: "0",
            onclick: () =>
              setUi({ activeTag: state.ui.activeTag === tag ? null : tag }),
          },
          `#${tag}`,
        ),
      );
    }
    root.appendChild(tagBar);
  }

  const filtered = filterNotes(folderScoped, {
    search: state.ui.search,
    tag: state.ui.activeTag,
  });
  const sorted = sortNotes(filtered, state.settings.sortBy);

  if (!sorted.length) {
    board.appendChild(
      el(
        "div",
        { class: "empty-state" },
        state.notes.length
          ? "No notes match your filters."
          : "No notes yet. Press N to add one.",
      ),
    );
  } else {
    for (const note of sorted) {
      board.appendChild(
        renderNote(note, { boardEl: board, folders: state.folders }),
      );
    }
  }

  root.appendChild(board);
}
