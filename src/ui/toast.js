import { el } from "../utils/dom.js";

let host = null;
const active = new Map(); // key -> node

function ensureHost() {
  if (host && document.body.contains(host)) return host;
  host = document.getElementById("toast-host");
  if (!host) {
    host = el("div", { id: "toast-host", class: "toast-host" });
    document.body.appendChild(host);
  }
  return host;
}

export function showToast(message, options = {}) {
  const { actionLabel, onAction, duration = 4000, kind = "info", key } = options;
  const root = ensureHost();

  // Only one toast per key at a time — a burst of deletes shouldn't stack.
  const dedupeKey = key || (actionLabel ? `action:${actionLabel}` : null);
  if (dedupeKey && active.has(dedupeKey)) {
    active.get(dedupeKey).remove();
    active.delete(dedupeKey);
  }

  const toast = el("div", { class: `toast toast-${kind}`, role: "status" }, [
    el("span", { class: "toast-message" }, message),
  ]);

  let timer = null;
  const dismiss = () => {
    if (timer) clearTimeout(timer);
    toast.classList.add("leaving");
    setTimeout(() => {
      toast.remove();
      if (dedupeKey) active.delete(dedupeKey);
    }, 160);
  };

  if (actionLabel && typeof onAction === "function") {
    toast.appendChild(
      el(
        "button",
        {
          class: "toast-action",
          type: "button",
          onclick: () => {
            onAction();
            dismiss();
          },
        },
        actionLabel,
      ),
    );
  }

  root.appendChild(toast);
  if (dedupeKey) active.set(dedupeKey, toast);
  requestAnimationFrame(() => toast.classList.add("in"));
  timer = setTimeout(dismiss, duration);
  return { dismiss };
}
