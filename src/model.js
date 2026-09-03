import { uuid } from "./utils/uuid.js";
import { inferType } from "./features/noteType.js";

// Colours are NAME tokens resolved through CSS custom properties, so light and
// dark mode can each have their own ramp. Never store hex on a note.
export const COLORS = ["sand", "peach", "rose", "sage", "sky", "lilac", "slate"];
export const DEFAULT_COLOR = "sand";

const LEGACY_COLOR_MAP = {
  "#fef3a3": "sand",
  "#ffd6a5": "peach",
  "#fdb5b5": "rose",
  "#caffbf": "sage",
  "#a0e7ff": "sky",
  "#bdb2ff": "lilac",
  "#ffc6ff": "rose",
  "#e2e2e2": "slate",
};

export function colorNameFromLegacy(value) {
  if (!value) return DEFAULT_COLOR;
  if (COLORS.includes(value)) return value;
  return LEGACY_COLOR_MAP[String(value).toLowerCase()] || DEFAULT_COLOR;
}

export function createNote(partial = {}) {
  const now = new Date().toISOString();
  const content = partial.content ?? "";
  return {
    id: partial.id ?? uuid(),
    content,
    type: partial.type ?? inferType(content),
    typeLocked: !!partial.typeLocked,
    color: colorNameFromLegacy(partial.color),
    tags: Array.isArray(partial.tags) ? [...partial.tags] : [],
    pinned: !!partial.pinned,
    folderId: partial.folderId ?? null,
    sessionId: partial.sessionId ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    dueAt: partial.dueAt ?? null,
    reminded: !!partial.reminded,
    deletedAt: partial.deletedAt ?? null,
    order: typeof partial.order === "number" ? partial.order : Date.now(),
    encrypted: !!partial.encrypted,
    ciphertext: partial.ciphertext ?? null,
  };
}

export function validateNote(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.id !== "string" || !value.id) return null;
  return createNote(value);
}

export function createFolder(partial = {}) {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? uuid(),
    name: String(partial.name ?? "Untitled").slice(0, 60),
    createdAt: partial.createdAt ?? now,
    order: typeof partial.order === "number" ? partial.order : Date.now(),
  };
}

export function validateFolder(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.id !== "string" || !value.id) return null;
  if (typeof value.name !== "string" || !value.name) return null;
  return createFolder(value);
}

export function extractTagsFromContent(content) {
  const matches = String(content || "").match(/(^|\s)#([a-z0-9_-]+)/gi) || [];
  return [...new Set(matches.map((m) => m.trim().replace(/^#/, "").toLowerCase()))];
}
