import { reorderNotes, updateNote } from "../state.js";

export function makeReorderable(noteEl, boardEl) {
  const handle = noteEl.querySelector(".note-drag-handle");
  if (!handle) return;
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    noteEl.classList.add("dragging");
    const move = (ev) => {
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      if (!target) return;
      const overNote = target.closest(".note-card");
      if (!overNote || overNote === noteEl || !boardEl.contains(overNote)) return;
      const rect = overNote.getBoundingClientRect();
      const after = ev.clientY > rect.top + rect.height / 2;
      boardEl.insertBefore(noteEl, after ? overNote.nextSibling : overNote);
    };
    const up = () => {
      noteEl.classList.remove("dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const ids = [...boardEl.querySelectorAll(".note-card")].map((n) => n.dataset.id);
      reorderNotes(ids);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
}

export function trackResize(noteEl, initialSize) {
  const body = noteEl.querySelector(".note-body");
  if (!body) return;
  let initialized = false;
  let baselineW = initialSize?.w ?? 0;
  let baselineH = initialSize?.h ?? 0;
  const observer = new ResizeObserver(() => {
    const w = body.offsetWidth;
    const h = body.offsetHeight;
    if (!initialized) {
      initialized = true;
      baselineW = w;
      baselineH = h;
      return;
    }
    if (Math.abs(w - baselineW) < 6 && Math.abs(h - baselineH) < 6) return;
    baselineW = w;
    baselineH = h;
    clearTimeout(noteEl._resizeTimer);
    noteEl._resizeTimer = setTimeout(() => {
      updateNote(noteEl.dataset.id, { size: { w, h } }, { silent: true });
    }, 300);
  });
  observer.observe(body);
  noteEl._resizeObserver = observer;
}
