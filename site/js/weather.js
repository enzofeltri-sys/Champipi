// Météo (Open-Meteo, gratuit, sans clé, licence CC BY 4.0 ; modèles Météo-France) et type de forêt (IGN BD Forêt V2).
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const DAILY = 'precipitation_sum,temperature_2m_max,temperature_2m_min';
const TTL = 60 * 60 * 1000;   // 1 h

const mem = new Map();
const key = (lat, lon) => `${lat.toFixed(2)},${lon.toFixed(2)}`;
function cacheGet(k) {
  const hit = mem.get(k);
  if (hit && hit.t > Date.now() - TTL) return hit.v;
  try {
    const s = JSON.parse(localStorage.getItem('champi-meteo:' + k) || 'null');
    if (s && s.t > Date.now() - TTL) { mem.set(k, s); return s.v; }
  } catch { /* stockage indisponible */ }
  return null;
}
// Nettoyage des mémos périmés (une fois par chargement de page).
let purged = false;
function purge() {
  purged = true;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k?.startsWith('champi-meteo:')) continue;
      const e = JSON.parse(localStorage.getItem(k) || 'null');
      if (!e || e.t < Date.now() - TTL) localStorage.removeItem(k);
    }
  } catch { /* stockage indisponible */ }
}
function cacheSet(k, v) {
  if (!purged) purge();
  const e = { t: Date.now(), v }; mem.set(k, e);
  try { localStorage.setItem('champi-meteo:' + k, JSON.stringify(e)); } catch { /* plein ou privé */ }
}

async function fetchJson(url, tries = 2) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Météo indisponible (${r.status})`);
      return await r.json();
    } catch (err) {
      if (i >= tries) throw err;
      await new Promise((ok) => setTimeout(ok, 800 * (i + 1)));
    }
  }
}

/**
 * Données quotidiennes (14 jours passés + 3 jours de prévision) pour une liste de points [[lat, lon], …].
 * Renvoie un tableau de « daily » dans le même ordre. Un seul appel pour 100 points maximum.
 */
export async function dailyFor(points) {
  const out = new Array(points.length);
  const todo = [];
  points.forEach(([lat, lon], i) => { const c = cacheGet(key(lat, lon)); if (c) out[i] = c; else todo.push(i); });
  for (let k = 0; k < todo.length; k += 100) {
    const idx = todo.slice(k, k + 100);
    const lats = idx.map((i) => points[i][0].toFixed(3)).join(',');
    const lons = idx.map((i) => points[i][1].toFixed(3)).join(',');
    // Modèles de Météo-France (AROME, ARPEGE) servis par Open-Meteo ; en secours, le mélange habituel d'Open-Meteo.
    const q = `${OPEN_METEO}?latitude=${lats}&longitude=${lons}&daily=${DAILY}&past_days=14&forecast_days=3&timezone=Europe%2FParis`;
    let j;
    try { j = await fetchJson(`${q}&models=meteofrance_seamless`, 1); } catch { j = await fetchJson(q); }
    const arr = Array.isArray(j) ? j : [j];
    idx.forEach((i, n) => {
      const d = { ...arr[n].daily, elevation: arr[n].elevation };   // altitude du point : sert à corriger les températures des stations
      out[i] = d; cacheSet(key(...points[i]), d);
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Type de forêt à un point : service WMS « GetFeatureInfo » de l'IGN (BD Forêt V2).
const forestCache = new Map();
export async function forestAt(lat, lon) {
  const k = key(lat, lon) + lat.toFixed(4) + lon.toFixed(4);
  if (forestCache.has(k)) return forestCache.get(k);
  const d = 0.0005;
  const url = 'https://data.geopf.fr/wms-r/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo'
    + '&LAYERS=LANDCOVER.FORESTINVENTORY.V2&QUERY_LAYERS=LANDCOVER.FORESTINVENTORY.V2&STYLES=&FORMAT=image/png'
    + `&CRS=EPSG:4326&BBOX=${lat - d},${lon - d},${lat + d},${lon + d}&WIDTH=101&HEIGHT=101&I=50&J=50`
    + '&INFO_FORMAT=application/json&FEATURE_COUNT=1';
  const j = await fetchJson(url, 1);
  const p = j.features?.[0]?.properties;
  const v = p ? { tfv: p.tfv, essence: p.essence, code: p.code_tfv } : { tfv: null };
  forestCache.set(k, v);
  return v;
}

// Sol dominant à un point : carte des sols de France (INRAE, référentiels régionaux au 1/250 000), diffusée par l'IGN.
const soilCache = new Map();
export async function soilAt(lat, lon) {
  const k = lat.toFixed(4) + ',' + lon.toFixed(4);
  if (soilCache.has(k)) return soilCache.get(k);
  const d = 0.0005;
  const url = 'https://data.geopf.fr/wms-r/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo'
    + '&LAYERS=INRAE_CARTE-SOLS&QUERY_LAYERS=INRAE_CARTE-SOLS&STYLES=&FORMAT=image/png'
    + `&CRS=EPSG:4326&BBOX=${lat - d},${lon - d},${lat + d},${lon + d}&WIDTH=101&HEIGHT=101&I=50&J=50`
    + '&INFO_FORMAT=application/json&FEATURE_COUNT=1';
  // Le service répond parfois une erreur XML passagère : fetchJson réessaie.
  const j = await fetchJson(url, 2);
  const p = j.features?.[0]?.properties ?? null;
  soilCache.set(k, p);
  return p;
}

// Altitude, pente et exposition d'un point (IGN RGE ALTI : le point et 4 voisins à 40 m, en une requête).
import { slopeAspect, offsets } from './terrain.js';
const terrainCache = new Map();
export async function terrainAt(lat, lon) {
  const k = lat.toFixed(4) + ',' + lon.toFixed(4);
  if (terrainCache.has(k)) return terrainCache.get(k);
  const { dlat, dlon } = offsets(lat);
  const pts = [[lat, lon], [lat + dlat, lon], [lat - dlat, lon], [lat, lon + dlon], [lat, lon - dlon]];
  const j = await fetchJson(`https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=${pts.map((p) => p[1].toFixed(6)).join('%7C')}&lat=${pts.map((p) => p[0].toFixed(6)).join('%7C')}&resource=ign_rge_alti_wld&zonly=true`, 1);
  const [c, n, s, e, o] = j.elevations ?? [];
  if (![c, n, s, e, o].every((z) => typeof z === 'number' && z > -100)) throw new Error('altitude indisponible');
  const v = { alt: Math.round(c), ...slopeAspect({ n, s, e, o }) };
  terrainCache.set(k, v);
  return v;
}

// ---------------------------------------------------------------------------
// Historique (archive Open-Meteo) pour un coin : météo réelle avant chaque trouvaille.
// Le passé ne change plus : mémorisé sans limite (sauf les 7 derniers jours, mémorisés 1 h).
export async function historyFor(lat, lon, start, end) {
  const k = `champi-hist:${lat.toFixed(2)},${lon.toFixed(2)}:${start}:${end}`;
  const recent = Date.parse(end) > Date.now() - 7 * 86400000;
  try {
    const c = JSON.parse(localStorage.getItem(k) || 'null');
    if (c && (!recent || c.t > Date.now() - TTL)) return c.v;
  } catch { /* stockage indisponible */ }
  const j = await fetchJson(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&start_date=${start}&end_date=${end}&daily=${DAILY}&timezone=Europe%2FParis`);
  try { localStorage.setItem(k, JSON.stringify({ t: Date.now(), v: j.daily })); } catch { /* plein */ }
  return j.daily;
}
