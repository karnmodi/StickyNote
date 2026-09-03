import { createNote, createFolder, extractTagsFromContent } from "./model.js";
import { inferType } from "./features/noteType.js";
import {
  loadNotes,
  saveNotes,
  loadTrash,
  saveTrash,
  loadFolders,
  saveFolders,
  loadSettings,
  saveSettings,
  TRASH_RETENTION_DAYS,
} from "./storage.js";

const HISTORY_LIMIT = 50;

const subscribers = new Set();

const store = {
  notes: [],
  trash: [],
  folders: [],
  settings: null,
  ui: {
    search: "",
    activeTag: null,
    activeFolderId: null,
    view: "session", // 'session' | 'all' | 'folder' | 'trash'
    focusedNoteId: null,
    sheetNoteId: null,
  },
};

const history = { past: [], future: [] };

function snapshot() {
  return {
    notes: JSON.parse(JSON.stringify(store.notes)),
    trash: JSON.parse(JSON.stringify(store.trash)),
    folders: JSON.parse(JSON.stringify(store.folders)),
  };
}

function restore(snap) {
  store.notes = snap.notes;
  store.trash = snap.trash || [];
  store.folders = snap.folders || [];
  persistNotes();
  persistTrash();
  persistFolders();
  notify();
}

function pushHistory() {
  history.past.push(snapshot());
  if (history.past.length > HISTORY_LIMIT) history.past.shift();
  history.future.length = 0;
}

/** Used by the composer to undo the pushHistory from a discarded draft. */
export function dropHistoryTop() {
  history.past.pop();
}

function persistNotes() {
  saveNotes(store.notes);
}
function persistTrash() {
  saveTrash(store.trash);
}
function persistFolders() {
  saveFolders(store.folders);
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

export { notify };

export function subscribe(fn) {
  subscribers.add(fn);
  fn(store);
  return () => subscribers.delete(fn);
}

export function getState() {
  return store;
}

export function getNote(id) {
  return store.notes.find((n) => n.id === id) || store.trash.find((n) => n.id === id) || null;
}

export function init() {
  store.notes = loadNotes();
  store.trash = loadTrash();
  store.folders = loadFolders();
  store.settings = loadSettings();
  notify();
}

export function reloadFromStorage() {
  store.notes = loadNotes();
  store.trash = loadTrash();
  store.folders = loadFolders();
  store.settings = loadSettings();
  notify();
}

/* ---------------------------------------------------------------- notes */

export function addNote(partial = {}, options = {}) {
  pushHistory();
  const order = store.notes.length
    ? Math.max(...store.notes.map((n) => n.order || 0)) + 1
    : 1;
  const note = createNote({ ...partial, order });
  if (note.content) {
    note.tags = [...new Set([...note.tags, ...extractTagsFromContent(note.content)])];
  }
  store.notes.push(note);
  persistNotes();
  if (!options.silent) notify();
  return note;
}

export function updateNote(id, patch, options = {}) {
  const idx = store.notes.findIndex((n) => n.id === id);
  if (idx === -1) return;
  if (!options.silent) pushHistory();
  const current = store.notes[idx];
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };

  if (patch.content !== undefined && !next.encrypted) {
    // Tags = inline tags currently in the text, plus manual tags that were
    // never inline. Deleting "#foo" from the text now actually drops the tag.
    const previousInline = extractTagsFromContent(current.content);
    const nextInline = extractTagsFromContent(patch.content);
    const manual = (current.tags || []).filter((t) => !previousInline.includes(t));
    next.tags = [...new Set([...manual, ...nextInline])];
    if (!next.typeLocked) next.type = inferType(patch.content);
  }

  store.notes[idx] = next;
  persistNotes();
  if (!options.silent) notify();
}

/** Remove without touching history or notifying — composer discard path. */
export function removeNoteSilently(id) {
  const idx = store.notes.findIndex((n) => n.id === id);
  if (idx === -1) return;
  store.notes.splice(idx, 1);
  persistNotes();
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

/* ---------------------------------------------------------------- trash */

export function deleteNote(id) {
  const idx = store.notes.findIndex((n) => n.id === id);
  if (idx === -1) return null;
  pushHistory();
  const [note] = store.notes.splice(idx, 1);
  note.deletedAt = new Date().toISOString();
  store.trash.unshift(note);
  persistNotes();
  persistTrash();
  if (store.ui.sheetNoteId === id) store.ui.sheetNoteId = null;
  notify();
  return note;
}

export function undeleteNote(id) {
  const idx = store.trash.findIndex((n) => n.id === id);
  if (idx === -1) return;
  pushHistory();
  const [note] = store.trash.splice(idx, 1);
  note.deletedAt = null;
  note.updatedAt = new Date().toISOString();
  store.notes.push(note);
  persistNotes();
  persistTrash();
  notify();
}

export function purgeNote(id) {
  const idx = store.trash.findIndex((n) => n.id === id);
  if (idx === -1) return;
  pushHistory();
  store.trash.splice(idx, 1);
  persistTrash();
  notify();
}

export function emptyTrash() {
  if (!store.trash.length) return;
  pushHistory();
  store.trash = [];
  persistTrash();
  notify();
}

/** Boot-time cleanup. Deliberately does NOT push history. */
export function purgeExpiredTrash(now = Date.now()) {
  const cutoff = now - TRASH_RETENTION_DAYS * 864e5;
  const kept = store.trash.filter((n) => {
    const t = Date.parse(n.deletedAt || "");
    return !Number.isFinite(t) || t > cutoff;
  });
  if (kept.length !== store.trash.length) {
    store.trash = kept;
    persistTrash();
  }
}

export function daysLeftInTrash(note) {
  const t = Date.parse(note.deletedAt || "");
  if (!Number.isFinite(t)) return TRASH_RETENTION_DAYS;
  const left = TRASH_RETENTION_DAYS - Math.floor((Date.now() - t) / 864e5);
  return Math.max(0, left);
}

/* -------------------------------------------------------------- folders */

export function addFolder(name) {
  pushHistory();
  const order = store.folders.length
    ? Math.max(...store.folders.map((f) => f.order || 0)) + 1
    : 1;
  const folder = createFolder({ name, order });
  store.folders.push(folder);
  persistFolders();
  notify();
  return folder;
}

export function renameFolder(id, name) {
  const idx = store.folders.findIndex((f) => f.id === id);
  if (idx === -1) return;
  pushHistory();
  store.folders[idx] = { ...store.folders[idx], name: String(name).slice(0, 60) };
  persistFolders();
  notify();
}

export function deleteFolder(id) {
  const idx = store.folders.findIndex((f) => f.id === id);
  if (idx === -1) return;
  pushHistory();
  store.folders.splice(idx, 1);
  for (const note of store.notes) if (note.folderId === id) note.folderId = null;
  if (store.ui.activeFolderId === id) {
    store.ui.activeFolderId = null;
    store.ui.view = "session";
  }
  persistFolders();
  persistNotes();
  notify();
}

export function moveNoteToFolder(noteId, folderId) {
  const idx = store.notes.findIndex((n) => n.id === noteId);
  if (idx === -1) return;
  pushHistory();
  store.notes[idx] = {
    ...store.notes[idx],
    folderId: folderId || null,
    updatedAt: new Date().toISOString(),
  };
  persistNotes();
  notify();
}

/* ------------------------------------------------------------- ui/state */

export function setUi(patch, options = {}) {
  Object.assign(store.ui, patch);
  if (!options.silent) notify();
}

export function setSettings(patch) {
  store.settings = { ...store.settings, ...patch };
  saveSettings(store.settings);
  notify();
}

export function replaceAll({ notes, trash, folders, settings }) {
  pushHistory();
  if (Array.isArray(notes)) store.notes = notes.map((n) => createNote(n));
  if (Array.isArray(trash)) store.trash = trash.map((n) => createNote(n));
  if (Array.isArray(folders)) store.folders = folders.map((f) => createFolder(f));
  if (settings) store.settings = { ...store.settings, ...settings };
  persistNotes();
  persistTrash();
  persistFolders();
  if (settings) saveSettings(store.settings);
  notify();
}

export function mergeImported({ notes = [], trash = [], folders = [] }) {
  pushHistory();
  const folderIds = new Set(store.folders.map((f) => f.id));
  for (const f of folders) {
    const folder = createFolder(f);
    if (folderIds.has(folder.id)) folder.id = createFolder({}).id;
    store.folders.push(folder);
    folderIds.add(folder.id);
  }
  const ids = new Set([...store.notes, ...store.trash].map((n) => n.id));
  for (const n of notes) {
    const note = createNote(n);
    if (ids.has(note.id)) note.id = createNote({}).id;
    store.notes.push(note);
    ids.add(note.id);
  }
  for (const n of trash) {
    const note = createNote(n);
    if (ids.has(note.id)) note.id = createNote({}).id;
    store.trash.push(note);
    ids.add(note.id);
  }
  persistNotes();
  persistTrash();
  persistFolders();
  notify();
}

/* ------------------------------------------------------------ undo/redo */

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

export const canUndo = () => history.past.length > 0;
export const canRedo = () => history.future.length > 0;
