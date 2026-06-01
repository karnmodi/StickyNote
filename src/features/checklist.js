export function toggleChecklistItem(content, index) {
  const lines = String(content || "").split(/\r?\n/);
  let seen = -1;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s*)\[( |x|X)\](\s+.*)$/);
    if (!match) continue;
    seen++;
    if (seen !== index) continue;
    const checked = match[2].toLowerCase() === "x";
    lines[i] = `${match[1]}[${checked ? " " : "x"}]${match[3]}`;
    break;
  }
  return lines.join("\n");
}
