import { uuid } from "./utils/uuid.js";

export const COLORS = [
  "#fef3a3",
  "#ffd6a5",
  "#fdb5b5",
  "#caffbf",
  "#a0e7ff",
  "#bdb2ff",
  "#ffc6ff",
  "#e2e2e2",
];

export const DEFAULT_COLOR = COLORS[0];
export const DEFAULT_SIZE = { w: 220, h: 220 };

export function createNote(partial = {}) {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? uuid(),
    content: partial.content ?? "",
    color: partial.color ?? DEFAULT_COLOR,
    tags: Array.isArray(partial.tags) ? [...partial.tags] : [],
    pinned: !!partial.pinned,
    archived: !!partial.archived,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    dueAt: partial.dueAt ?? null,
    reminded: !!partial.reminded,
    position: partial.position ?? null,
    size: partial.size ? { ...DEFAULT_SIZE, ...partial.size } : { ...DEFAULT_SIZE },
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

export function extractTagsFromContent(content) {
  const matches = String(content || "").match(/(^|\s)#([a-z0-9_-]+)/gi) || [];
  return [...new Set(matches.map((m) => m.trim().replace(/^#/, "").toLowerCase()))];
}
