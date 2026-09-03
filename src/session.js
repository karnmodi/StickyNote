import { uuid } from "./utils/uuid.js";

const KEY = "stickynote.session";

// sessionStorage is per-tab: it survives a reload but a brand-new tab gets a
// fresh one. That is exactly the "clean desk per tab" semantic, with nothing
// for the user to manage. All notes still live in one localStorage store, so
// nothing is actually siloed — only the default view is scoped.
export const SESSION_ID = (() => {
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      id = uuid();
      sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Private mode with storage blocked — fall back to a per-load id.
    return uuid();
  }
})();
