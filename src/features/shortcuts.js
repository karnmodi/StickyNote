import { undo, redo, getState, updateNote, deleteNote, undeleteNote } from "../state.js";
import { isSheetOpen, closeSheet, openSheet } from "../ui/sheet.js";
import { focusComposer } from "../ui/composer.js";
import { showToast } from "../ui/toast.js";

function isInField(t) {
  if (!t) return false;
  if (t.isContentEditable) return true;
  if (t.tagName === "TEXTAREA") return true;
  if (t.tagName === "SELECT") return true;
  if (t.tagName === "INPUT" && t.type !== "checkbox" && t.type !== "button") return true;
  return false;
}

function focusedCard() {
  const a = document.activeElement;
  return a && a.classList?.contains("note-card") && !a.classList.contains("draft") ? a : null;
}

function moveFocus(card, key) {
  const cards = [...document.querySelectorAll(".note-card:not(.draft)")];
  const i = cards.indexOf(card);
  if (i === -1 || cards.length < 2) return;
  const rect = card.getBoundingClientRect();
  if (key === "ArrowRight" || key === "ArrowLeft") {
    const dir = key === "ArrowRight" ? 1 : -1;
    for (let j = i + dir; j >= 0 && j < cards.length; j += dir) {
      const r = cards[j].getBoundingClientRect();
      if (Math.abs(r.top - rect.top) < 20) return cards[j].focus();
    }
    return;
  }
  const dir = key === "ArrowDown" ? 1 : -1;
  let best = null;
  let bestDist = Infinity;
  for (let j = 0; j < cards.length; j++) {
    if (j === i) continue;
    const r = cards[j].getBoundingClientRect();
    if (dir === 1 ? r.top <= rect.top : r.top >= rect.top) continue;
    const d = Math.abs(r.left - rect.left) + Math.abs(r.top - rect.top) * 2;
    if (d < bestDist) {
      bestDist = d;
      best = cards[j];
    }
  }
  best?.focus();
}

export function installShortcuts({ onSearch, onHelp, onTheme } = {}) {
  window.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const target = e.target;
    const inField = isInField(target);

    if (e.key === "Escape") {
      // Sheet first, then any modal, then blur.
      if (isSheetOpen()) {
        closeSheet();
        return;
      }
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
      focusComposer();
      return;
    }
    if (mod && (e.key === "f" || e.key === "F")) {
      e.preventDefault();
      onSearch?.();
      return;
    }

    if (inField || isSheetOpen()) return;

    const card = focusedCard();

    if (e.key === "/") {
      e.preventDefault();
      onSearch?.();
      return;
    }
    if (e.key === "?") {
      e.preventDefault();
      onHelp?.();
      return;
    }
    if (e.key === "n" || e.key === "N") {
      e.preventDefault();
      focusComposer();
      return;
    }
    if (e.key === "t" || e.key === "T") {
      e.preventDefault();
      onTheme?.();
      return;
    }

    if (!card) {
      if (["ArrowDown", "ArrowUp", "j", "k"].includes(e.key)) {
        const first = document.querySelector(".note-card:not(.draft)");
        if (first) {
          e.preventDefault();
          first.focus();
        }
      }
      return;
    }

    const id = card.dataset.id;

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openSheet(id);
      return;
    }
    if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      const note = getState().notes.find((n) => n.id === id);
      if (note) updateNote(id, { pinned: !note.pinned });
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (getState().ui.view === "trash") return;
      const note = deleteNote(id);
      if (note) {
        showToast("Note deleted", {
          actionLabel: "Undo",
          key: "delete",
          duration: 6000,
          onAction: () => undeleteNote(id),
        });
      }
      return;
    }
    if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      moveFocus(card, e.key);
    }
  });
}
