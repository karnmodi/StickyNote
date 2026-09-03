export const TYPES = ["plain", "checklist", "code", "link"];

const RE_CHECK = /^[ \t]*(?:[-*]\s*)?\[[ xX]\][ \t]+\S/m;
const RE_FENCE = /^```/m;
const RE_URL = /^(https?:\/\/[^\s]+)$/i;
const RE_MDLINK = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/i;
const RE_CODEY =
  /[;{}()=]\s*$|^\s{2,}\S|^(?:import|export|function|const|let|var|class|def|return|SELECT|#include|package|public|private)\b/;

export function inferType(content) {
  const text = String(content || "").trim();
  if (!text) return "plain";
  const lines = text.split(/\r?\n/);
  const body = lines.filter((l) => l.trim());

  if (RE_CHECK.test(text)) return "checklist";
  if (RE_FENCE.test(text) || text.startsWith("#!")) return "code";
  if (lines.length === 1 && (RE_URL.test(text) || RE_MDLINK.test(text))) return "link";
  if (
    body.length >= 2 &&
    body.filter((l) => RE_CODEY.test(l)).length / body.length >= 0.6
  ) {
    return "code";
  }
  return "plain";
}

export function effectiveType(note) {
  if (!note) return "plain";
  if (note.encrypted) return "plain";
  return note.typeLocked ? note.type || "plain" : inferType(note.content);
}

export function firstUrl(content) {
  const md = String(content || "").trim().match(RE_MDLINK);
  const raw = md ? md[2] : (String(content || "").match(/https?:\/\/[^\s)]+/) || [])[0];
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function linkLabel(content) {
  const md = String(content || "").trim().match(RE_MDLINK);
  return md ? md[1] : null;
}

export function codeLanguage(content) {
  const m = String(content || "").match(/^```(\w+)/);
  return m ? m[1] : null;
}

const STRIP = [
  [/^#{1,6}\s+/, ""],
  [/^\s*(?:[-*]\s*)?\[[ xX]\]\s+/, ""],
  [/^\s*[-*]\s+/, ""],
  [/^\s*\d+\.\s+/, ""],
  [/`/g, ""],
  [/\*\*/g, ""],
];

export function deriveTitle(note) {
  if (!note) return "Untitled";
  if (note.encrypted) return "Encrypted note";
  const content = note.content || "";
  const type = effectiveType(note);

  if (type === "link") {
    const label = linkLabel(content);
    if (label) return label.slice(0, 60);
    const url = firstUrl(content);
    if (url) return url.hostname.replace(/^www\./, "");
  }

  const lines = content.split(/\r?\n/);
  let first = lines.find((l) => l.trim() && !/^```/.test(l.trim())) || "";
  for (const [re, to] of STRIP) first = first.replace(re, to);
  first = first.trim().slice(0, 60);

  if (first) return first;
  if (type === "code") {
    const lang = codeLanguage(content);
    if (lang) return lang;
  }
  return "Untitled";
}

export function checklistStats(content) {
  const lines = String(content || "").split(/\r?\n/);
  const items = [];
  for (const line of lines) {
    const m = line.match(/^[ \t]*(?:[-*]\s*)?\[([ xX])\][ \t]+(.*)$/);
    if (m) items.push({ done: m[1].toLowerCase() === "x", text: m[2].trim() });
  }
  return { items, done: items.filter((i) => i.done).length, total: items.length };
}
