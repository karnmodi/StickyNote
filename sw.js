const CACHE = "stickynote-v2-shell";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./src/main.js",
  "./src/storage.js",
  "./src/state.js",
  "./src/model.js",
  "./src/css/base.css",
  "./src/css/layout.css",
  "./src/css/note.css",
  "./src/utils/uuid.js",
  "./src/utils/dom.js",
  "./src/utils/debounce.js",
  "./src/utils/sanitize.js",
  "./src/features/markdown.js",
  "./src/features/checklist.js",
  "./src/features/search.js",
  "./src/features/shortcuts.js",
  "./src/features/reminders.js",
  "./src/features/encryption.js",
  "./src/features/backup.js",
  "./src/ui/board.js",
  "./src/ui/note.js",
  "./src/ui/toolbar.js",
  "./src/ui/modal.js",
  "./src/ui/drag.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (!res || res.status !== 200 || res.type === "opaque") return res;
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => cached);
    }),
  );
});
