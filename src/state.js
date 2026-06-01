import { createNote, extractTagsFromContent } from "./model.js";
import {
  loadNotes,
  saveNotes,
  loadArchive,
  saveArchive,
  loadSettings,
  saveSettings,
} from "./storage.js";

const HISTORY_LIMIT = 50;

const subscribers = new Set();

const store = {
  notes: [],
  archive: [],
  settings: null,
  ui: {
    search: "",
    activeTag: null,
    showArchive: false,
    focusedNoteId: null,
    locked: false,
  },
};

const history = { past: [], future: [] };

function snapshot() {
  return {
    notes: JSON.parse(JSON.stringify(store.notes)),
    archive: JSON.parse(JSON.stringify(store.archive)),
  };
}

function restore(snap) {
  store.notes = snap.notes;
  store.archive = snap.archive;
  persistNotes();
  persistArchive();
  notify();
}

function pushHistory() {
  history.past.push(snapshot());
  if (history.past.length > HISTORY_LIMIT) history.past.shift();
  history.future.length = 0;
}

function persistNotes() {
  saveNotes(store.notes);
}

function persistArchive() {
  saveArchive(store.archive);
}

function notify() {
  for (const fn of subscribers) {
    try {
      fn(store);
    } catch (err) {
      console.error("subscriber error", err);
    }
  }
}

export function subscribe(fn) {
  subscribers.add(fn);
  fn(store);
  return () => subscribers.delete(fn);
}

export function getState() {
  return store;
}

export function init() {
  store.notes = loadNotes();
  store.archive = loadArchive();
  store.settings = loadSettings();
  notify();
}

export function reloadFromStorage() {
  store.notes = loadNotes();
  store.archive = loadArchive();
  store.settings = loadSettings();
  notify();
}

export function addNote(partial = {}) {
  pushHistory();
  const order = store.notes.length
    ? Math.max(...store.notes.map((n) => n.order || 0)) + 1
    : 1;
  const note = createNote({ ...partial, order });
  store.notes.push(note);
  persistNotes();
  notify();
  return note;
}

export function updateNote(id, patch, options = {}) {
  const idx = store.notes.findIndex((n) => n.id === id);
  if (idx === -1) return;
  if (!options.silent) pushHistory();
  const current = store.notes[idx];
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  if (patch.content !== undefined && !next.encrypted) {
    const inlineTags = extractTagsFromContent(patch.content);
    const merged = new Set([...(next.tags || []), ...inlineTags]);
    next.tags = [...merged];
  }
  store.notes[idx] = next;
  persistNotes();
  if (!options.silent) notify();
}

export function archiveNote(id) {
  const idx = store.notes.findIndex((n) => n.id === id);
  if (idx === -1) return;
  pushHistory();
  const [note] = store.notes.splice(idx, 1);
  note.archived = true;
  note.updatedAt = new Date().toISOString();
  store.archive.unshift(note);
  persistNotes();
  persistArchive();
  notify();
}

export function restoreFromArchive(id) {
  const idx = store.archive.findIndex((n) => n.id === id);
  if (idx === -1) return;
  pushHistory();
  const [note] = store.archive.splice(idx, 1);
  note.archived = false;
  note.updatedAt = new Date().toISOString();
  store.notes.push(note);
  persistNotes();
  persistArchive();
  notify();
}

export function deleteForever(id) {
  const idx = store.archive.findIndex((n) => n.id === id);
  if (idx === -1) return;
  pushHistory();
  store.archive.splice(idx, 1);
  persistArchive();
  notify();
}

export function reorderNotes(orderedIds) {
  pushHistory();
  const byId = new Map(store.notes.map((n) => [n.id, n]));
  orderedIds.forEach((id, i) => {
    const note = byId.get(id);
    if (note) note.order = i + 1;
  });
  store.notes.sort((a, b) => (a.order || 0) - (b.order || 0));
  persistNotes();
  notify();
}

export function setUi(patch, options = {}) {
  Object.assign(store.ui, patch);
  if (!options.silent) notify();
}

export function setSettings(patch) {
  store.settings = { ...store.settings, ...patch };
  saveSettings(store.settings);
  notify();
}

export function replaceAll({ notes, archive, settings }) {
  pushHistory();
  if (Array.isArray(notes)) store.notes = notes.map((n) => createNote(n));
  if (Array.isArray(archive)) store.archive = archive.map((n) => createNote(n));
  if (settings) store.settings = { ...store.settings, ...settings };
  persistNotes();
  persistArchive();
  if (settings) saveSettings(store.settings);
  notify();
}

export function mergeImported({ notes = [], archive = [] }) {
  pushHistory();
  const ids = new Set(store.notes.map((n) => n.id));
  for (const n of notes) {
    const note = createNote(n);
    if (ids.has(note.id)) note.id = createNote({}).id;
    store.notes.push(note);
  }
  const archiveIds = new Set(store.archive.map((n) => n.id));
  for (const n of archive) {
    const note = createNote(n);
    if (archiveIds.has(note.id)) note.id = createNote({}).id;
    store.archive.push(note);
  }
  persistNotes();
  persistArchive();
  notify();
}

export function undo() {
  if (!history.past.length) return false;
  history.future.push(snapshot());
  restore(history.past.pop());
  return true;
}

export function redo() {
  if (!history.future.length) return false;
  history.past.push(snapshot());
  restore(history.future.pop());
  return true;
}

export function canUndo() {
  return history.past.length > 0;
}

export function canRedo() {
  return history.future.length > 0;
}
