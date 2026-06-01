export function filterNotes(notes, { search = "", tag = null } = {}) {
  const q = search.trim().toLowerCase();
  return notes.filter((note) => {
    if (tag && !(note.tags || []).includes(tag)) return false;
    if (!q) return true;
    if (note.encrypted) return false;
    const haystack = `${note.content} ${(note.tags || []).map((t) => "#" + t).join(" ")}`.toLowerCase();
    return haystack.includes(q);
  });
}

export function sortNotes(notes, sortBy) {
  const arr = [...notes];
  switch (sortBy) {
    case "created":
      arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      break;
    case "updated":
      arr.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      break;
    case "alpha":
      arr.sort((a, b) => (a.content || "").localeCompare(b.content || ""));
      break;
    case "manual":
    default:
      arr.sort((a, b) => (a.order || 0) - (b.order || 0));
  }
  return arr.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
}

export function uniqueTags(notes) {
  const set = new Set();
  for (const note of notes) {
    for (const tag of note.tags || []) set.add(tag);
  }
  return [...set].sort();
}
