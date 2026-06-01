import { reorderNotes, updateNote, getState } from "../state.js";

export function makeReorderable(noteEl, boardEl) {
  const handle = noteEl.querySelector(".note-drag-handle");
  if (!handle) return;
  handle.addEventListener("pointerdown", (e) => {
    if (getState().settings.layoutMode !== "grid") return;
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

export function makeCanvasDraggable(noteEl) {
  const handle = noteEl.querySelector(".note-drag-handle");
  if (!handle) return;
  handle.addEventListener("pointerdown", (e) => {
    if (getState().settings.layoutMode !== "canvas") return;
    e.preventDefault();
    const id = noteEl.dataset.id;
    const startX = e.clientX;
    const startY = e.clientY;
    const rect = noteEl.getBoundingClientRect();
    const parentRect = noteEl.parentElement.getBoundingClientRect();
    const startLeft = rect.left - parentRect.left + noteEl.parentElement.scrollLeft;
    const startTop = rect.top - parentRect.top + noteEl.parentElement.scrollTop;
    noteEl.classList.add("dragging");
    const move = (ev) => {
      const x = Math.max(0, startLeft + (ev.clientX - startX));
      const y = Math.max(0, startTop + (ev.clientY - startY));
      noteEl.style.left = x + "px";
      noteEl.style.top = y + "px";
    };
    const up = () => {
      noteEl.classList.remove("dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const x = parseInt(noteEl.style.left, 10) || 0;
      const y = parseInt(noteEl.style.top, 10) || 0;
      updateNote(id, { position: { x, y } }, { silent: true });
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
