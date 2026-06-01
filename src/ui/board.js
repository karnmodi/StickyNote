import { el, clear } from "../utils/dom.js";
import { renderNote } from "./note.js";
import { filterNotes, sortNotes, uniqueTags } from "../features/search.js";
import { setUi } from "../state.js";

export function renderBoard(root, state) {
  clear(root);
  const layoutMode = state.settings.layoutMode || "grid";
  const board = el("div", {
    class: `board board-${layoutMode}`,
    dataset: { layout: layoutMode },
  });

  if (state.ui.showArchive) {
    if (!state.archive.length) {
      board.appendChild(el("div", { class: "empty-state" }, "No archived notes."));
    } else {
      for (const note of state.archive) {
        board.appendChild(renderNote(note, { boardEl: board, archived: true, layoutMode }));
      }
    }
    root.appendChild(board);
    return;
  }

  const tags = uniqueTags(state.notes);
  if (tags.length) {
    const tagBar = el("div", { class: "tag-filter-bar" });
    tagBar.appendChild(
      el(
        "button",
        {
          class: `tag-chip ${!state.ui.activeTag ? "active" : ""}`,
          type: "button",
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
            onclick: () =>
              setUi({ activeTag: state.ui.activeTag === tag ? null : tag }),
          },
          `#${tag}`,
        ),
      );
    }
    root.appendChild(tagBar);
  }

  const filtered = filterNotes(state.notes, {
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
          : "No notes yet. Click + to add one, or press Ctrl/Cmd+N.",
      ),
    );
  } else {
    for (const note of sorted) {
      board.appendChild(renderNote(note, { boardEl: board, layoutMode }));
    }
  }

  root.appendChild(board);
}
