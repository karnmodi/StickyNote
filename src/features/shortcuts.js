import { addNote, archiveNote, undo, redo, getState, setUi } from "../state.js";

export function installShortcuts({ onSearch, onNew, onUnlockCancel } = {}) {
  window.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const target = e.target;
    const inField =
      target &&
      (target.tagName === "TEXTAREA" ||
        (target.tagName === "INPUT" && target.type !== "checkbox") ||
        target.isContentEditable);

    if (e.key === "Escape") {
      if (document.querySelector(".modal-backdrop")) {
        if (typeof onUnlockCancel === "function") onUnlockCancel();
      }
      if (target && typeof target.blur === "function") target.blur();
      return;
    }

    if (mod && (e.key === "n" || e.key === "N")) {
      e.preventDefault();
      if (typeof onNew === "function") onNew();
      else addNote();
      return;
    }

    if (mod && (e.key === "f" || e.key === "F")) {
      e.preventDefault();
      if (typeof onSearch === "function") onSearch();
      return;
    }

    if (mod && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
      if (inField) return;
      e.preventDefault();
      undo();
      return;
    }

    if (mod && ((e.key === "z" && e.shiftKey) || e.key === "y" || e.key === "Y")) {
      if (inField) return;
      e.preventDefault();
      redo();
      return;
    }

    if ((e.key === "Delete" || e.key === "Backspace") && !inField) {
      const focusedId = getState().ui.focusedNoteId;
      if (focusedId) {
        e.preventDefault();
        archiveNote(focusedId);
        setUi({ focusedNoteId: null }, { silent: true });
      }
    }
  });
}
