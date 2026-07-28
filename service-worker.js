const CACHE = "oruc-reis-football-universe-v47-13-0-live-draw-ppg-engine";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./horizon-os-v47.css",
  "./horizon-os-v47.js",
  "./navigation-os-v47-1.css",
  "./navigation-os-v47-1.js",
  "./final-chapter-third-place.css",
  "./champions-podium.css",
  "./final-night-theme-v479.css",
  "./fifa10-era-dashboard-v4711.css",
  "./fifa10-league-return.css",
  "./fifa10-triple-circuit-v4712.css",
  "./fifa10-registration-cloud.js",
  "./fifa10-draw-engine-v4713.js",
  "./fifa9-experience-hub.css",
  "./fifa9-experience-hub.js",
  "./final-chapter-progression.css",
  "./all-time-elite.css",
  "./tournament-benchmark.css",
  "./app.js",
  "./language.js",
  "./cloud.js",
  "./chat.js",
  "./community.js",
  "./data/historical-data.js",
  "./assets/f10-mark.svg",
  "./assets/final/f9-final-orbit.svg",
  "./assets/trophies/fifa9-champion-gold.webp",
  "./assets/trophies/fifa9-runner-up-silver.webp",
  "./assets/trophies/fifa9-third-place-bronze.webp",
  "./manifest.webmanifest"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => Promise.allSettled(APP_SHELL.map(url => cache.add(url)))));
});

self.addEventListener("activate", event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.hostname.includes("supabase.co")) return;
  if (url.pathname.endsWith("/cloud-config.js")) {
    event.respondWith(fetch(request, { cache: "no-store" }).catch(() => caches.match(request)));
    return;
  }
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.ok && (response.type === "basic" || response.type === "cors")) {
          caches.open(CACHE).then(cache => cache.put(request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(request).then(hit => hit || caches.match("./index.html")))
  );
});
