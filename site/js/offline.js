// Mode hors ligne : cartes d'une zone (Plan IGN), copie locale des données, file d'envois en attente.

// ---------------------------------------------------------------------------
// Tuiles d'une zone (Web Mercator, schéma XYZ comme Leaflet).
export function lonToX(lon, z) { return Math.floor(((lon + 180) / 360) * 2 ** z); }
export function latToY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * 2 ** z);
}
/** Liste des tuiles {z, x, y} couvrant la zone, des zooms zMin à zMax. */
export function tilesFor(bounds, zMin, zMax) {
  const out = [];
  for (let z = zMin; z <= zMax; z++) {
    const x0 = lonToX(bounds.west, z), x1 = lonToX(bounds.east, z);
    const y0 = latToY(bounds.north, z), y1 = latToY(bounds.south, z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ z, x, y });
  }
  return out;
}
/** Zoom maximal possible sans dépasser `limit` tuiles (au moins zMin). */
export function bestMaxZoom(bounds, zMin, zCap, limit) {
  let best = zMin;
  for (let z = zMin; z <= zCap; z++) { if (tilesFor(bounds, zMin, z).length <= limit) best = z; else break; }
  return best;
}
export const PLAN_IGN = (z, x, y) => `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}&FORMAT=image/png`;
export const TILE_CACHE = 'champi-tuiles-v1';
export const TILE_LIMIT = 1500;

// ---------------------------------------------------------------------------
// Erreur réseau (pas de connexion) plutôt qu'erreur du serveur.
export function isNetworkError(err) {
  const m = String(err?.message ?? err ?? '');
  return /Failed to fetch|NetworkError|Load failed|network|fetch failed|ERR_INTERNET|ERR_NAME/i.test(m);
}

// ---------------------------------------------------------------------------
// File d'envois en attente (IndexedDB : supporte les photos en Blob).
const DB = 'champi-hors-ligne', STORE = 'envois';
function openDb() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'qid', autoIncrement: true });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}
async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((ok, ko) => {
    const t = db.transaction(STORE, mode); const s = t.objectStore(STORE);
    const res = fn(s);
    t.oncomplete = () => ok(res?.result ?? res);
    t.onerror = () => ko(t.error);
  });
}
export const queue = {
  add: (item) => tx('readwrite', (s) => s.add({ ...item, at: Date.now() })),
  all: () => tx('readonly', (s) => s.getAll()),
  remove: (qid) => tx('readwrite', (s) => s.delete(qid)),
};

/** Ajoute aux données affichées ce qui attend d'être envoyé (marqué pending). */
export function mergePending(state, items) {
  const spots = [...state.spots], finds = [...state.finds];
  for (const it of items) {
    if (it.kind === 'spot' && !spots.some((s) => s.id === it.row.id)) spots.push({ ...it.row, pending: true });
    if (it.kind === 'find' && !finds.some((f) => f.id === it.row.id)) finds.unshift({ ...it.row, pending: true, pendingPhotos: it.files?.length ?? 0 });
  }
  return { spots, finds };
}

/** Ordre d'envoi : les coins avant les trouvailles (qui peuvent y faire référence). */
export function sendOrder(items) {
  return [...items].sort((a, b) => (a.kind === b.kind ? a.qid - b.qid : a.kind === 'spot' ? -1 : 1));
}
