// Carte « bon moment » : les forêts favorables au champignon choisi sont coloriées selon l'avis du conseiller
// (pluie, températures, saison) calculé sur une grille de points : vert = bon moment, jaune = moyen,
// rouge = pas le moment, gris = hors saison (ou météo pas encore chargée).
import { seasonOf } from './logic.js';
import { favorableColors } from './forests.js';
import { GUIDE } from './advisor.js';
import { trophClass } from './soil.js';

/** Clé couleur RVB → { w: 2 (forêt pure) | 1 (mélange), mask: bits des espèces choisies concernées }. */
export function habitatTable(ids) {
  const out = new Map();
  ids.forEach((id, i) => {
    for (const [hex, k] of favorableColors(id)) {
      const key = parseInt(hex.slice(1), 16);
      const cur = out.get(key) ?? { w: 0, mask: 0 };
      out.set(key, { w: Math.max(cur.w, k), mask: cur.mask | (1 << i) });
    }
  });
  return out;
}

/** Pas de la grille (degrés) : le plus fin qui tient en 100 points (un seul appel météo). */
export function gridStep(b, max = 100) {
  for (const s of [0.1, 0.2, 0.3, 0.5]) {
    const n = (Math.floor(b.north / s) - Math.floor(b.south / s) + 1) * (Math.floor(b.east / s) - Math.floor(b.west / s) + 1);
    if (n <= max) return s;
  }
  return 1;
}
export const cellKey = (lat, lon, s) => `${Math.floor(lat / s)}:${Math.floor(lon / s)}`;
/** Centres des cases couvrant la zone. */
export function cellsFor(b, s) {
  const out = [];
  for (let i = Math.floor(b.south / s); i <= Math.floor(b.north / s); i++)
    for (let j = Math.floor(b.west / s); j <= Math.floor(b.east / s); j++)
      out.push({ key: `${i}:${j}`, lat: +((i + 0.5) * s).toFixed(3), lon: +((j + 0.5) * s).toFixed(3) });
  return out;
}

export const CODE = { bon: 3, moyen: 2, faible: 1 };   // 0 = hors saison, -1 = inconnu
export const COLORS = {
  3: [22, 163, 74], 2: [234, 179, 8], 1: [220, 38, 38], 0: [100, 116, 139], [-1]: [148, 163, 184],
};
export const ALPHA = { 2: 205, 1: 120 };

export const BAD_SOIL = -3;   // le sol de la case ne convient pas à l'espèce : forêt non coloriée

/** Sol d'une case (grille de 0,1° tirée des relevés de l'Inventaire forestier) : 'calcaire' | 'siliceux' | null. */
export function soilOfCell(grid, lat, lon) {
  const v = grid?.cells?.[`${Math.floor(lat * 10)}:${Math.floor(lon * 10)}`];
  if (v == null) return null;
  const k = trophClass(v).kind;
  return k === 'neutre' ? null : k;
}

/** Avis pour une case : un code par espèce choisie (0 si hors saison, BAD_SOIL si le sol ne lui convient pas). */
export function cellCodes(ids, month, w, assess, soil = null) {
  return ids.map((id) => {
    if (soil && GUIDE[id]?.soil && GUIDE[id].soil !== soil) return BAD_SOIL;   // girolle sur calcaire, lactaire sur sol acide…
    if (seasonOf(id, month) === 'off') return 0;
    if (!w) return -1;
    const lv = assess(w, { month, species: [id], soil }).level;
    return lv === 'hors-saison' ? 0 : CODE[lv] ?? -1;
  });
}

/** Meilleur avis parmi les espèces concernées par ce pixel (mask), selon les codes de la case ; BAD_SOIL si aucune ne convient. */
export function pixelCode(mask, codes) {
  let best = -2, bad = false;
  for (let i = 0; i < codes.length; i++) if (mask & (1 << i)) {
    if (codes[i] === BAD_SOIL) { bad = true; continue; }
    best = Math.max(best, codes[i]);
  }
  return best === -2 ? (bad ? BAD_SOIL : -1) : best;
}

/** Coordonnées d'un pixel de tuile (Web Mercator). */
export const pxLon = (gx, z) => (gx / (256 * 2 ** z)) * 360 - 180;
export const pxLat = (gy, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * gy) / (256 * 2 ** z)))) * 180) / Math.PI;
