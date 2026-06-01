import { getState, replaceAll, mergeImported } from "../state.js";

export function exportBackup() {
  const { notes, archive, settings } = getState();
  const payload = {
    app: "stickynote",
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    notes,
    archive,
    settings,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `stickynote-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importBackup(file, mode = "merge") {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("File is not valid JSON");
  }
  if (!payload || payload.app !== "stickynote") {
    throw new Error("Not a StickyNote backup file");
  }
  const notes = Array.isArray(payload.notes) ? payload.notes : [];
  const archive = Array.isArray(payload.archive) ? payload.archive : [];
  if (mode === "replace") {
    replaceAll({ notes, archive, settings: payload.settings });
  } else {
    mergeImported({ notes, archive });
  }
  return { imported: notes.length + archive.length };
}
