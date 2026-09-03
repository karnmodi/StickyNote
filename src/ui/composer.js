import { el } from "../utils/dom.js";
import { icon } from "./icons.js";
import {
  addNote,
  updateNote,
  removeNoteSilently,
  dropHistoryTop,
  getState,
  notify,
} from "../state.js";
import { SESSION_ID } from "../session.js";
import { debounce } from "../utils/debounce.js";

const VIRTUAL = new Set(["__unfiled__", "__session__", "__trash__", "__all__"]);

function scopeFolderId() {
  const { ui } = getState();
  const id = ui.activeFolderId;
  if (!id || VIRTUAL.has(id)) return null;
  return id;
}

export function focusComposer() {
  const ta = document.querySelector(".note-card.draft .draft-input");
  if (ta) {
    ta.focus();
    return true;
  }
  return false;
}

export function buildDraft() {
  let draftNoteId = null;

  const ta = el("textarea", {
    class: "draft-input",
    placeholder: "Write something…",
    spellcheck: "true",
    rows: "1",
  });

  const node = el("div", { class: "note-card draft", dataset: { color: "sand" } }, [
    el("div", { class: "card-head" }, [
      el("span", { class: "card-type" }, [icon("plus")]),
      el("span", { class: "card-title muted" }, "New note"),
    ]),
    el("div", { class: "card-body" }, [ta]),
    el("div", { class: "card-foot" }),
  ]);

  const commit = debounce((value) => {
    if (draftNoteId) updateNote(draftNoteId, { content: value }, { silent: true });
  }, 250);

  ta.addEventListener("input", () => {
    if (!draftNoteId) {
      if (!ta.value.trim()) return;
      // Materialise in place: no notify(), so this DOM node — and the caret
      // inside it — survives. The board is not re-rendered.
      const note = addNote(
        { content: ta.value, folderId: scopeFolderId(), sessionId: SESSION_ID },
        { silent: true },
      );
      draftNoteId = note.id;
      node.dataset.id = note.id;
      node.classList.remove("draft");
      node.classList.add("materialised");
      const title = node.querySelector(".card-title");
      if (title) title.classList.remove("muted");
      node.after(buildDraft()); // fresh empty draft to the right
    } else {
      commit(ta.value);
    }
    const title = node.querySelector(".card-title");
    if (title) title.textContent = ta.value.split(/\r?\n/)[0].slice(0, 60) || "New note";
  });

  ta.addEventListener("blur", () => {
    commit.cancel();
    if (!draftNoteId) return;

    const id = draftNoteId;
    draftNoteId = null;

    // Cross-tab reload may have replaced store.notes wholesale.
    const stillThere = getState().notes.some((n) => n.id === id);
    if (!stillThere) return;

    if (!ta.value.trim()) {
      removeNoteSilently(id);
      dropHistoryTop(); // undo the pushHistory from addNote — no junk in history
      notify();
      return;
    }
    updateNote(id, { content: ta.value }); // non-silent → renders the real card
  });

  ta.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      ta.blur();
    }
  });

  return node;
}
