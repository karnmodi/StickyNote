export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function safeUrl(url) {
  const trimmed = String(url).trim();
  if (/^(https?:|mailto:|#|\/)/i.test(trimmed)) return trimmed;
  return "#";
}
