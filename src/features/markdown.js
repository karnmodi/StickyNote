import { escapeHtml, safeUrl } from "../utils/sanitize.js";

function renderInline(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, label, url) => `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`,
  );
  out = out.replace(
    /(^|\s)(https?:\/\/[^\s<]+)/g,
    (_m, lead, url) => `${lead}<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${url}</a>`,
  );
  out = out.replace(/(^|\s)#([a-z0-9_-]+)/gi, (_m, lead, tag) => `${lead}<span class="tag">#${tag}</span>`);
  return out;
}

export function renderMarkdown(source) {
  const lines = String(source || "").split(/\r?\n/);
  const html = [];
  let listType = null;
  let checklistIndex = 0;

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine;
    if (!line.trim()) {
      closeList();
      continue;
    }

    const checkbox = line.match(/^\s*\[( |x|X)\]\s+(.*)$/);
    if (checkbox) {
      if (listType !== "ul") {
        closeList();
        html.push('<ul class="checklist">');
        listType = "ul";
      }
      const checked = checkbox[1].toLowerCase() === "x";
      const idx = checklistIndex++;
      html.push(
        `<li><label><input type="checkbox" data-check-index="${idx}"${checked ? " checked" : ""}/> <span>${renderInline(checkbox[2])}</span></label></li>`,
      );
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${renderInline(bullet[1])}</li>`);
      continue;
    }

    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (numbered) {
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${renderInline(numbered[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${renderInline(line)}</p>`);
  }
  closeList();
  return html.join("");
}
