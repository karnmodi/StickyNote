import { getState, replaceAll, mergeImported } from "../state.js";
import { upgradeNote, SCHEMA } from "../storage.js";
import { createFolder, validateFolder } from "../model.js";

export function exportBackup() {
  const { notes, trash, folders, settings } = getState();
  const payload = {
    app: "stickynote",
    schemaVersion: SCHEMA,
    exportedAt: new Date().toISOString(),
    notes,
    trash,
    folders,
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

/**
 * Import is the second migration path — a backup taken from v2 still carries
 * `archive`, `size` and hex colours, so it must go through the same upgrade.
 */
function normalisePayload(payload) {
  const version = Number(payload.schemaVersion) || 1;
  const folders = (Array.isArray(payload.folders) ? payload.folders : [])
    .map(validateFolder)
    .filter(Boolean);

  if (version >= 3) {
    return {
      notes: Array.isArray(payload.notes) ? payload.notes : [],
      trash: Array.isArray(payload.trash) ? payload.trash : [],
      folders,
    };
  }

  const rawNotes = Array.isArray(payload.notes) ? payload.notes : [];
  const rawArchive = Array.isArray(payload.archive) ? payload.archive : [];

  let archiveFolder = null;
  if (rawArchive.length) {
    archiveFolder =
      folders.find((f) => f.name === "Archive") || createFolder({ name: "Archive", order: -1 });
    if (!folders.some((f) => f.id === archiveFolder.id)) folders.unshift(archiveFolder);
  }

  return {
    notes: [
      ...rawNotes.filter(Boolean).map((n) => upgradeNote(n)),
      ...rawArchive.filter(Boolean).map((n) => upgradeNote(n, { folderId: archiveFolder.id })),
    ],
    trash: [],
    folders,
  };
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

  const { notes, trash, folders } = normalisePayload(payload);

  if (mode === "replace") {
    replaceAll({ notes, trash, folders, settings: payload.settings });
  } else {
    mergeImported({ notes, trash, folders });
  }
  return { imported: notes.length + trash.length };
}
