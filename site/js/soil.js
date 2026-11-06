// Acidité du sol des forêts d'après l'Inventaire forestier de l'IGN (« niveau trophique » relevé sur le terrain
// à partir des plantes de chaque placette, de 1 = très acide à 10 = calcaire). Lecture : nos coins témoins
// (Sainte-Baume et Calanques 8–10, Maures et Estérel 3–5, Mercantour 1–2) ; l'IGN ne publie pas la légende détaillée.

export const TROPH_LAYER = 'ObsForets.Sols:repartition_niveaux_trophiques_toutes_campagnes';
/** Rayon de recherche : relevés à moins de 3 km, sinon jusqu'à 6 km. */
export const TROPH_NEAR_KM = 3, TROPH_FAR_KM = 6;

function km(lat1, lon1, lat2, lon2) {
  const dy = (lat2 - lat1) * 111.2, dx = (lon2 - lon1) * 111.2 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  return Math.hypot(dx, dy);
}
function median(xs) {
  const s = [...xs].sort((a, b) => a - b), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/** Niveau trophique → { kind: 'siliceux' | 'calcaire' | 'neutre', label } */
export function trophClass(v) {
  if (v <= 3) return { kind: 'siliceux', label: 'très acide' };
  if (v <= 5) return { kind: 'siliceux', label: 'acide' };
  if (v < 8) return { kind: 'neutre', label: 'neutre' };
  return { kind: 'calcaire', label: 'calcaire' };
}

/**
 * Résumé des relevés autour d'un point.
 * @param points [{ lat, lon, troph }]
 * @returns { n, median, nearestKm, radiusKm, kind, label } ou null s'il y a moins de 2 relevés à 6 km
 */
export function trophSummary(points, lat, lon) {
  const all = points.filter((p) => Number.isFinite(p.troph) && p.troph > 0)
    .map((p) => ({ ...p, d: km(lat, lon, p.lat, p.lon) })).sort((a, b) => a.d - b.d);
  let use = all.filter((p) => p.d <= TROPH_NEAR_KM), radiusKm = TROPH_NEAR_KM;
  if (use.length < 2) { use = all.filter((p) => p.d <= TROPH_FAR_KM); radiusKm = TROPH_FAR_KM; }
  if (use.length < 2) return null;
  const m = median(use.map((p) => p.troph));
  return { n: use.length, median: m, nearestKm: Math.round(use[0].d * 10) / 10, radiusKm, ...trophClass(m) };
}

/**
 * Sol retenu : les relevés de terrain d'abord, la carte des sols (Gis Sol / INRAE) en secours.
 * @param troph résultat de trophSummary (ou null) ; @param mapKind 'calcaire' | 'siliceux' | null
 * @returns { kind: 'calcaire' | 'siliceux' | null, source: 'ifn' | 'carte' | null }   (« neutre » → kind null)
 */
export function soilGuess(troph, mapKind) {
  if (troph) return { kind: troph.kind === 'neutre' ? null : troph.kind, source: 'ifn' };
  if (mapKind) return { kind: mapKind, source: 'carte' };
  return { kind: null, source: null };
}

/** Texte court : « acide · 7 relevés de l'Inventaire forestier à moins de 3 km » */
export function trophText(t) {
  return `${t.label} · ${t.n} relevé${t.n > 1 ? 's' : ''} de l'Inventaire forestier à moins de ${t.radiusKm} km`;
}
