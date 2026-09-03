import { el } from "../utils/dom.js";
import { icon, iconButton, TYPE_ICON } from "./icons.js";
import { renderMarkdown } from "../features/markdown.js";
import {
  effectiveType,
  deriveTitle,
  checklistStats,
  firstUrl,
  codeLanguage,
} from "../features/noteType.js";
import { daysLeftInTrash } from "../state.js";
import { SESSION_ID } from "../session.js";

function plainBody(note) {
  const body = el("div", { class: "card-text" });
  const lines = (note.content || "").split(/\r?\n/);
  // Drop the first line — it is already the title.
  const firstIdx = lines.findIndex((l) => l.trim());
  const rest = lines.slice(firstIdx + 1).join("\n").trim();
  body.innerHTML = rest ? renderMarkdown(rest) : "";
  if (!rest) body.appendChild(el("span", { class: "card-empty" }, "No additional text"));
  return body;
}

function checklistBody(note) {
  const { items, done, total } = checklistStats(note.content);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const wrap = el("div", { class: "card-checklist" });
  wrap.appendChild(
    el("div", { class: "checklist-progress" }, [
      el("span", { class: "checklist-count" }, `${done}/${total}`),
      el("span", { class: "checklist-bar" }, [
        el("span", { class: "checklist-bar-fill", style: { width: pct + "%" } }),
      ]),
    ]),
  );
  // If the title was lifted from the first checklist item, don't repeat it here.
  const title = deriveTitle(note);
  const shown = items.length && items[0].text === title ? items.slice(1) : items;
  const list = el("ul", { class: "checklist-items" });
  for (const item of shown.slice(0, 4)) {
    list.appendChild(
      el("li", { class: item.done ? "done" : "" }, [
        icon(item.done ? "checkboxOn" : "checkboxOff"),
        el("span", {}, item.text),
      ]),
    );
  }
  wrap.appendChild(list);
  return wrap;
}

function codeBody(note) {
  const content = (note.content || "").replace(/^```\w*\n?/, "").replace(/```\s*$/, "");
  const lines = content.split(/\r?\n/).slice(0, 7).join("\n");
  return el("pre", { class: "card-code" }, [el("code", {}, lines)]);
}

function linkBody(note) {
  const url = firstUrl(note.content);
  const wrap = el("div", { class: "card-link" });
  if (url) {
    const host = url.hostname.replace(/^www\./, "");
    // The title is already the host unless the note carried a markdown label,
    // so only repeat it when it adds something.
    if (deriveTitle(note) !== host) {
      wrap.appendChild(el("span", { class: "card-link-host" }, host));
    }
    const path = decodeURIComponent(url.pathname + url.search).replace(/^\//, "");
    if (path) wrap.appendChild(el("span", { class: "card-link-path" }, path));
  }
  const extra = (note.content || "")
    .split(/\r?\n/)
    .slice(1)
    .join("\n")
    .trim();
  if (extra) wrap.appendChild(el("div", { class: "card-text" }, extra));
  return wrap;
}

const BODY_BUILDERS = {
  plain: plainBody,
  checklist: checklistBody,
  code: codeBody,
  link: linkBody,
};

export function renderCard(note, { folders = [], view = "session", onOpen, onDelete, onRestore, onPurge } = {}) {
  const type = effectiveType(note);
  const inTrash = view === "trash";

  const card = el("div", {
    class: `note-card${note.pinned ? " pinned" : ""}${inTrash ? " in-trash" : ""}`,
    dataset: { id: note.id, color: note.color, type },
    tabindex: "0",
    role: "button",
    "aria-label": `${deriveTitle(note)} — ${type} note`,
  });

  /* head */
  const head = el("div", { class: "card-head" }, [
    el("span", { class: "card-type" }, [icon(TYPE_ICON[type] || "text")]),
    el("span", { class: "card-title" }, deriveTitle(note)),
  ]);
  if (note.pinned && !inTrash) {
    head.appendChild(el("span", { class: "card-pin", title: "Pinned" }, [icon("pin")]));
  }
  if (type === "code") {
    const lang = codeLanguage(note.content);
    if (lang) head.appendChild(el("span", { class: "card-badge" }, lang));
  }

  const controls = el("div", { class: "card-controls" });
  if (inTrash) {
    controls.appendChild(
      iconButton({ name: "restore", title: "Restore", onClick: (e) => { e.stopPropagation(); onRestore?.(note.id); } }),
    );
    controls.appendChild(
      iconButton({ name: "trash", title: "Delete now", danger: true, onClick: (e) => { e.stopPropagation(); onPurge?.(note.id); } }),
    );
  } else {
    controls.appendChild(
      iconButton({ name: "trash", title: "Delete", onClick: (e) => { e.stopPropagation(); onDelete?.(note.id); } }),
    );
  }
  head.appendChild(controls);
  card.appendChild(head);

  /* body */
  const body = el("div", { class: "card-body" });
  if (note.encrypted) {
    body.appendChild(el("div", { class: "card-locked" }, [icon("lock"), el("span", {}, "Locked")]));
  } else {
    body.appendChild((BODY_BUILDERS[type] || plainBody)(note));
  }
  card.appendChild(body);

  /* foot */
  const foot = el("div", { class: "card-foot" });
  const folder = note.folderId && folders.find((f) => f.id === note.folderId);
  if (folder) foot.appendChild(el("span", { class: "card-chip" }, [icon("folder"), el("span", {}, folder.name)]));
  for (const tag of (note.tags || []).slice(0, 2)) {
    foot.appendChild(el("span", { class: "card-chip subtle" }, `#${tag}`));
  }
  if (note.dueAt && !inTrash) {
    const overdue = Date.parse(note.dueAt) < Date.now();
    foot.appendChild(
      el("span", { class: `card-chip${overdue ? " overdue" : ""}` }, [
        icon("clock"),
        el("span", {}, new Date(note.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })),
      ]),
    );
  }
  if (inTrash) {
    foot.appendChild(el("span", { class: "card-chip subtle" }, `${daysLeftInTrash(note)}d left`));
  } else if (note.sessionId && note.sessionId !== SESSION_ID) {
    foot.appendChild(el("span", { class: "card-chip subtle" }, "earlier"));
  } else if (!note.sessionId) {
    foot.appendChild(el("span", { class: "card-chip subtle" }, "earlier"));
  }
  card.appendChild(foot);

  card.addEventListener("keydown", (e) => {
    if (e.target !== card) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen?.(note.id);
    }
  });

  return card;
}
