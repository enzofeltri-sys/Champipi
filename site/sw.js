// Service worker : met en cache l'appli pour qu'elle s'ouvre même avec peu de réseau.
// Les données (Supabase) et les tuiles de carte passent toujours par le réseau.
const VERSION = 'champi-v8';
const SHELL = [
  './', 'index.html', 'css/app.css', 'js/app.js', 'js/logic.js', 'js/config.js', 'js/photos.js', 'js/advisor.js', 'js/weather.js',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/supabase.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Réseau d'abord (pour avoir toujours la dernière version), cache en secours.
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
