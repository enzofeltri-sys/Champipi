// Service worker : l'appli s'ouvre même sans réseau, et les cartes téléchargées (Plan IGN) restent disponibles hors ligne.
const VERSION = 'champi-v10';
const TILES = 'champi-tuiles-v1';           // cartes enregistrées par l'utilisateur (menu « Cartes hors ligne »)
const SHELL = [
  './', 'index.html', 'css/app.css', 'js/app.js', 'js/logic.js', 'js/config.js', 'js/photos.js', 'js/advisor.js', 'js/weather.js',
  'js/access.js', 'js/offline.js', 'data/massifs-acces.json',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/supabase.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== TILES).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Tuiles Plan IGN : d'abord celles enregistrées sur le téléphone, sinon le réseau.
  if (url.host === 'data.geopf.fr' && url.searchParams.get('LAYER') === 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2') {
    e.respondWith(caches.open(TILES).then((c) => c.match(e.request.url)).then((hit) => hit || fetch(e.request)));
    return;
  }
  if (url.origin !== location.origin) return;
  // Appli : réseau d'abord (dernière version), copie locale en secours.
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
