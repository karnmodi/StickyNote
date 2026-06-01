import { el, clear } from "../utils/dom.js";

let active = null;

function close() {
  if (active) {
    active.remove();
    active = null;
  }
}

export function openModal({ title, body, actions, dismissible = true }) {
  close();
  const content = el("div", { class: "modal" }, [
    title ? el("h2", {}, title) : null,
    typeof body === "string" ? el("div", {}, body) : body,
    el(
      "div",
      { class: "modal-actions" },
      (actions || []).map((a) =>
        el(
          "button",
          {
            class: `btn ${a.primary ? "btn-primary" : ""}`,
            type: "button",
            onclick: () => {
              const result = a.onClick && a.onClick();
              if (result !== false) close();
            },
          },
          a.label,
        ),
      ),
    ),
  ]);
  const backdrop = el(
    "div",
    {
      class: "modal-backdrop",
      onclick: (e) => {
        if (e.target === backdrop && dismissible) close();
      },
    },
    [content],
  );
  document.body.appendChild(backdrop);
  active = backdrop;
  const focusable = content.querySelector("input, textarea, button");
  if (focusable) focusable.focus();
  return { close };
}

export function confirmModal(message) {
  return new Promise((resolve) => {
    openModal({
      title: "Confirm",
      body: message,
      actions: [
        { label: "Cancel", onClick: () => resolve(false) },
        { label: "Confirm", primary: true, onClick: () => resolve(true) },
      ],
    });
  });
}

export function promptModal({ title, label, type = "text", initial = "" }) {
  return new Promise((resolve) => {
    const input = el("input", { type, value: initial, class: "modal-input" });
    const body = el("div", {}, [el("label", {}, label), input]);
    openModal({
      title,
      body,
      actions: [
        { label: "Cancel", onClick: () => resolve(null) },
        { label: "OK", primary: true, onClick: () => resolve(input.value) },
      ],
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        resolve(input.value);
        close();
      }
    });
  });
}

export function closeModal() {
  close();
}
