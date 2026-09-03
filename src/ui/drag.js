import { reorderNotes, moveNoteToFolder, notify } from "../state.js";
import { openSheet } from "./sheet.js";

const THRESHOLD = 5;

let s = null;

function setDropTarget(next) {
  if (s && s.dropTarget === next) return;
  if (s && s.dropTarget) s.dropTarget.classList.remove("drop-target");
  if (s) s.dropTarget = next || null;
  if (next) next.classList.add("drop-target");
}

function cleanup() {
  if (!s) return;
  s.card.classList.remove("dragging");
  document.body.classList.remove("is-dragging");
  if (s.dropTarget) s.dropTarget.classList.remove("drop-target");
  try {
    s.card.releasePointerCapture?.(s.pid);
  } catch {
    /* pointer already released */
  }
}

/**
 * One delegated pointer controller for the whole board. It handles BOTH
 * reorder and drop-onto-folder, and a movement threshold distinguishes
 * click-to-open from drag — so the entire card is a valid drag surface and a
 * valid click target at once.
 */
export function installBoardDrag(boardEl) {
  boardEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const card = e.target.closest(".note-card");
    if (!card || card.classList.contains("draft")) return;
    if (e.target.closest("button, a, input, textarea, select")) return;
    if (!card.dataset.id) return;

    s = {
      card,
      id: card.dataset.id,
      x: e.clientX,
      y: e.clientY,
      pid: e.pointerId,
      moved: false,
      dropTarget: null,
      board: boardEl,
      trash: card.classList.contains("in-trash"),
    };
  });

  window.addEventListener("pointermove", (e) => {
    if (!s || e.pointerId !== s.pid) return;

    if (!s.moved) {
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < THRESHOLD) return;
      s.moved = true;
      try {
        s.card.setPointerCapture(s.pid);
      } catch {
        /* not capturable */
      }
      // .dragging sets pointer-events:none so elementFromPoint never returns
      // the dragged card itself — that bug made drops silently no-op before.
      s.card.classList.add("dragging");
      document.body.classList.add("is-dragging");
    }
    e.preventDefault();
    if (s.trash) return;

    const under = document.elementFromPoint(e.clientX, e.clientY);
    const folder = under?.closest(".sidebar-item[data-folder-id], .sidebar-item[data-view='unfiled']");
    setDropTarget(folder || null);
    if (folder) return; // folder drop wins; don't also reorder

    const over = under?.closest(".note-card:not(.dragging):not(.draft)");
    if (over && s.board.contains(over)) {
      const r = over.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2 || e.clientY > r.bottom;
      s.board.insertBefore(s.card, after ? over.nextSibling : over);
    }
  });

  window.addEventListener("pointerup", (e) => {
    if (!s || e.pointerId !== s.pid) return;
    const st = s;
    const drop = st.dropTarget;
    cleanup();
    s = null;

    if (!st.moved) {
      if (!st.trash) openSheet(st.id);
      return;
    }
    if (st.trash) return;
    if (drop) {
      moveNoteToFolder(st.id, drop.dataset.folderId || null);
      return;
    }
    reorderNotes(
      [...st.board.querySelectorAll(".note-card:not(.draft)")].map((n) => n.dataset.id).filter(Boolean),
    );
  });

  window.addEventListener("pointercancel", (e) => {
    if (!s || e.pointerId !== s.pid) return;
    const moved = s.moved;
    cleanup();
    s = null;
    // DOM order may be desynced from state — re-render from truth.
    if (moved) notify();
  });
}
