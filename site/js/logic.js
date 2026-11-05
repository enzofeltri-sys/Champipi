// Logique pure du Carnet de champignons (sans DOM, testée avec node --test).

// Calendrier des espèces : mois 1 = janvier … 12 = décembre.
export const SPECIES = [
  { id: 'lactaire-sanguin', label: 'Lactaire sanguin', months: [10, 11, 12, 1], peak: [11] },
  { id: 'petit-gris', label: 'Petit-gris', months: [11, 12, 1] },
  { id: 'cepe', label: 'Cèpe', months: [6, 7, 9, 10, 11], peak: [10] },
  { id: 'girolle', label: 'Girolle', months: [6, 9, 10, 11] },
  { id: 'pied-de-mouton', label: 'Pied-de-mouton', months: [10, 11, 12, 1] },
  { id: 'trompette', label: 'Trompette-de-la-mort', months: [10, 11, 12] },
  { id: 'oronge', label: 'Oronge', months: [8, 9, 10, 11] },
  { id: 'coulemelle', label: 'Coulemelle', months: [9, 10, 11] },
  { id: 'berigoule', label: 'Bérigoule (pleurote du panicaut)', months: [3, 4, 5, 10, 11, 12] },
  { id: 'morille', label: 'Morille', months: [3, 4, 5] },
  { id: 'saint-georges', label: 'Tricholome de la Saint-Georges', months: [4, 5] },
  { id: 'chanterelle-grise', label: 'Chanterelle grise', months: [10, 11, 12] },
  { id: 'autre', label: 'Autre', months: [] },
];
const BY_ID = new Map(SPECIES.map((s) => [s.id, s]));

export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export function speciesLabel(id) {
  return BY_ID.get(id)?.label ?? String(id);
}

/** Espèces de la liste qui poussent au mois donné (1-12), avec indication du pic. */
export function inSeason(speciesIds, month) {
  const out = [];
  for (const id of speciesIds ?? []) {
    const s = BY_ID.get(id);
    if (s && s.months.includes(month)) out.push({ id, label: s.label, peak: (s.peak ?? []).includes(month) });
  }
  return out;
}

export const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août',
  'sept.', 'oct.', 'nov.', 'déc.'];

/** Mois de pousse en plages, ex. « juin–juil., sept.–nov. ». */
export function seasonText(id) {
  const s = BY_ID.get(id);
  if (!s || !s.months.length) return '';
  // Regroupe les mois consécutifs (en tenant compte du passage déc. → janv.).
  const ms = s.months;
  const runs = [];
  for (const m of ms) {
    const last = runs[runs.length - 1];
    if (last && (last[1] % 12) + 1 === m) last[1] = m;
    else runs.push([m, m]);
  }
  return runs.map(([a, b]) => (a === b ? MONTHS_SHORT[a - 1] : `${MONTHS_SHORT[a - 1]}–${MONTHS_SHORT[b - 1]}`)).join(', ');
}

// ---------------------------------------------------------------------------
// Coordonnées collées : décimal (« 43.5297, 5.4474 », « 43,5297 5,4474 »),
// degrés-minutes-secondes (« 43°31'47"N 5°26'51"E »), degrés-minutes
// (« N 43° 31.78' E 5° 26.85' ») ou lien Google Maps / OSM.

function dmsToDec(deg, min, sec, hemi) {
  let v = Math.abs(deg) + (min || 0) / 60 + (sec || 0) / 3600;
  if (deg < 0 || /[SWO]/i.test(hemi || '')) v = -v;
  return v;
}

const num = (s) => parseFloat(String(s).replace(',', '.'));

export function parseCoords(input) {
  if (!input) return null;
  let t = String(input).trim();

  // Liens : …@43.5,5.4,15z  /  ?q=43.5,5.4  /  #map=15/43.5/5.4  /  geo:43.5,5.4
  let m = t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
    || t.match(/[?&](?:q|query|ll|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i)
    || t.match(/geo:(-?\d+\.\d+),(-?\d+\.\d+)/i);
  if (m) return check(num(m[1]), num(m[2]));
  m = t.match(/map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/);
  if (m) return check(num(m[1]), num(m[2]));

  t = t.replace(/[’′]/g, "'").replace(/[″”“]/g, '"').replace(/''/g, '"').replace(/º/g, '°');

  // Degrés / minutes / secondes avec hémisphères.
  const part = String.raw`([NSEWO])?\s*(-?\d+(?:[.,]\d+)?)\s*°\s*(?:(\d+(?:[.,]\d+)?)\s*')?\s*(?:(\d+(?:[.,]\d+)?)\s*")?\s*([NSEWO])?`;
  m = t.match(new RegExp(`^${part}[\\s,;/]*${part}$`, 'i'));
  if (m) {
    let a = dmsToDec(num(m[2]), m[3] && num(m[3]), m[4] && num(m[4]), m[1] || m[5]);
    let b = dmsToDec(num(m[7]), m[8] && num(m[8]), m[9] && num(m[9]), m[6] || m[10]);
    const ha = (m[1] || m[5] || '').toUpperCase();
    if (ha === 'E' || ha === 'W' || ha === 'O') [a, b] = [b, a];
    return check(a, b);
  }

  // Décimal : deux nombres. Avec virgule décimale française : « 43,52 5,44 ».
  m = t.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/)
    || t.match(/^(-?\d+,\d+)\s*[;\s]\s*(-?\d+,\d+)$/);
  if (m) return check(num(m[1]), num(m[2]));
  return null;
}

function check(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat: round6(lat), lon: round6(lon) };
}
export const round6 = (v) => Math.round(v * 1e6) / 1e6;

export function formatCoords(lat, lon) {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

/** Lien itinéraire Google Maps (ouvre l'appli sur téléphone). */
export function directionsUrl(lat, lon) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
}

// ---------------------------------------------------------------------------
// Liste, filtres, tri.

/** Date de la dernière trouvaille de chaque coin : Map spot_id → 'AAAA-MM-JJ'. */
export function lastFinds(finds) {
  const last = new Map();
  for (const f of finds) {
    const cur = last.get(f.spot_id);
    if (!cur || f.found_on > cur) last.set(f.spot_id, f.found_on);
  }
  return last;
}

/** Tri : dernière trouvaille la plus récente d'abord ; sans trouvaille, les plus récents créés. */
export function sortSpots(spots, finds) {
  const last = lastFinds(finds);
  return [...spots].sort((a, b) => {
    const la = last.get(a.id) ?? '', lb = last.get(b.id) ?? '';
    if (la !== lb) return la < lb ? 1 : -1;
    return (a.created_at ?? '') < (b.created_at ?? '') ? 1 : -1;
  });
}

/**
 * Filtre : scope 'all' | 'mine' | 'family', species = id ou '' (toutes).
 * Une espèce correspond si elle est notée au coin ou dans une de ses trouvailles.
 */
export function filterSpots(spots, finds, { scope = 'all', species = '', me = null } = {}) {
  const fromFinds = new Map();
  for (const f of finds) {
    const set = fromFinds.get(f.spot_id) ?? new Set();
    (f.species ?? []).forEach((s) => set.add(s));
    fromFinds.set(f.spot_id, set);
  }
  return spots.filter((s) => {
    if (scope === 'mine' && s.owner !== me) return false;
    if (scope === 'family' && s.visibility !== 'family') return false;
    if (species && !(s.species ?? []).includes(species) && !fromFinds.get(s.id)?.has(species)) return false;
    return true;
  });
}

/** Toutes les espèces d'un coin (fiche + trouvailles), sans doublon, dans l'ordre du calendrier. */
export function spotSpecies(spot, finds) {
  const set = new Set(spot.species ?? []);
  for (const f of finds) if (f.spot_id === spot.id) (f.species ?? []).forEach((s) => set.add(s));
  const order = new Map(SPECIES.map((s, i) => [s.id, i]));
  return [...set].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
}

export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function todayIso(now = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${z(now.getMonth() + 1)}-${z(now.getDate())}`;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------------------
// Massifs (cercles indicatifs, rayon en mètres) et zone interdite.
export const MASSIFS = [
  { name: 'Sainte-Victoire', lat: 43.533, lon: 5.585, r: 9000 },
  { name: 'Étoile-Garlaban', lat: 43.355, lon: 5.52, r: 9000 },
  { name: 'Sainte-Baume', lat: 43.33, lon: 5.75, r: 10000 },
  { name: 'Maures', lat: 43.25, lon: 6.33, r: 24000 },
  { name: 'Haut-Var', lat: 43.66, lon: 6.32, r: 22000 },
  { name: 'Luberon', lat: 43.81, lon: 5.4, r: 22000 },
  { name: 'Montagne de Lure', lat: 44.12, lon: 5.8, r: 14000 },
  { name: 'Mont Ventoux', lat: 44.174, lon: 5.279, r: 13000 },
];
export const FORBIDDEN = [
  { name: 'Forêt relique de la Sainte-Baume — cueillette interdite', lat: 43.315, lon: 5.76, r: 1200 },
];

// ---------------------------------------------------------------------------
// Détails.
export const TREES = [
  { id: 'pin-alep', label: "Pin d'Alep" }, { id: 'pin-sylvestre', label: 'Pin sylvestre' },
  { id: 'pin-maritime', label: 'Pin maritime' }, { id: 'chene-vert', label: 'Chêne vert' },
  { id: 'chene-blanc', label: 'Chêne blanc' }, { id: 'chene-liege', label: 'Chêne-liège' },
  { id: 'hetre', label: 'Hêtre' }, { id: 'chataignier', label: 'Châtaignier' },
  { id: 'cedre', label: 'Cèdre' }, { id: 'meleze', label: 'Mélèze' },
  { id: 'prairie', label: 'Prairie / pelouse' },
];
export const SOILS = [{ id: 'calcaire', label: 'Calcaire' }, { id: 'siliceux', label: 'Siliceux' }, { id: 'mixte', label: 'Mixte' }];
export const EXPOSURES = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
export const QUANTITIES = [{ id: 'quelques', label: 'Quelques-uns' }, { id: 'panier', label: 'Un panier' }, { id: 'abondant', label: 'Abondant' }];
export const CONDITIONS = [{ id: 'jeunes', label: 'Jeunes' }, { id: 'a-point', label: 'À point' }, { id: 'vieux', label: 'Vieux / véreux' }];
export const labelOf = (list, id) => list.find((x) => x.id === id)?.label ?? id;

// ---------------------------------------------------------------------------
// Position GPS dans les métadonnées EXIF d'un JPEG (ArrayBuffer) → { lat, lon } ou null.
export function exifGps(buffer) {
  try {
    const v = new DataView(buffer);
    if (v.getUint16(0) !== 0xffd8) return null;
    let off = 2;
    while (off + 4 < v.byteLength) {
      const marker = v.getUint16(off);
      const size = v.getUint16(off + 2);
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return readTiffGps(v, off + 10);
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null;
      off += 2 + size;
    }
  } catch { /* fichier tronqué ou bizarre */ }
  return null;
}

function readTiffGps(v, t) {
  const le = v.getUint16(t) === 0x4949;
  const u16 = (o) => v.getUint16(t + o, le);
  const u32 = (o) => v.getUint32(t + o, le);
  const ifd = (o) => {
    const n = u16(o); const out = {};
    for (let i = 0; i < n; i++) {
      const e = o + 2 + i * 12;
      out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), at: e + 8 };
    }
    return out;
  };
  const ifd0 = ifd(u32(4));
  if (!ifd0[0x8825]) return null;
  const gps = ifd(u32(ifd0[0x8825].at));
  const ref = (tag) => (gps[tag] ? String.fromCharCode(v.getUint8(t + gps[tag].at)) : '');
  const rat3 = (tag) => {
    const g = gps[tag]; if (!g || g.type !== 5 || g.count < 3) return null;
    const p = u32(g.at); const r = (i) => u32(p + i * 8) / (u32(p + i * 8 + 4) || 1);
    return r(0) + r(1) / 60 + r(2) / 3600;
  };
  let lat = rat3(2), lon = rat3(4);
  if (lat == null || lon == null || (lat === 0 && lon === 0)) return null;
  if (ref(1) === 'S') lat = -lat;
  if (ref(3) === 'W') lon = -lon;
  return check(lat, lon);
}

/** Dimensions réduites en gardant les proportions (côté le plus long ≤ max). */
export function fitSize(w, h, max) {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}
