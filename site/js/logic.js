// Logique pure du Carnet de champignons (sans DOM, testée avec node --test).

// Calendrier des espèces : mois 1 = janvier … 12 = décembre.
// Calendrier : saisons et pics réglés le 5 novembre 2026 sur les observations iNaturalist en PACA
// (site/data/phenology-paca.json) quand il y en avait assez (plus de 20) ; sinon, connaissances générales.
export const SPECIES = [
  { id: 'lactaire-sanguin', label: 'Lactaire sanguin', months: [9, 10, 11, 12, 1], peak: [10, 11] },
  { id: 'petit-gris', label: 'Petit-gris', months: [10, 11, 12, 1], peak: [10, 11] },
  { id: 'cepe', label: 'Cèpe', months: [6, 7, 8, 9, 10, 11], peak: [10], late: [12] },
  { id: 'girolle', label: 'Girolle', months: [6, 8, 9, 10, 11, 12], peak: [10, 11] },
  { id: 'pied-de-mouton', label: 'Pied-de-mouton', months: [10, 11, 12, 1], peak: [11], late: [2] },
  { id: 'trompette', label: 'Trompette-de-la-mort', months: [10, 11, 12], late: [1] },
  { id: 'oronge', label: 'Oronge', months: [8, 9, 10, 11], peak: [9, 10] },
  { id: 'coulemelle', label: 'Coulemelle', months: [8, 9, 10, 11, 12], peak: [10] },
  { id: 'berigoule', label: 'Bérigoule (pleurote du panicaut)', months: [3, 4, 5, 10, 11, 12] },
  { id: 'morille', label: 'Morille', months: [3, 4, 5], peak: [4, 5] },
  { id: 'saint-georges', label: 'Tricholome de la Saint-Georges', months: [4, 5, 6], peak: [5] },
  { id: 'chanterelle-grise', label: 'Chanterelle grise', months: [10, 11, 12], late: [1] },
  { id: 'autre', label: 'Autre', months: [] },
];
const BY_ID = new Map(SPECIES.map((s) => [s.id, s]));

// « late » : mois hors calendrier habituel où l'espèce sort encore en Provence les années douces
// (basse altitude, sans gel). Le conseiller ne les compte que si la météo le permet (voir assess).
export const LATE_MAX_ALT = 600;
/** 'peak' | 'season' | 'late' | 'off' */
export function seasonOf(id, month) {
  const s = BY_ID.get(id);
  if (!s) return 'off';
  if ((s.peak ?? []).includes(month)) return 'peak';
  if (s.months.includes(month)) return 'season';
  if ((s.late ?? []).includes(month)) return 'late';
  return 'off';
}
export const lateText = (id) => {
  const l = BY_ID.get(id)?.late ?? [];
  return l.length ? `${l.map((m) => MONTHS_SHORT[m - 1]).join(', ')} si doux et sans gel` : '';
};

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
    if (scope === 'family' && s.visibility !== 'family' && !s.sharedWithMe) return false;   // + coins partagés avec moi
    const want = Array.isArray(species) ? species : species ? [species] : [];   // un ou plusieurs champignons : l'un d'eux
    if (want.length && !want.some((sp) => (s.species ?? []).includes(sp) || fromFinds.get(s.id)?.has(sp))) return false;
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
export const SOILS = [{ id: 'calcaire', label: 'Calcaire' }, { id: 'siliceux', label: 'Siliceux (acide)' }, { id: 'mixte', label: 'Mixte' }];
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

// ---------------------------------------------------------------------------
// Date de prise de vue (EXIF DateTimeOriginal) d'un JPEG → 'AAAA-MM-JJ' ou null.
export function exifDate(buffer) {
  try {
    const v = new DataView(buffer);
    if (v.getUint16(0) !== 0xffd8) return null;
    let off = 2;
    while (off + 4 < v.byteLength) {
      const marker = v.getUint16(off), size = v.getUint16(off + 2);
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) {
        const t = off + 10, le = v.getUint16(t) === 0x4949;
        const u16 = (o) => v.getUint16(t + o, le), u32 = (o) => v.getUint32(t + o, le);
        const find = (ifdOff, tag) => {
          const n = u16(ifdOff);
          for (let i = 0; i < n; i++) { const e = ifdOff + 2 + i * 12; if (u16(e) === tag) return { count: u32(e + 4), at: e + 8 }; }
          return null;
        };
        const ascii = (entry) => {
          const p = entry.count > 4 ? u32(entry.at) : entry.at;
          let s = ''; for (let i = 0; i < entry.count - 1; i++) s += String.fromCharCode(v.getUint8(t + p + i));
          return s;
        };
        const ifd0 = u32(4);
        const exifPtr = find(ifd0, 0x8769);
        const dt = (exifPtr && (find(u32(exifPtr.at), 0x9003) || find(u32(exifPtr.at), 0x9004))) || find(ifd0, 0x0132);
        if (!dt) return null;
        const m = ascii(dt).match(/^(\d{4}):(\d{2}):(\d{2})/);
        return m && m[1] !== '0000' ? `${m[1]}-${m[2]}-${m[3]}` : null;
      }
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null;
      off += 2 + size;
    }
  } catch { /* fichier inattendu */ }
  return null;
}

// ---------------------------------------------------------------------------
// Recherche (nom, notes, accès, espèces, auteur), sans accents ni majuscules.
export const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function searchSpots(spots, finds, q) {
  const terms = fold(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return spots;
  return spots.filter((s) => {
    const hay = fold([s.name, s.note, s.access, s.author?.display_name, s.forest_type,
      ...(s.species ?? []).map(speciesLabel),
      ...finds.filter((f) => f.spot_id === s.id).flatMap((f) => [f.note, f.weather, ...(f.species ?? []).map(speciesLabel)])].join(' '));
    return terms.every((t) => hay.includes(t));
  });
}

// ---------------------------------------------------------------------------
// Exports.
const xml = (s) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
export function toGpx(spots) {
  const wpts = spots.map((s) => `  <wpt lat="${s.lat}" lon="${s.lon}">
    <name>${xml(s.name)}</name>
    <desc>${xml([(s.species ?? []).map(speciesLabel).join(', '), s.note].filter(Boolean).join(' — '))}</desc>
    <sym>Flag, Green</sym>
  </wpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Carnet de champignons" xmlns="http://www.topografix.com/GPX/1/1">
${wpts}
</gpx>
`;
}
const csvCell = (v) => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCsv(rows, columns) {
  // Point-virgule + BOM : s'ouvre directement dans Excel en français.
  return '﻿' + [columns.map((c) => csvCell(c[0])).join(';'), ...rows.map((r) => columns.map((c) => csvCell(c[1](r))).join(';'))].join('\r\n') + '\r\n';
}

// Ordre des pastilles : les grands classiques d'abord, puis les autres (ceux en saison en premier).
export const FAVORITES = ['cepe', 'girolle', 'trompette', 'pied-de-mouton', 'chanterelle-grise'];
export function chipOrder(month) {
  const rest = SPECIES.filter((s) => s.id !== 'autre' && !FAVORITES.includes(s.id))
    .sort((a, b) => Number(b.months.includes(month)) - Number(a.months.includes(month)));
  return [...FAVORITES.map((id) => SPECIES.find((s) => s.id === id)), ...rest];
}
