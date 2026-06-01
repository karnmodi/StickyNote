import { addNote, undo, redo } from "../state.js";

function isInField(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT" && target.type !== "checkbox" && target.type !== "button") return true;
  return false;
}

function focusFirstNote() {
  const card = document.querySelector(".note-card");
  if (card) card.focus();
  return !!card;
}

export function installShortcuts({ onSearch, onNew, onHelp, onTheme } = {}) {
  window.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const target = e.target;
    const inField = isInField(target);

    if (e.key === "Escape") {
      const backdrop = document.querySelector(".modal-backdrop");
      if (backdrop) {
        backdrop.remove();
        return;
      }
      if (target && typeof target.blur === "function") target.blur();
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

    if (mod && (e.key === "n" || e.key === "N")) {
      e.preventDefault();
      const note = addNote();
      setTimeout(() => {
        const card = document.querySelector(`.note-card[data-id="${note.id}"]`);
        if (card) {
          card.focus();
          const ta = card.querySelector(".note-textarea");
          if (ta) ta.focus();
        }
      }, 0);
      return;
    }
    if (mod && (e.key === "f" || e.key === "F")) {
      e.preventDefault();
      if (typeof onSearch === "function") onSearch();
      return;
    }

    if (inField) return;

    if (e.key === "/") {
      e.preventDefault();
      if (typeof onSearch === "function") onSearch();
      return;
    }
    if (e.key === "?") {
      e.preventDefault();
      if (typeof onHelp === "function") onHelp();
      return;
    }
    if (e.key === "n" || e.key === "N") {
      e.preventDefault();
      const note = addNote();
      setTimeout(() => {
        const card = document.querySelector(`.note-card[data-id="${note.id}"]`);
        if (card) {
          card.focus();
          const ta = card.querySelector(".note-textarea");
          if (ta) ta.focus();
        }
      }, 0);
      return;
    }
    if (e.key === "t" || e.key === "T") {
      e.preventDefault();
      if (typeof onTheme === "function") onTheme();
      return;
    }
    if (e.key === "j" || e.key === "ArrowDown") {
      if (target === document.body || target === document.documentElement) {
        e.preventDefault();
        focusFirstNote();
      }
    }
    if (e.key === "k" || e.key === "ArrowUp") {
      if (target === document.body || target === document.documentElement) {
        e.preventDefault();
        focusFirstNote();
      }
    }
  });
}
