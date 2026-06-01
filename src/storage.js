import { createNote, validateNote } from "./model.js";

const KEYS = {
  notes: "stickynote.v2.notes",
  archive: "stickynote.v2.archive",
  settings: "stickynote.v2.settings",
  meta: "stickynote.v2.meta",
};
const LEGACY_KEY = "stickynotes-notes";
const SCHEMA_VERSION = 2;

export const DEFAULT_SETTINGS = {
  theme: "auto",
  layoutMode: "grid",
  sortBy: "manual",
  encryptionEnabled: false,
  salt: null,
};

const listeners = new Set();

export function subscribeStorage(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(event) {
  for (const fn of listeners) {
    try {
      fn(event);
    } catch (err) {
      console.error("storage listener failed", err);
    }
  }
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`Could not parse ${key}, resetting`, err);
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (err) {
    const quota = err && (err.name === "QuotaExceededError" || err.code === 22);
    console.error("storage write failed", err);
    emit({ type: "error", error: quota ? "quota" : "write", message: err.message });
    return { ok: false, error: quota ? "quota" : "write" };
  }
}

export function loadMeta() {
  return readJson(KEYS.meta, null);
}

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...(readJson(KEYS.settings, {}) || {}) };
}

export function saveSettings(settings) {
  return writeJson(KEYS.settings, settings);
}

export function loadNotes() {
  const raw = readJson(KEYS.notes, []);
  if (!Array.isArray(raw)) return [];
  return raw.map(validateNote).filter(Boolean);
}

export function saveNotes(notes) {
  return writeJson(KEYS.notes, notes);
}

export function loadArchive() {
  const raw = readJson(KEYS.archive, []);
  if (!Array.isArray(raw)) return [];
  return raw.map(validateNote).filter(Boolean);
}

export function saveArchive(notes) {
  return writeJson(KEYS.archive, notes);
}

export function clearAll() {
  for (const key of Object.values(KEYS)) localStorage.removeItem(key);
}

export function runMigrations() {
  const legacyRaw = localStorage.getItem(LEGACY_KEY);
  if (legacyRaw) {
    let legacy = [];
    try {
      legacy = JSON.parse(legacyRaw) || [];
    } catch {
      legacy = [];
    }
    const existing = loadNotes();
    const migrated = legacy
      .filter((n) => n && typeof n === "object")
      .map((n) => createNote({ content: String(n.content ?? "") }));
    saveNotes([...existing, ...migrated]);
    localStorage.removeItem(LEGACY_KEY);
  }

  const meta = loadMeta();
  if (!meta || meta.schemaVersion !== SCHEMA_VERSION) {
    writeJson(KEYS.meta, { schemaVersion: SCHEMA_VERSION, migratedAt: new Date().toISOString() });
  }
  return { migrated: !!legacyRaw };
}

export function installCrossTabSync() {
  window.addEventListener("storage", (e) => {
    if (!e.key || !Object.values(KEYS).includes(e.key)) return;
    emit({ type: "external-change", key: e.key });
  });
}

export const STORAGE_KEYS = KEYS;
