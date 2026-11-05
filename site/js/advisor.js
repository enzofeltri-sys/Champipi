// Le « conseiller » : règles simples et transparentes (pas d'IA) qui croisent la météo,
// la saison, le milieu et l'historique des trouvailles. Indicatif uniquement.
import { SPECIES, MONTHS, LATE_MAX_ALT } from './logic.js';

// Fiches des espèces : milieux, sol, altitude indicative, sosies dangereux.
// Source : connaissances mycologiques générales (à confirmer auprès d'une société mycologique).
export const GUIDE = {
  'lactaire-sanguin': { latin: 'Lactarius sanguifluus', trees: ['pin-alep', 'pin-sylvestre', 'pin-maritime'], soil: 'calcaire', alt: [0, 1200],
    habitat: 'Sous les pins (surtout pin d\'Alep), sols calcaires, pinèdes claires.',
    lookalikes: 'Autres lactaires (lait blanc ou âcre). Le lactaire sanguin a un lait rouge vineux.' },
  'petit-gris': { latin: 'Tricholoma terreum', trees: ['pin-alep', 'pin-sylvestre', 'pin-maritime'], soil: null, alt: [0, 1500],
    habitat: 'Sous les pins, souvent en troupes, sur aiguilles.',
    lookalikes: '⚠️ Tricholome tigré (Tricholoma pardinum), toxique : chapeau plus grand, écailles marquées.' },
  cepe: { latin: 'Boletus edulis, aereus, aestivalis…', trees: ['chene-blanc', 'chene-vert', 'chataignier', 'hetre', 'pin-sylvestre', 'pin-maritime'], soil: null, alt: [200, 1600],
    habitat: 'Chênaies, châtaigneraies, hêtraies et pinèdes ; lisières et sous-bois clairs.',
    lookalikes: '⚠️ Bolet de Satan (pores rouges, pied réticulé rouge), toxique. Bolet amer : immangeable.' },
  girolle: { latin: 'Cantharellus cibarius', trees: ['chene-vert', 'chene-liege', 'chene-blanc', 'chataignier', 'hetre', 'pin-maritime'], soil: 'siliceux', alt: [0, 1500],
    habitat: 'Chênes, châtaigniers, hêtres, sur sols plutôt acides (Maures, Estérel).',
    lookalikes: '⚠️ Clitocybe de l\'olivier (Omphalotus olearius), toxique et très courant en Provence : vraies lamelles, pousse en touffes sur souches. Fausse girolle (Hygrophoropsis).' },
  'pied-de-mouton': { latin: 'Hydnum repandum', trees: ['chene-blanc', 'chene-vert', 'hetre', 'chataignier', 'pin-sylvestre'], soil: null, alt: [0, 1600],
    habitat: 'Feuillus et conifères, souvent en cercles ou en lignes.',
    lookalikes: 'Peu de confusion dangereuse : aiguillons sous le chapeau (pas de lamelles).' },
  trompette: { latin: 'Craterellus cornucopioides', trees: ['chene-blanc', 'hetre', 'chataignier'], soil: null, alt: [200, 1500],
    habitat: 'Feuillus (hêtres, chênes, châtaigniers), sols frais, mousses et feuilles mortes.',
    lookalikes: 'Peu de confusion dangereuse, mais difficile à voir.' },
  oronge: { latin: 'Amanita caesarea', trees: ['chene-blanc', 'chene-vert', 'chene-liege', 'chataignier'], soil: 'siliceux', alt: [0, 1000],
    habitat: 'Chênaies et châtaigneraies chaudes, sols siliceux (Var, Maures).',
    lookalikes: '⚠️⚠️ Au stade « œuf », confusion possible avec l\'amanite phalloïde, MORTELLE. Amanite tue-mouches (toxique).' },
  coulemelle: { latin: 'Macrolepiota procera', trees: ['prairie'], soil: null, alt: [0, 1800],
    habitat: 'Lisières, clairières, prairies et bords de chemins.',
    lookalikes: '⚠️⚠️ Petites lépiotes, MORTELLES : ne ramasser que les grands exemplaires (chapeau > 10 cm, anneau coulissant).' },
  berigoule: { latin: 'Pleurotus eryngii', trees: ['prairie'], soil: 'calcaire', alt: [0, 1000],
    habitat: 'Friches et pelouses sèches calcaires, sur les racines du panicaut champêtre.',
    lookalikes: 'Peu de confusion dangereuse dans ce milieu ; vérifier la présence du panicaut.' },
  morille: { latin: 'Morchella spp.', trees: [], soil: null, alt: [0, 1800],
    habitat: 'Frênes, ormes, bords de rivières (ripisylves), zones brûlées, vergers.',
    lookalikes: '⚠️⚠️ Gyromitre (cerveau plissé, pas d\'alvéoles creuses), MORTEL. Toujours bien cuire les morilles.' },
  'saint-georges': { latin: 'Calocybe gambosa', trees: ['prairie'], soil: null, alt: [0, 1800],
    habitat: 'Prairies, haies, lisières ; pousse en ronds au printemps.',
    lookalikes: '⚠️⚠️ Entolome livide et inocybe de Patouillard, MORTELS. Odeur de farine fraîche caractéristique.' },
  'chanterelle-grise': { latin: 'Craterellus tubaeformis', trees: ['pin-sylvestre', 'hetre', 'chataignier'], soil: 'siliceux', alt: [300, 1800],
    habitat: 'Sols acides et moussus, sous conifères et feuillus, souvent tard en saison.',
    lookalikes: 'Peu de confusion dangereuse ; plis (pas de vraies lamelles), pied creux.' },
};

// ---------------------------------------------------------------------------
// Météo : résumé des derniers jours à partir d'une réponse Open-Meteo « daily ».

const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/**
 * @param daily { time[], precipitation_sum[], temperature_2m_max[], temperature_2m_min[] }
 * @param today 'AAAA-MM-JJ'
 */
export function summarizeWeather(daily, today) {
  const rows = daily.time.map((t, i) => ({
    date: t,
    rain: daily.precipitation_sum?.[i] ?? 0,
    tmax: daily.temperature_2m_max?.[i] ?? null,
    tmin: daily.temperature_2m_min?.[i] ?? null,
  }));
  const past = rows.filter((r) => r.date < today);
  const last10 = past.slice(-10);
  const last7 = past.slice(-7);
  const future = rows.filter((r) => r.date > today);
  const sum = (a) => Math.round(a.reduce((s, r) => s + (r.rain || 0), 0) * 10) / 10;
  const avg = (a, k) => { const v = a.map((r) => r[k]).filter((x) => x != null); return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null; };

  // Dernière « grosse pluie » : un jour ≥ 15 mm, ou deux jours consécutifs ≥ 20 mm (sur les 14 derniers jours).
  let bigRainAgo = null, bigRainMm = 0;
  const p14 = past.slice(-14);
  for (let i = p14.length - 1; i >= 0; i--) {
    const two = p14[i].rain + (p14[i + 1]?.rain ?? 0);
    if (p14[i].rain >= 15 || two >= 20) { bigRainAgo = dayDiff(p14[i].date, today); bigRainMm = Math.round(Math.max(p14[i].rain, two)); break; }
  }
  let lastRainAgo = null;
  for (let i = past.length - 1; i >= 0; i--) if (past[i].rain >= 2) { lastRainAgo = dayDiff(past[i].date, today); break; }

  return {
    days: last10,
    today: rows.find((r) => r.date === today) ?? null,
    future,
    rain10: sum(last10),
    rain3: sum(past.slice(-3)),
    rain14: sum(past.slice(-14)),
    rainNext: sum(future),
    bigRainAgo, bigRainMm, lastRainAgo,
    tmin7: avg(last7, 'tmin'),
    tmax7: avg(last7, 'tmax'),
    frost7: last7.filter((r) => r.tmin != null && r.tmin < 0).length,
  };
}

// ---------------------------------------------------------------------------
// Évaluation des conditions pour un coin.

export const LEVELS = {
  bon: { label: 'Conditions favorables', icon: '🟢' },
  moyen: { label: 'Conditions moyennes', icon: '🟡' },
  faible: { label: 'Conditions défavorables', icon: '🔴' },
  'hors-saison': { label: 'Hors saison', icon: '⚪' },
};

export function nextSeason(id, month) {
  const s = SPECIES.find((x) => x.id === id);
  if (!s?.months.length) return null;
  for (let k = 1; k <= 12; k++) { const m = ((month - 1 + k) % 12) + 1; if (s.months.includes(m)) return m; }
  return null;
}

/**
 * @param w résumé météo (summarizeWeather) ou null
 * @param ctx { month, species: ids, trees: ids, history: [{ found_on, species[] }] }
 */
export function assess(w, { month, species = [], trees = [], history = [], personal = null, alt = null }) {
  const known = species.filter((id) => SPECIES.some((s) => s.id === id && s.months.length));
  // Fin de saison (ex. cèpe en décembre en Provence) : seulement par temps doux, sans gel, à basse altitude.
  const mild = !!w && w.frost7 === 0 && w.tmin7 != null && w.tmin7 >= 4 && (alt == null || alt < LATE_MAX_ALT);
  const isLate = (id) => (SPECIES.find((s) => s.id === id).late ?? []).includes(month);
  const inSeason = known.filter((id) => SPECIES.find((s) => s.id === id).months.includes(month) || (mild && isLate(id)));
  if (!known.length) return { level: null, score: 0, reasons: ['Aucune espèce du calendrier notée à ce coin.'], perSpecies: [] };
  if (!inSeason.length) {
    const next = known.map((id) => [id, nextSeason(id, month)]).filter(([, m]) => m)
      .sort((a, b) => ((a[1] - month + 12) % 12) - ((b[1] - month + 12) % 12))[0];
    return { level: 'hors-saison', score: 0, reasons: next ? [`Prochaine saison : ${SPECIES.find((s) => s.id === next[0]).label} en ${MONTHS[next[1] - 1]}.`] : [], perSpecies: [] };
  }

  const common = [];
  let base = 0;
  if (w) {
    if (w.rain10 >= 40) { base += 3; common.push(`Bien arrosé : ${w.rain10} mm sur 10 jours`); }
    else if (w.rain10 >= 20) { base += 2; common.push(`Assez arrosé : ${w.rain10} mm sur 10 jours`); }
    else if (w.rain10 >= 10) { base += 1; common.push(`Un peu de pluie : ${w.rain10} mm sur 10 jours`); }
    else common.push(`Sec : ${w.rain10} mm sur 10 jours`);

    if (w.bigRainAgo != null && w.bigRainAgo >= 5 && w.bigRainAgo <= 15) { base += 2; common.push(`Grosse pluie (${w.bigRainMm} mm) il y a ${w.bigRainAgo} j : bonne fenêtre de pousse`); }
    else if (w.bigRainAgo != null && w.bigRainAgo < 5) common.push(`Grosse pluie (${w.bigRainMm} mm) il y a ${w.bigRainAgo} j : les pousses arrivent en général 5 à 10 jours après`);

    if (w.frost7 >= 3 || (w.tmin7 != null && w.tmin7 < 1)) { base -= 2; common.push(`Froid : ${w.frost7} nuit(s) de gel cette semaine`); }
    else if (w.tmax7 != null && w.tmax7 > 26) { base -= 1; common.push(`Chaud : ${w.tmax7} °C de max en moyenne`); }
    else if (w.tmin7 != null) { base += 1; common.push(`Températures douces (${w.tmin7}–${w.tmax7} °C)`); }
  }

  const perSpecies = inSeason.map((id) => {
    const sp = SPECIES.find((s) => s.id === id);
    const g = GUIDE[id];
    let score = base; const reasons = [];
    if ((sp.peak ?? []).includes(month)) { score += 1; reasons.push('mois de pic'); }
    if (!sp.months.includes(month)) { score -= 1; reasons.push('fin de saison : possible car doux et sans gel'); }
    if (g?.trees.length && trees.length) {
      if (trees.some((t) => g.trees.includes(t))) { score += 1; reasons.push('milieu typique'); }
      else { score -= 1; reasons.push('milieu peu typique'); }
    }
    const before = history.filter((f) => (f.species ?? []).includes(id) && Number(f.found_on.slice(5, 7)) === month).length;
    if (before) { score += 1; reasons.push(`déjà trouvé ici en ${MONTHS[month - 1]} (${before} fois)`); }
    return { id, label: sp.label, score, reasons };
  }).sort((a, b) => b.score - a.score);

  if (personal?.bonus || personal?.reasons?.length) {
    for (const p of perSpecies) p.score += personal.bonus;
    perSpecies.sort((a, b) => b.score - a.score);
    for (const r of personal.reasons) common.push(`Ton expérience : ${r}`);
  }
  const best = perSpecies[0].score;
  // Sans pluie notable (< 10 mm et aucune grosse pluie sur 14 jours), rien ne pousse : avis plafonné.
  const dry = w && w.rain10 < 10 && w.bigRainAgo == null;
  // Pluie toute récente sur un sol sec avant : trop tôt, les pousses ne sont pas encore sorties.
  const early = w && w.bigRainAgo != null && w.bigRainAgo < 5 && (w.rain10 - w.bigRainMm) < 10;
  let level = !w ? 'moyen' : dry ? 'faible' : best >= 6 ? 'bon' : best >= 3 ? 'moyen' : 'faible';
  if (early && level === 'bon') level = 'moyen';
  if (early) common.push('Trop tôt : sol sec avant cette pluie, repasse dans 5 à 10 jours');
  if (w && w.rainNext >= 15) common.push(`Pluie annoncée : ${w.rainNext} mm dans les prochains jours → à surveiller d'ici une semaine`);
  return { level, score: best, reasons: common, perSpecies };
}

// ---------------------------------------------------------------------------
// Type de forêt IGN (BD Forêt V2, champ « tfv ») → arbres du formulaire.
export function forestToTrees(tfv) {
  const t = (tfv || '').toLowerCase();
  const out = [];
  const add = (re, id) => { if (re.test(t)) out.push(id); };
  add(/pin d.alep/, 'pin-alep');
  add(/pin sylvestre/, 'pin-sylvestre');
  add(/pin maritime/, 'pin-maritime');
  add(/chênes? sempervirent/, 'chene-vert');
  add(/chênes? décidu/, 'chene-blanc');
  add(/hêtre/, 'hetre');
  add(/châtaignier/, 'chataignier');
  add(/mélèze/, 'meleze');
  add(/herbacée/, 'prairie');
  return out;
}

// ---------------------------------------------------------------------------
// Grille de points sur la région PACA (contour simplifié, approximatif).
export const PACA = [
  [44.17, 4.65], [44.33, 4.80], [44.45, 5.00], [44.40, 5.42], [44.50, 5.65], [44.80, 5.60], [44.90, 5.95],
  [45.12, 6.25], [44.98, 6.75], [44.70, 7.05], [44.35, 6.95], [44.10, 7.70], [43.78, 7.53], [43.55, 7.05],
  [43.40, 6.75], [43.10, 6.40], [43.05, 6.00], [43.15, 5.55], [43.22, 5.30], [43.38, 4.85], [43.40, 4.55],
  [43.70, 4.62], [43.95, 4.70],
];
export function inPolygon([lat, lon], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function pacaGrid(step = 0.25) {
  const pts = [];
  for (let lat = 43.0; lat <= 45.2; lat += step) {
    for (let lon = 4.5; lon <= 7.8; lon += step) {
      const p = [Math.round(lat * 100) / 100, Math.round(lon * 100) / 100];
      if (inPolygon(p, PACA)) pts.push(p);
    }
  }
  return pts;
}

/** Couleur d'un cumul de pluie (mm) pour la carte. */
export function rainColor(mm) {
  if (mm < 2) return '#d9d4c7';
  if (mm < 10) return '#a6cee3';
  if (mm < 25) return '#5aa0d6';
  if (mm < 50) return '#1f6fb4';
  return '#0b3d7a';
}

// Villes repères pour nommer un point de la grille (« près de Digne »).
export const TOWNS = [
  ['Aix-en-Provence', 43.53, 5.45], ['Marseille', 43.30, 5.37], ['Toulon', 43.12, 5.93], ['Hyères', 43.12, 6.13],
  ['Brignoles', 43.41, 6.06], ['Draguignan', 43.54, 6.46], ['Fréjus', 43.43, 6.74], ['Grasse', 43.66, 6.92],
  ['Nice', 43.70, 7.27], ['Saint-Martin-Vésubie', 44.07, 7.26], ['Puget-Théniers', 43.96, 6.89], ['Castellane', 43.85, 6.51],
  ['Digne', 44.09, 6.24], ['Barcelonnette', 44.39, 6.65], ['Sisteron', 44.20, 5.94], ['Manosque', 43.83, 5.79],
  ['Forcalquier', 43.96, 5.78], ['Apt', 43.88, 5.40], ['Sault', 44.09, 5.41], ['Carpentras', 44.06, 5.05],
  ['Avignon', 43.95, 4.81], ['Arles', 43.68, 4.63], ['Gap', 44.56, 6.08], ['Embrun', 44.56, 6.50], ['Briançon', 44.90, 6.64],
];
export function nearestTown(lat, lon) {
  let best = null, bd = Infinity;
  for (const [n, a, b] of TOWNS) {
    const d = Math.hypot(a - lat, (b - lon) * Math.cos((lat * Math.PI) / 180));
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}
