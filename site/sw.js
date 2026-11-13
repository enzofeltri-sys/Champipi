// Service worker : l'appli s'ouvre même sans réseau, et les cartes téléchargées (Plan IGN) restent disponibles hors ligne.
const VERSION = 'champi-v56';
const TILES = 'champi-tuiles-v1';           // cartes enregistrées par l'utilisateur (menu « Cartes hors ligne »)
const SHELL = [
  './', 'index.html', 'css/app.css', 'js/app.js', 'js/logic.js', 'js/config.js', 'js/photos.js', 'js/advisor.js', 'js/weather.js',
  'js/access.js', 'js/offline.js', 'js/learn.js', 'js/forests.js', 'js/avatars.js', 'js/here.js', 'js/moment-map.js', 'js/rain.js', 'js/journal.js', 'js/species-info.js', 'js/terrain.js', 'data/massifs-acces.json', 'data/phenology-paca.json', 'data/soil-grid.json', 'js/soil.js',
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
  // Appli : réseau d'abord (dernière version), copie locale en secours. « no-cache » : le navigateur revérifie
  // chaque fichier auprès du serveur (sinon GitHub Pages le garde 10 min et une mise à jour n'arrive pas tout de suite).
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache' }).then((res) => {   // l'adresse seule : une requête de navigation ne se recopie pas avec des options
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});

// Alertes de pousse
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || '🍄 Carnet de champignons', {
    body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag || 'champi', data: { url: d.url || './' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.registration.scope));
    if (open) { open.navigate(url).catch(() => {}); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});
