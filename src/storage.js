import {
  createNote,
  createFolder,
  validateNote,
  validateFolder,
  colorNameFromLegacy,
} from "./model.js";
import { inferType } from "./features/noteType.js";

const KEYS = {
  notes: "stickynote.v3.notes",
  trash: "stickynote.v3.trash",
  folders: "stickynote.v3.folders",
  settings: "stickynote.v3.settings",
  meta: "stickynote.v3.meta",
};

const V2 = {
  notes: "stickynote.v2.notes",
  archive: "stickynote.v2.archive",
  folders: "stickynote.v2.folders",
  settings: "stickynote.v2.settings",
  meta: "stickynote.v2.meta",
};

const LEGACY_KEY = "stickynotes-notes";
const SCHEMA_VERSION = 3;
export const TRASH_RETENTION_DAYS = 30;

export const DEFAULT_SETTINGS = {
  theme: "auto",
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
    console.warn(`Could not parse ${key}, using fallback`, err);
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

export function loadTrash() {
  const raw = readJson(KEYS.trash, []);
  if (!Array.isArray(raw)) return [];
  return raw.map(validateNote).filter(Boolean);
}

export function saveTrash(notes) {
  return writeJson(KEYS.trash, notes);
}

export function loadFolders() {
  const raw = readJson(KEYS.folders, []);
  if (!Array.isArray(raw)) return [];
  return raw.map(validateFolder).filter(Boolean);
}

export function saveFolders(folders) {
  return writeJson(KEYS.folders, folders);
}

export function clearAll() {
  for (const key of Object.values(KEYS)) localStorage.removeItem(key);
}

/**
 * Normalise any pre-v3 note record into the v3 shape. Shared by runMigrations
 * and by backup import, which is the second (easily forgotten) migration path.
 */
export function upgradeNote(raw, extra = {}) {
  const merged = { ...raw, ...extra };
  delete merged.size;
  delete merged.archived;
  delete merged.position;
  return createNote({
    ...merged,
    color: colorNameFromLegacy(raw.color),
    sessionId: merged.sessionId ?? null,
    deletedAt: merged.deletedAt ?? null,
    typeLocked: !!merged.typeLocked,
    type: raw.encrypted ? "plain" : inferType(raw.content || ""),
  });
}

function migrateLegacyToV2() {
  const legacyRaw = localStorage.getItem(LEGACY_KEY);
  if (!legacyRaw) return;
  let legacy = [];
  try {
    legacy = JSON.parse(legacyRaw) || [];
  } catch {
    legacy = [];
  }
  const existing = readJson(V2.notes, []) || [];
  const migrated = legacy
    .filter((n) => n && typeof n === "object")
    .map((n) => ({ id: undefined, content: String(n.content ?? "") }));
  writeJson(V2.notes, [...existing, ...migrated]);
  localStorage.removeItem(LEGACY_KEY);
}

export function runMigrations() {
  migrateLegacyToV2();

  const meta = loadMeta();
  if (meta && meta.schemaVersion >= SCHEMA_VERSION) return { migrated: false };

  const v2notes = readJson(V2.notes, []) || [];
  const v2archive = readJson(V2.archive, []) || [];
  const v2folders = readJson(V2.folders, []) || [];
  const v2settings = readJson(V2.settings, {}) || {};

  const folders = v2folders.map(validateFolder).filter(Boolean);

  // v2 "archived" notes are NOT lost — they become a real folder.
  let archiveFolder = null;
  if (v2archive.length) {
    archiveFolder =
      folders.find((f) => f.name === "Archive") || createFolder({ name: "Archive", order: -1 });
    if (!folders.some((f) => f.id === archiveFolder.id)) folders.unshift(archiveFolder);
  }

  const notes = [
    ...v2notes.filter((n) => n && typeof n === "object").map((n) => upgradeNote(n)),
    ...v2archive
      .filter((n) => n && typeof n === "object")
      .map((n) => upgradeNote(n, { folderId: archiveFolder.id })),
  ];

  writeJson(KEYS.notes, notes);
  writeJson(KEYS.trash, []);
  writeJson(KEYS.folders, folders);
  writeJson(KEYS.settings, { ...DEFAULT_SETTINGS, ...v2settings, layoutMode: undefined });
  writeJson(KEYS.meta, {
    schemaVersion: SCHEMA_VERSION,
    migratedAt: new Date().toISOString(),
    migratedFrom: 2,
  });

  // v2 keys are deliberately left in place as one-time insurance.
  return { migrated: true, count: notes.length };
}

export function installCrossTabSync() {
  window.addEventListener("storage", (e) => {
    if (!e.key || !Object.values(KEYS).includes(e.key)) return;
    emit({ type: "external-change", key: e.key });
  });
}

export const STORAGE_KEYS = KEYS;
export const SCHEMA = SCHEMA_VERSION;
