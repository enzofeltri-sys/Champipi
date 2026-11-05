// Accès aux massifs forestiers en période de risque incendie (données des préfectures,
// risque-prevention-incendie.fr). La signification des niveaux diffère selon le département.

export const DEPT_PAGES = {
  4: { name: 'Alpes-de-Haute-Provence', url: 'https://www.risque-prevention-incendie.fr/alpes-de-haute-provence' },
  6: { name: 'Alpes-Maritimes', url: 'https://www.risque-prevention-incendie.fr/alpes-maritimes' },
  13: { name: 'Bouches-du-Rhône', url: 'https://www.risque-prevention-incendie.fr/bouches-du-rhone' },
  83: { name: 'Var', url: 'https://www.risque-prevention-incendie.fr/var' },
  84: { name: 'Vaucluse', url: 'https://www.risque-prevention-incendie.fr/vaucluse' },
};

const OK = 'ok', WARN = 'warn', CLOSED = 'closed';

/** Niveau publié → { state: 'ok' | 'warn' | 'closed', text } (null si pas d'information). */
export function accessStatus(dept, level, procedure = 0) {
  const d = Number(dept), l = Number(level), p = Number(procedure);
  if (d === 4) return p === 1 && l >= 5 ? { state: CLOSED, text: 'Zone fermée' } : (l ? { state: OK, text: 'Pas de fermeture signalée' } : null);
  if (!l) return null;
  if (d === 13) return l <= 2 ? { state: OK, text: 'Accès autorisé' } : { state: CLOSED, text: 'Accès interdit' };
  if (d === 83) return [null, { state: OK, text: 'Accès autorisé' }, { state: OK, text: 'Accès autorisé' },
    { state: WARN, text: 'Accès déconseillé' }, { state: CLOSED, text: 'Accès interdit hors ZAPEF (zones d\'accueil)' },
    { state: CLOSED, text: 'Accès interdit' }][l] ?? null;
  if (d === 84) return [null, { state: OK, text: 'Accès possible' }, { state: WARN, text: 'Accès possible, plutôt le matin' },
    { state: CLOSED, text: 'Accès interdit toute la journée (sauf dérogation)' }, { state: CLOSED, text: 'Accès interdit' }][l] ?? null;
  if (d === 6) {
    if (l === 1) return { state: OK, text: 'Accès autorisé' };
    if (l === 2) return { state: WARN, text: 'Accès déconseillé' };
    if (l === 3) return p === 2 ? { state: CLOSED, text: 'Accès interdit' } : { state: WARN, text: 'Accès déconseillé' };
    if (l === 4) return { state: CLOSED, text: 'Accès interdit' };
  }
  return null;
}

export const ACCESS_ICON = { ok: '🟢', warn: '🟠', closed: '⛔' };

// Point dans un MultiPolygon GeoJSON (coordonnées [lon, lat], trous gérés).
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function inMultiPolygon(lat, lon, polys) {
  return polys.some(([outer, ...holes]) => inRing(lon, lat, outer) && !holes.some((h) => inRing(lon, lat, h)));
}

// « SAINTE BAUME » → « Sainte Baume », « ILES D'HYERES » → « Iles d'Hyeres » (les noms en minuscules restent tels quels).
export function prettyName(n) {
  const t = String(n ?? '');
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/\b(De|Du|Des|La|Le|Les|D'|L')(?=[\s'])/g, (w) => w.toLowerCase());
}

/** Massif officiel contenant le point : { dept, id, name } ou null. data = { "13": [{ id, name, g }] } */
export function massifAt(lat, lon, data) {
  for (const [dept, list] of Object.entries(data ?? {})) {
    for (const m of list) if (inMultiPolygon(lat, lon, m.g)) return { dept, id: m.id, name: prettyName(m.name) };
  }
  return null;
}

/** Période réglementée habituelle (1er juin – 30 septembre). */
export const inFireSeason = (month) => month >= 6 && month <= 9;

/** Texte à afficher pour un coin. levels = réponse du relais ({ depts }) ou null. */
export function accessFor(massif, levels, month) {
  if (!massif) return { state: null, text: 'Hors des massifs suivis par les préfectures.' };
  const page = DEPT_PAGES[massif.dept];
  const raw = levels?.depts?.[massif.dept];
  if (!raw) {
    return { state: null, text: inFireSeason(month)
      ? `Carte du jour non publiée pour l'instant (${page?.name ?? massif.dept}).`
      : 'Hors période réglementée (juin–septembre) : pas de restriction publiée aujourd\'hui.' };
  }
  const v = raw[massif.id];
  const st = v ? accessStatus(massif.dept, v[0], v[1]) : null;
  return st ?? { state: null, text: 'Pas d\'information pour ce massif aujourd\'hui.' };
}
