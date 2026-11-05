// Forêts favorables à un champignon, à partir des tuiles BD Forêt® V2 de l'IGN.
// Chaque type de forêt est dessiné d'une couleur fixe : ce tableau a été relevé sur des tuiles de toute la
// région PACA et chaque couleur vérifiée auprès de l'IGN (GetFeatureInfo, 3 points sur 3 concordants).
// Poids : 2 = peuplement pur de l'essence, 1 = mélange ou forêt ouverte (possible, moins sûr).
import { GUIDE } from './advisor.js';

const FEUILLUS = ['chene-blanc', 'chene-vert', 'chataignier', 'hetre'];
const PINS = ['pin-alep', 'pin-sylvestre', 'pin-maritime', 'pin-autre'];
const w = (ids, k) => ids.map((id) => [id, k]);

export const FOREST_CLASSES = [
  { hex: '#ff1acd', label: "Pin d'Alep", trees: w(['pin-alep'], 2) },
  { hex: '#9926ff', label: 'Pin sylvestre', trees: w(['pin-sylvestre'], 2) },
  { hex: '#bf26ff', label: 'Pin maritime', trees: w(['pin-maritime'], 2) },
  { hex: '#390bd7', label: 'Pin noir / laricio', trees: w(['pin-autre'], 2) },
  { hex: '#8761fa', label: 'Pin à crochets / cembro', trees: w(['pin-autre'], 2) },
  { hex: '#d898ff', label: 'Autre pin', trees: w(['pin-autre'], 2) },
  { hex: '#ff99ff', label: 'Mélange de pins', trees: [...w(['pin-autre'], 2), ...w(['pin-alep', 'pin-sylvestre', 'pin-maritime'], 1)] },
  { hex: '#668040', label: 'Chênes verts', trees: w(['chene-vert', 'chene-liege'], 2) },
  { hex: '#004d2e', label: 'Chênes blancs', trees: w(['chene-blanc'], 2) },
  { hex: '#40ff26', label: 'Châtaigniers', trees: w(['chataignier'], 2) },
  { hex: '#00b9a8', label: 'Hêtres', trees: w(['hetre'], 2) },
  { hex: '#6180ff', label: 'Mélèzes', trees: w(['meleze'], 2) },
  { hex: '#00931b', label: 'Mélange de feuillus', trees: w(FEUILLUS, 1) },
  { hex: '#017838', label: 'Feuillus en îlots', trees: w(FEUILLUS, 1) },
  { hex: '#ccffbf', label: 'Feuillus clairsemés', trees: w(FEUILLUS, 1) },
  { hex: '#99b3cc', label: 'Conifères clairsemés', trees: w(PINS, 1) },
  { hex: '#8080ff', label: 'Conifères en îlots', trees: w(PINS, 1) },
  { hex: '#0000ff', label: 'Mélange de conifères', trees: w([...PINS, 'meleze'], 1) },
  { hex: '#01929f', label: "Mélange d'autres conifères", trees: w(['meleze'], 1) },
  { hex: '#ff9833', label: 'Feuillus et conifères', trees: w([...FEUILLUS, ...PINS], 1) },
  { hex: '#ff4033', label: 'Conifères et feuillus', trees: w([...PINS, ...FEUILLUS], 1) },
  { hex: '#ffd138', label: 'Forêt ouverte mixte', trees: w([...FEUILLUS, ...PINS], 1) },
  { hex: '#ffffb9', label: 'Prairies, pelouses', trees: w(['prairie'], 2) },
  { hex: '#ffe6bf', label: 'Landes', trees: w(['prairie'], 1) },
  // Sans intérêt pour les espèces du carnet (ou sans arbres) : jamais colorés.
  { hex: '#1ae6e6', label: 'Sapins, épicéas', trees: [] },
  { hex: '#a9ffff', label: 'Autre conifère', trees: [] },
  { hex: '#afca59', label: 'Autre feuillu', trees: [] },
  { hex: '#e5c45d', label: 'Coupes, forêt sans arbres', trees: [] },
  { hex: '#b29e93', label: 'Forêt ouverte sans arbres', trees: [] },
];

/** Arbres d'une espèce (guide). Les champignons des pinèdes (uniquement des pins) acceptent tous les pins. */
export function speciesTrees(speciesId) {
  const t = [...(GUIDE[speciesId]?.trees ?? [])];
  if (t.length && t.every((x) => x.startsWith('pin-'))) t.push('pin-autre');
  return t;
}

/** Couleurs à garder pour une espèce : Map « #rrggbb » → 2 (favorable) ou 1 (possible). */
export function favorableColors(speciesId) {
  const want = new Set(speciesTrees(speciesId));
  const out = new Map();
  for (const c of FOREST_CLASSES) {
    let best = 0;
    for (const [t, k] of c.trees) if (want.has(t)) best = Math.max(best, k);
    if (best) out.set(c.hex, best);
  }
  return out;
}

/** Libellés des forêts favorables (pures d'abord), pour le bandeau. */
export function favorableLabels(speciesId) {
  const m = favorableColors(speciesId);
  return FOREST_CLASSES.filter((c) => m.get(c.hex) === 2).map((c) => c.label);
}

/** Table de recoloriage rapide : clé entière RVB → niveau. */
export function colorKeyMap(levels) {
  const out = new Map();
  for (const [hex, k] of levels) out.set(parseInt(hex.slice(1), 16), k);
  return out;
}
