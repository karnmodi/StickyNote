import { createNote, createFolder, extractTagsFromContent } from "./model.js";
import {
  loadNotes,
  saveNotes,
  loadArchive,
  saveArchive,
  loadFolders,
  saveFolders,
  loadSettings,
  saveSettings,
} from "./storage.js";

const HISTORY_LIMIT = 50;

const subscribers = new Set();

const store = {
  notes: [],
  archive: [],
  folders: [],
  settings: null,
  ui: {
    search: "",
    activeTag: null,
    activeFolderId: null,
    view: "notes",
    focusedNoteId: null,
    locked: false,
  },
};

const history = { past: [], future: [] };

function snapshot() {
  return {
    notes: JSON.parse(JSON.stringify(store.notes)),
    archive: JSON.parse(JSON.stringify(store.archive)),
    folders: JSON.parse(JSON.stringify(store.folders)),
  };
}

function restore(snap) {
  store.notes = snap.notes;
  store.archive = snap.archive;
  store.folders = snap.folders || [];
  persistNotes();
  persistArchive();
  persistFolders();
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
  store.folders = loadFolders();
  store.settings = loadSettings();
  notify();
}

export function reloadFromStorage() {
  store.notes = loadNotes();
  store.archive = loadArchive();
  store.folders = loadFolders();
  store.settings = loadSettings();
  notify();
}

export function addNote(partial = {}) {
  pushHistory();
  const order = store.notes.length
    ? Math.max(...store.notes.map((n) => n.order || 0)) + 1
    : 1;
  const folderId = partial.folderId ?? store.ui.activeFolderId ?? null;
  const note = createNote({ ...partial, folderId, order });
  store.notes.push(note);
  persistNotes();
  notify();
  return note;
}

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
  for (const note of store.notes) {
    if (note.folderId === id) note.folderId = null;
  }
  if (store.ui.activeFolderId === id) store.ui.activeFolderId = null;
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

export function replaceAll({ notes, archive, folders, settings }) {
  pushHistory();
  if (Array.isArray(notes)) store.notes = notes.map((n) => createNote(n));
  if (Array.isArray(archive)) store.archive = archive.map((n) => createNote(n));
  if (Array.isArray(folders)) store.folders = folders.map((f) => createFolder(f));
  if (settings) store.settings = { ...store.settings, ...settings };
  persistNotes();
  persistArchive();
  persistFolders();
  if (settings) saveSettings(store.settings);
  notify();
}

export function mergeImported({ notes = [], archive = [], folders = [] }) {
  pushHistory();
  const folderIds = new Set(store.folders.map((f) => f.id));
  for (const f of folders) {
    const folder = createFolder(f);
    if (folderIds.has(folder.id)) folder.id = createFolder({}).id;
    store.folders.push(folder);
  }
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
  persistFolders();
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
