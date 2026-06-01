import { getState, updateNote } from "../state.js";

let timer = null;
const TICK_MS = 30 * 1000;

export async function requestNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  return Notification.requestPermission();
}

function fire(note) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const body = (note.content || "").slice(0, 120) || "Sticky note reminder";
  try {
    new Notification("Sticky Note reminder", { body, tag: `stickynote-${note.id}` });
  } catch (err) {
    console.warn("notification failed", err);
  }
}

function tick() {
  const now = Date.now();
  const { notes } = getState();
  for (const note of notes) {
    if (!note.dueAt || note.reminded) continue;
    const due = Date.parse(note.dueAt);
    if (Number.isFinite(due) && due <= now) {
      fire(note);
      updateNote(note.id, { reminded: true });
    }
  }
}

export function startReminders() {
  stopReminders();
  tick();
  timer = setInterval(tick, TICK_MS);
}

export function stopReminders() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
