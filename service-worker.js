const CACHE = "tournament-universe-v45-0-4-track-visibility";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./fifa9-experience-hub.css",
  "./final-chapter-progression.css",
  "./app.js",
  "./formula-reborn/formula-reborn-loader.js",
  "./formula-reborn/formula-reborn.css",
  "./formula-reborn/app/formula-reborn-app.js",
  "./formula-reborn/app/race-session.js",
  "./formula-reborn/engine/renderer.js",
  "./formula-reborn/engine/game-loop.js",
  "./formula-reborn/engine/vehicle-physics.js",
  "./formula-reborn/engine/input-controller.js",
  "./formula-reborn/engine/camera-controller.js",
  "./formula-reborn/engine/lap-timing.js",
  "./formula-reborn/engine/ghost-system.js",
  "./formula-reborn/engine/audio-system.js",
  "./formula-reborn/tracks/track-schema.js",
  "./formula-reborn/tracks/track-builder.js",
  "./formula-reborn/tracks/index.js",
  "./formula-reborn/tracks/oruc-reis-coastal.js",
  "./formula-reborn/tracks/filyos-harbour.js",
  "./formula-reborn/tracks/dragon-mountain.js",
  "./formula-reborn/cloud/leaderboard-service.js",
  "./formula-reborn/cloud/session-validator.js",
  "./fifa9-experience-hub.js",
  "./season-hub.js",
  "./season-hub.css",
  "./league-result-integrity.css",
  "./oruc-reis-single-match.css",
  "./season-experience.js",
  "./season-experience.css",
  "./manager-room.js",
  "./manager-match-engine.js",
  "./me4-worker-bridge.js",
  "./me4-match-worker.js",
  "./manager-match-engine-v4-phase13-safe.bundle.js",
  "./manager-room.css",
  "./manager-season-closure.css",
  "./all-time-elite.css",
  "./me4-simulate.css",
  "./manager-friendly.css",
  "./manager-v42-4.css",
  "./manager-v42-5.css",
  "./manager-v42-5-levels.css",
  "./data/manager-bootstrap-v42.json",
  "./data/manager-team-catalog-fc25.json",
  "./language.js",
  "./cloud.js",
  "./chat.js",
  "./community.js",
  "./data/historical-data.js",
  "./assets/f9-mark.svg",
  "./assets/trophies/premier-league.svg",
  "./assets/trophies/championship.svg",
  "./assets/trophies/oruc-reis-cup.svg",
  "./assets/trophies/super-cup.svg",
  "./manifest.webmanifest"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => Promise.allSettled(APP_SHELL.map(url => cache.add(url)))));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))),
      self.clients.claim()
    ])
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.hostname.includes("supabase.co")) return;

  // Configuration must always be read fresh after a redeploy.
  if (url.pathname.endsWith("/cloud-config.js")) {
    event.respondWith(fetch(request, { cache: "no-store" }).catch(() => caches.match(request)));
    return;
  }

  // Network-first keeps future website updates visible, with offline fallback.
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.ok && (response.type === "basic" || response.type === "cors")) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then(hit => hit || caches.match("./index.html")))
  );
});
