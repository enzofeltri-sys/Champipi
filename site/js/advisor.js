// Le « conseiller » : règles simples et transparentes (pas d'IA) qui croisent la météo,
// la saison, le milieu et l'historique des trouvailles. Indicatif uniquement.
import { SPECIES, MONTHS, LATE_MAX_ALT } from './logic.js';

// Fiches des espèces : milieux, sol, altitude indicative, sosies dangereux.
// Source : connaissances mycologiques générales (à confirmer auprès d'une société mycologique).
export const SOIL_WET = 0.33, SOIL_DRY = 0.26;   // humidité du sol (m³/m³), à affiner avec vos trouvailles
export const SOIL_T = {
  'lactaire-sanguin': [8, 16], 'petit-gris': [5, 12], cepe: [12, 18], girolle: [12, 18], 'pied-de-mouton': [6, 14],
  trompette: [8, 15], oronge: [16, 24], coulemelle: [12, 20], berigoule: [10, 18], morille: [10, 15],
  'saint-georges': [8, 14], 'chanterelle-grise': [4, 12], 'lactaire-delicieux': [8, 16],
};
// Délai (jours) entre une grosse pluie et la pousse : 5–15 j par défaut (règle de cueilleur) ; le cèpe 7–25 j
// (une à trois semaines : étude toscane sur 21 j, règle du Luberon « une dizaine de jours »). Hypothèses à caler.
export const DELAY_DEFAULT = [5, 15];
// Contrôle avec les observations GBIF de l'arc méditerranéen (tools/check-thresholds.py, nov. 2026) : beaucoup de
// trompettes et de lactaires sortent 20 à 30 jours après la grosse pluie ; le pied-de-mouton y réagit peu.
export const DELAY = { cepe: [7, 25], trompette: [5, 25], 'lactaire-sanguin': [5, 25], 'lactaire-delicieux': [5, 25] };
export const RAIN_BONUS = { 'pied-de-mouton': 1 };   // sinon +2
// Préférences de sol « souples » (un plus quand le sol convient, jamais un refus) : le cèpe pousse aussi sur calcaire,
// mais il est plus fréquent sur sol acide ; trompette, saint-georges et morille aiment les sols riches, calcaires ou neutres.
// Les préférences nettes (girolle, oronge… : GUIDE[].soil) excluent l'autre type de sol.
export const SOIL_SOFT = { cepe: 'siliceux', trompette: 'calcaire', 'saint-georges': 'calcaire', morille: 'calcaire' };
// Préférences strictes (espèce exclue de la carte sur l'autre sol) : aucune pour l'instant. Les sources décrivent
// des préférences, pas des exclusions, et la carte du sol (~1 km) ne voit pas les poches locales : le lactaire sanguin
// garde −2 sur sol acide mais reste affiché ; la bérigoule dépend surtout du panicaut (rapport de recherche, nov. 2026).
export const SOIL_STRICT = new Set();
// Forte préférence (−2 sur l'autre sol, mais toujours affiché) : le lactaire sanguin, calcicole marqué.
export const SOIL_STRONG = new Set(['lactaire-sanguin']);
// Girolles de Provence : deux profils (Olariaga et al. 2017, Fungal Diversity) — sous chêne vert ou chêne pubescent sur
// calcaire, Cantharellus alborufescens, calcicole ; ailleurs (chêne-liège, châtaignier, pin maritime) girolles des sols acides.
const LIMESTONE_OAKS = ['chene-vert', 'chene-blanc'];
/** Effet du sol pour une espèce : { delta, text } (texte vide = rien à dire). found = déjà trouvée à cet endroit ; trees = arbres du lieu. */
export function soilEffect(id, soil, found = false, trees = []) {
  if (soil !== 'calcaire' && soil !== 'siliceux') return { delta: 0, text: '', bad: false };
  const pref = GUIDE[id]?.soil ?? null, soft = SOIL_SOFT[id] ?? null, name = soil === 'siliceux' ? 'acide' : 'calcaire';
  const want = (p) => (p === 'siliceux' ? 'acide' : 'calcaire');
  if (id === 'girolle' && soil === 'calcaire') {
    if (trees.some((t) => LIMESTONE_OAKS.includes(t))) return { delta: 1, text: 'sol calcaire sous chênes : la girolle des chênes de Provence (C. alborufescens) l\'aime', bad: false };
    if (!trees.length || found) return { delta: 0, text: '', bad: false };   // arbres inconnus : on ne juge pas
    return { delta: -1, text: 'sol calcaire sans chênes : moins fréquent (girolles des sols acides)', bad: false };
  }
  if (pref === soil) return { delta: 1, text: `sol ${name} : celui qu'il préfère`, bad: false };
  if (pref) {
    if (found) return { delta: 0, text: `sol ${name}, mais déjà trouvé ici`, bad: false };   // l'expérience passe avant la règle
    if (SOIL_STRICT.has(id)) return { delta: -2, text: `sol ${name} : il lui faut un sol ${want(pref)}`, bad: true };
    if (SOIL_STRONG.has(id)) return { delta: -2, text: `sol ${name} : rare (il préfère nettement un sol ${want(pref)})`, bad: false };
    return { delta: -1, text: `sol ${name} : moins fréquent (préfère un sol ${want(pref)})`, bad: false };
  }
  if (soft === soil) return { delta: 1, text: `sol ${name} : favorable`, bad: false };
  return { delta: 0, text: '', bad: false };
}

export const GUIDE = {
  'lactaire-sanguin': { latin: 'Lactarius sanguifluus', trees: ['pin-alep', 'pin-sylvestre', 'pin-maritime'], soil: 'calcaire', alt: [0, 1200],
    habitat: 'Sous les pins (surtout pin d\'Alep), sols calcaires, pinèdes claires.',
    lookalikes: 'Autres lactaires (lait blanc ou âcre). Le lactaire sanguin a un lait rouge vineux.' },
  'lactaire-delicieux': { latin: 'Lactarius deliciosus', trees: ['pin-alep', 'pin-sylvestre', 'pin-maritime'], soil: null, alt: [0, 1800],
    habitat: 'Sous les pins, sur tous les sols (là où le lactaire sanguin manque, sur silice).',
    lookalikes: 'Autres lactaires : lait orange carotte ici (rouge vineux chez le sanguin, blanc et âcre chez les toxiques).' },
  'petit-gris': { latin: 'Tricholoma terreum', trees: ['pin-alep', 'pin-sylvestre', 'pin-maritime'], soil: null, alt: [0, 1500],
    habitat: 'Sous les pins, souvent en troupes, sur aiguilles.',
    lookalikes: '⚠️ Tricholome tigré (Tricholoma pardinum), toxique : chapeau plus grand, écailles marquées.' },
  cepe: { latin: 'Boletus edulis, aereus, aestivalis…', trees: ['chene-blanc', 'chene-vert', 'chene-liege', 'chataignier', 'hetre', 'pin-sylvestre', 'pin-maritime'], soil: null, alt: [0, 1600],
    habitat: 'Chênaies (chêne-liège et chêne vert pour le cèpe bronzé en basse Provence, avec cistes, arbousiers, bruyères), châtaigneraies, hêtraies et pinèdes ; lisières et sous-bois clairs.',
    lookalikes: '⚠️ Bolet de Satan (pores rouges, pied réticulé rouge), toxique. Bolet amer : immangeable.' },
  girolle: { latin: 'Cantharellus alborufescens, pallens, cibarius…', trees: ['chene-vert', 'chene-liege', 'chene-blanc', 'chataignier', 'hetre', 'pin-maritime'], soil: 'siliceux', alt: [0, 1500],
    habitat: 'Deux girolles en Provence : sous chêne vert et chêne pubescent sur calcaire (C. alborufescens), et sous chêne-liège, châtaignier ou pin maritime sur sol acide (Maures, Estérel).',
    lookalikes: '⚠️ Clitocybe de l\'olivier (Omphalotus olearius), toxique et très courant en Provence : vraies lamelles, pousse en touffes sur souches. Fausse girolle (Hygrophoropsis).' },
  'pied-de-mouton': { latin: 'Hydnum repandum', trees: ['chene-blanc', 'chene-vert', 'hetre', 'chataignier', 'pin-sylvestre'], soil: null, alt: [0, 1600],
    habitat: 'Feuillus et conifères, souvent en cercles ou en lignes.',
    lookalikes: 'Peu de confusion dangereuse : aiguillons sous le chapeau (pas de lamelles).' },
  trompette: { latin: 'Craterellus cornucopioides', trees: ['chene-blanc', 'hetre', 'chataignier'], soil: null, alt: [200, 1500],
    habitat: 'Feuillus (hêtres, chênes, châtaigniers), sols frais, mousses et feuilles mortes.',
    lookalikes: 'Peu de confusion dangereuse, mais difficile à voir.' },
  oronge: { latin: 'Amanita caesarea', trees: ['chene-blanc', 'chene-vert', 'chene-liege', 'chataignier'], soil: null, alt: [0, 1000],
    habitat: 'Chênaies et châtaigneraies chaudes et claires, sur calcaire comme sur silice (Var, Maures) ; souvent après les orages d\'été.',
    lookalikes: '⚠️⚠️ Au stade « œuf », confusion possible avec l\'amanite phalloïde, MORTELLE. Amanite tue-mouches (toxique).' },
  coulemelle: { latin: 'Macrolepiota procera', trees: ['prairie'], soil: null, alt: [0, 1800],
    habitat: 'Lisières, clairières, prairies et bords de chemins.',
    lookalikes: '⚠️⚠️ Petites lépiotes, MORTELLES : ne ramasser que les grands exemplaires (chapeau > 10 cm, anneau coulissant).' },
  berigoule: { latin: 'Pleurotus eryngii', trees: ['prairie'], soil: 'calcaire', alt: [0, 1000],
    habitat: 'Friches et pelouses sèches calcaires, sur les racines du panicaut champêtre.',
    lookalikes: 'Peu de confusion dangereuse dans ce milieu ; vérifier la présence du panicaut.' },
  morille: { latin: 'Morchella spp. (dont M. dunalii, méditerranéenne)', trees: ['chene-vert', 'pin-alep'], soil: null, alt: [0, 1800],
    habitat: 'Chênaies vertes et pinèdes de pin d\'Alep sur calcaire au printemps (morille méditerranéenne, M. dunalii), frênes et bords de rivières, zones brûlées, vergers.',
    lookalikes: '⚠️⚠️ Gyromitre (cerveau plissé, pas d\'alvéoles creuses), MORTEL. Toujours bien cuire les morilles.' },
  'saint-georges': { latin: 'Calocybe gambosa', trees: ['prairie'], soil: null, alt: [0, 1800],
    habitat: 'Prairies, haies, lisières ; pousse en ronds au printemps.',
    lookalikes: '⚠️⚠️ Entolome livide et inocybe de Patouillard, MORTELS. Odeur de farine fraîche caractéristique.' },
  // « Chanterelle » : les chanterelles en tube, grise (C. tubaeformis, sols acides) et jaune (C. lutescens, calcaire
  // humide) — ensemble, pas de préférence de sol. (La girolle, parfois appelée chanterelle, est à part.)
  'chanterelle-grise': { latin: 'Craterellus tubaeformis, C. lutescens', trees: ['pin-sylvestre', 'hetre', 'chataignier', 'chene-blanc'], soil: null, alt: [300, 1800],
    habitat: 'Chanterelles en tube : la grise sur sols acides et moussus (conifères, châtaigniers, hêtres), la jaune sur calcaire dans les combes humides, sous les chênes et les pins ; tard en saison, en troupes.',
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
    soilT: daily.soil_temperature_0_to_7cm_mean?.[i] ?? null,
    // Humidité : couche 7–28 cm quand on l'a (là où vivent les mycéliums, et plus stable) ; sinon la surface 0–7 cm.
    soilM: daily.soil_moisture_7_to_28cm_mean?.[i] ?? daily.soil_moisture_0_to_7cm_mean?.[i] ?? null,
    soilTop: daily.soil_moisture_0_to_7cm_mean?.[i] ?? null,
    et0: daily.et0_fao_evapotranspiration?.[i] ?? null,
  }));
  const past = rows.filter((r) => r.date < today);
  const last10 = past.slice(-10);
  const last7 = past.slice(-7);
  const future = rows.filter((r) => r.date > today);
  const sum = (a) => Math.round(a.reduce((s, r) => s + (r.rain || 0), 0) * 10) / 10;
  const avg = (a, k) => { const v = a.map((r) => r[k]).filter((x) => x != null); return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null; };
  const avg2 = (a, k) => { const v = a.map((r) => r[k]).filter((x) => x != null); return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 100) / 100 : null; };

  // Dernière « grosse pluie » : un jour ≥ 15 mm, ou deux jours consécutifs ≥ 20 mm (sur les 14 derniers jours).
  let bigRainAgo = null, bigRainMm = 0;
  const p14 = past.slice(-14);
  for (let i = p14.length - 1; i >= 0; i--) {
    const two = p14[i].rain + (p14[i + 1]?.rain ?? 0);
    if (p14[i].rain >= 15 || two >= 20) { bigRainAgo = dayDiff(p14[i].date, today); bigRainMm = Math.round(Math.max(p14[i].rain, two)); break; }
  }
  let lastRainAgo = null;
  for (let i = past.length - 1; i >= 0; i--) if (past[i].rain >= 2) { lastRainAgo = dayDiff(past[i].date, today); break; }

  // Sol (modèle) : moyenne des 3 derniers jours, aujourd'hui compris.
  const recent = [...past.slice(-2), ...rows.filter((r) => r.date === today)];
  const soilT3 = avg(recent, 'soilT'), soilM3 = avg2(recent, 'soilM'), soilTop3 = avg2(recent, 'soilTop');
  const soilDepth = daily.soil_moisture_7_to_28cm_mean?.some((x) => x != null) ? '7–28 cm' : '0–7 cm';
  // Bilan d'eau sur 30 jours : pluie moins évaporation potentielle (FAO) — ce que le sol a réellement pu garder.
  const p30e = past.slice(-30).filter((r) => r.et0 != null);
  const balance30 = past.length >= 28 && p30e.length >= 28 ? Math.round(sum(past.slice(-30)) - p30e.reduce((s, r) => s + r.et0, 0) * 30 / p30e.length) : null;
  // Choc thermique : les nuits (moyenne sur 3 jours) chutent d'au moins 4 °C par rapport aux 3 jours d'avant.
  let shockAgo = null, shockDrop = 0;
  const p = past.slice(-17);
  for (let i = p.length - 3; i >= 3; i--) {
    const after = avg(p.slice(i, i + 3), 'tmin'), before = avg(p.slice(i - 3, i), 'tmin');
    if (after != null && before != null && before - after >= 4) { shockAgo = dayDiff(p[i].date, today); shockDrop = Math.round(before - after); break; }
  }

  // Toutes les grosses pluies des 30 derniers jours : le délai avant la pousse dépend de l'espèce (cèpe plutôt 10–25 j).
  const bigRains = [];
  const p30 = past.slice(-30);
  for (let i = p30.length - 1; i >= 0; i--) {
    const two = p30[i].rain + (p30[i + 1]?.rain ?? 0);
    if (p30[i].rain >= 15 || (two >= 20 && p30[i].rain > 0 && p30[i + 1].rain > 0)) bigRains.push({ ago: dayDiff(p30[i].date, today), mm: Math.round(Math.max(p30[i].rain, two)) });
  }
  // Plus gros épisode (2 jours) des 10 derniers jours : au-delà de 100 mm, l'eau ruisselle (effet « en cloche », Poblet).
  let episode10 = 0;
  for (let i = 0; i < last10.length; i++) episode10 = Math.max(episode10, last10[i].rain + (last10[i + 1]?.rain ?? 0));
  // Fin des chaleurs : dernier jour où la moyenne des maxi sur 7 jours dépassait 26 °C, si elle est redescendue à 24 °C ou moins.
  let heatEndAgo = null;
  const tmaxNow = avg(last7, 'tmax');
  if (tmaxNow != null && tmaxNow <= 24) {
    for (let i = past.length - 1; i >= 6; i--) {
      const m = avg(past.slice(i - 6, i + 1), 'tmax');
      if (m != null && m > 26) { heatEndAgo = dayDiff(past[i].date, today); break; }
    }
  }
  // Morille : somme des températures du sol au-dessus de 0 °C sur 20 jours (≈ 230 °C·j à la première sortie, Missouri) ;
  // à défaut de sol, la température moyenne de l'air.
  const p20 = past.slice(-20);
  let degreeDays20 = null, ddSource = null;
  if (p20.length >= 20) {
    const soilV = p20.map((r) => r.soilT).filter((x) => x != null);
    const airV = p20.filter((r) => r.tmin != null && r.tmax != null).map((r) => (r.tmin + r.tmax) / 2);
    const [v, src] = soilV.length >= 18 ? [soilV, 'sol'] : airV.length >= 18 ? [airV, 'air'] : [null, null];
    if (v) { degreeDays20 = Math.round((v.reduce((s, x) => s + Math.max(0, x), 0) * 20) / v.length); ddSource = src; }
  }

  return {
    days: last10,
    today: rows.find((r) => r.date === today) ?? null,
    future,
    rain10: sum(last10),
    rain3: sum(past.slice(-3)),
    rain14: sum(past.slice(-14)),
    // Réserve : les études méditerranéennes jugent la saison sur la pluie d'un mois et plus (et le nombre de jours de pluie).
    rain30: past.length >= 28 ? sum(past.slice(-30)) : null,
    rainDays30: past.length >= 28 ? past.slice(-30).filter((r) => (r.rain || 0) >= 1).length : null,
    elevation: daily.elevation ?? null,
    rainNext: sum(future),
    bigRainAgo, bigRainMm, lastRainAgo,
    tmin7: avg(last7, 'tmin'),
    tmax7: avg(last7, 'tmax'),
    frost7: last7.filter((r) => r.tmin != null && r.tmin < 0).length,
    soilT3, soilM3, shockAgo, shockDrop,
    bigRains, episode10: Math.round(episode10), heatEndAgo, degreeDays20, ddSource,
    soilTop3, soilDepth, balance30,
  };
}

/** Conditions d'une sortie (trouvaille ou bredouille), gardées avec elle pour caler les seuils plus tard. */
export function outingConditions(w, soilClim = null, month = null, swi = null) {
  if (!w) return null;
  return {
    swi: swi?.swi ?? null, swiNormal: swi?.normal ?? null,
    rain10: w.rain10, rain14: w.rain14, rain30: w.rain30, rainDays30: w.rainDays30,
    bigRainAgo: w.bigRainAgo, bigRainMm: w.bigRainMm, bigRains: (w.bigRains ?? []).map((b) => b.ago),
    episode10: w.episode10, tmin7: w.tmin7, tmax7: w.tmax7, frost7: w.frost7, heatEndAgo: w.heatEndAgo,
    soilM3: w.soilM3, soilDepth: w.soilDepth, soilTop3: w.soilTop3, soilT3: w.soilT3, balance30: w.balance30,
    soilRank: month ? soilRank(soilClim, month, w.soilM3) : null,
    degreeDays20: w.degreeDays20, ddSource: w.ddSource,
  };
}

/** Maille SIM (Météo-France, ~8 km) qui contient le point : { swi, normal, rain15, date } ou null. */
export function swiAt(rows, lat, lon) {
  let best = null, bd = Infinity;
  for (const r of rows ?? []) {
    if (lon < r.w || lon > r.e || lat < r.s || lat > r.n) continue;
    const d = (lon - (r.w + r.e) / 2) ** 2 + (lat - (r.s + r.n) / 2) ** 2;
    if (d < bd) { bd = d; best = r; }
  }
  return best ? { swi: best.swi, normal: best.normal, rain15: best.rain15, date: best.date } : null;
}

/** Rang de l'humidité du jour parmi les jours de ce mois ici (déciles de champi_soil_clim) : 0 … 0,9, ou null. */
export function soilRank(clim, month, v) {
  const d = clim?.[month] ?? clim?.[String(month)];
  if (!Array.isArray(d) || d.length !== 9 || v == null) return null;
  return d.filter((x) => v > x).length / 10;
}

/**
 * Feu le plus récent (surfaces brûlées Copernicus EFFIS, site/data/burned.json) qui contient le point, ou null.
 * @returns { date, ha, label }
 */
export function burnedAt(data, lat, lon) {
  let best = null;
  for (const f of data?.fires ?? []) {
    const [w, sth, e, n] = f.bbox;
    if (lon < w || lon > e || lat < sth || lat > n) continue;
    if (!f.rings.some((ring) => inRing(ring, lon, lat))) continue;
    if (!best || f.date > best.date) best = f;
  }
  if (!best) return null;
  const m = Number(best.date.slice(5, 7));
  return { date: best.date, ha: best.ha, label: `feu de ${MONTHS[m - 1]} ${best.date.slice(0, 4)}, ${best.ha} ha` };
}
function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
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
/** Jours depuis la dernière sortie bredouille, si elle est plus récente que la dernière vraie trouvaille (sinon null). */
export function lastEmptyVisit(history, today) {
  if (!today) return null;
  let lastReal = '', lastEmpty = '';
  for (const f of history) {
    if (!f.found_on || f.found_on > today) continue;
    if (f.empty) { if (f.found_on > lastEmpty) lastEmpty = f.found_on; }
    else if (f.found_on > lastReal) lastReal = f.found_on;
  }
  if (!lastEmpty || lastEmpty < lastReal) return null;
  return Math.round((Date.parse(today) - Date.parse(lastEmpty)) / 86400000);
}

// Au-dessus de 1 000 m, cèpe, girolle, trompette, pied-de-mouton et chanterelle sortent en juillet–octobre,
// avec un pic en août–septembre, et presque plus rien en novembre (observations GBIF / iNaturalist, PACA).
export const HIGH_ALT = 1000;
const HIGH_SEASON = { months: [7, 8, 9, 10], peak: [8, 9], late: [] };
const HIGH_SHIFT = new Set(['cepe', 'girolle', 'trompette', 'pied-de-mouton', 'chanterelle-grise']);
/** Saison d'une espèce à une altitude donnée : { months, peak, late }. */
export function seasonAt(id, alt) {
  const sp = SPECIES.find((s) => s.id === id);
  if (!sp) return { months: [], peak: [], late: [] };
  if (alt != null && alt >= HIGH_ALT && HIGH_SHIFT.has(id)) return HIGH_SEASON;
  if (alt != null && alt >= HIGH_ALT && id === 'morille') return { months: [4, 5, 6], peak: [5, 6], late: [] };
  return { months: sp.months, peak: sp.peak ?? [], late: sp.late ?? [] };
}

export function assess(w, { month, species = [], trees = [], history = [], personal = null, alt: alt0 = null, exposure = null, soil = null, today = null, soilClim = null, burned = null, swi = null }) {
  const alt = alt0 ?? w?.elevation ?? null;   // altitude du coin, sinon celle du point météo
  const known = species.filter((id) => SPECIES.some((s) => s.id === id && s.months.length));
  // Fin de saison (ex. cèpe en décembre en Provence) : seulement par temps doux, sans gel, à basse altitude.
  const mild = !!w && w.frost7 === 0 && w.tmin7 != null && w.tmin7 >= 4 && (alt == null || alt < LATE_MAX_ALT);
  const isLate = (id) => seasonAt(id, alt).late.includes(month);
  const inSeason = known.filter((id) => seasonAt(id, alt).months.includes(month) || (mild && isLate(id)));
  if (!known.length) return { level: null, score: 0, reasons: ['Aucune espèce du calendrier notée à ce coin.'], perSpecies: [] };
  if (!inSeason.length) {
    const next = known.map((id) => [id, nextSeason(id, month)]).filter(([, m]) => m)
      .sort((a, b) => ((a[1] - month + 12) % 12) - ((b[1] - month + 12) % 12))[0];
    return { level: 'hors-saison', score: 0, reasons: next ? [`Prochaine saison : ${SPECIES.find((s) => s.id === next[0]).label} en ${MONTHS[next[1] - 1]}.`] : [], perSpecies: [] };
  }

  const common = [];
  let base = 0;
  if (w) {
    if (w.rain10 >= 40 && w.episode10 >= 100) { base += 2; common.push(`Pluie extrême : ${w.episode10} mm en 2 jours (beaucoup ruisselle : pas de bonus en plus)`); }
    else if (w.rain10 >= 40) { base += 3; common.push(`Bien arrosé : ${w.rain10} mm sur 10 jours`); }
    else if (w.rain10 >= 20) { base += 2; common.push(`Assez arrosé : ${w.rain10} mm sur 10 jours`); }
    else if (w.rain10 >= 10) { base += 1; common.push(`Un peu de pluie : ${w.rain10} mm sur 10 jours`); }
    else common.push(`Sec : ${w.rain10} mm sur 10 jours`);

    // Grosse pluie : le bonus dépend du délai propre à chaque espèce (plus bas) ; ici, seulement le « trop tôt ».
    if (w.bigRainAgo != null && w.bigRainAgo < 5) common.push(`Grosse pluie (${w.bigRainMm} mm) il y a ${w.bigRainAgo} j : les pousses suivent en général 5 à 25 jours après selon l'espèce`);

    // Températures : en début de saison (août–octobre) la chaleur freine la pousse, en fin de saison (novembre–janvier)
    // c'est le froid ; des nuits douces la prolongent (études catalanes : Karavani 2018, Morera 2021).
    if (w.frost7 >= 3 || (w.tmin7 != null && w.tmin7 < 1)) { base -= 2; common.push(`Froid : ${w.frost7} nuit(s) de gel cette semaine`); }
    else if ([8, 9, 10].includes(month) && w.tmax7 != null && w.tmax7 > 26) { base -= 1; common.push(`Chaud : ${w.tmax7} °C de max en moyenne (la chaleur freine la pousse)`); }
    else if ([11, 12, 1].includes(month) && w.tmin7 != null && w.tmin7 >= 6) { base += 1; common.push(`Nuits douces (${w.tmin7} °C) : la saison se prolonge`); }
    // Humidité du sol (modèle, couche 0–7 cm, m³/m³) : la pluie compte, mais surtout ce que le sol a gardé.
    // Seuils réglés sur la Provence (près d'Aix : ~0,27 après deux semaines sèches, ~0,40 après une bonne pluie).
    // Comparée d'abord à l'humidité habituelle de ce mois ici (même modèle, saisons 2022–2025) ; en novembre–janvier,
    // un sol humide traduit surtout un sol froid (Poblet) : pas de bonus, seul le sol sec compte.
    if (w.soilM3 != null) {
      const pct = Math.round(w.soilM3 * 100), late = [11, 12, 1].includes(month), mo = MONTHS[month - 1];
      const rank = soilRank(soilClim, month, w.soilM3);
      const tail = late ? ' (en fin de saison, ça compte peu)' : '';
      if (rank != null) {
        if (rank >= 0.7) { if (!late) base += 1; common.push(`Sol plus humide que ${Math.round(rank * 100)} % des jours ${/^[ao]/.test(mo) ? 'd\'' : 'de '}${mo} ici (${pct} %)${tail}`); }
        else if (rank < 0.3) { base -= 1; common.push(`Sol plus sec que d'habitude en ${mo} ici (${pct} %)`); }
        else common.push(`Sol humide comme d'habitude en ${mo} ici (${pct} %)`);
      } else if (w.soilM3 >= SOIL_WET) { if (!late) base += 1; common.push(`Sol bien humide (${pct} %)${tail}`); }
      else if (w.soilM3 < SOIL_DRY) { base -= 1; common.push(`Sol sec (${pct} %)`); }
      else common.push(`Sol moyennement humide (${pct} %)`);
    }
    // Réserve d'eau : un sol méditerranéen doit d'abord se recharger ; la pluie récente ne fait que choisir le moment.
    // Seuils provisoires (30 / 80 mm sur 30 jours), à caler sur les trouvailles de la famille.
    // Avec l'évaporation connue : bilan pluie − évaporation (forme des modèles catalans) ; sinon la pluie seule.
    // Second avis : indice d'humidité des sols de Météo-France (réserve sur ~2 m, comparée à sa normale 1991–2020).
    // Un seul point de « réserve », quel que soit le nombre d'indices qui le confirment.
    const swiTxt = swi?.swi != null ? `réserve profonde du sol (Météo-France) : ${Math.round(swi.swi * 100)} %, normale ${Math.round(swi.normal * 100)} %` : null;
    const swiWet = swi?.swi != null && swi.normal != null && swi.swi >= swi.normal;
    if (w.balance30 != null && w.balance30 >= 0) { base += 1; common.push(`Bonne réserve d'eau : pluie − évaporation = +${w.balance30} mm sur 30 jours (${w.rain30} mm de pluie)${swiTxt ? ` ; ${swiTxt}` : ''}`); }
    else if (swiWet) { base += 1; common.push(`Bonne réserve d'eau : ${swiTxt}`); }
    else if (w.balance30 == null && w.rain30 != null && w.rain30 >= 80) { base += 1; common.push(`Bonne réserve d'eau : ${w.rain30} mm sur 30 jours (${w.rainDays30} jours de pluie)`); }
    else if (swiTxt) common.push(`Réserve en dessous de la normale : ${swiTxt}`);
    // « Fin des chaleurs » plutôt que « choc thermique » (non testé par les études) : les maxi sont redescendus.
    if ([9, 10, 11].includes(month) && w.heatEndAgo != null && w.heatEndAgo >= 3 && w.heatEndAgo <= 21) { base += 1; common.push(`Fin des chaleurs il y a ${w.heatEndAgo} j (maxi redescendus à ${w.tmax7} °C) : la pousse peut démarrer`); }
  }

  // Sortie récente sans rien trouver (« Passé, rien trouvé »), plus récente que la dernière vraie trouvaille.
  const emptyAgo = lastEmptyVisit(history, today);
  if (emptyAgo != null && emptyAgo <= 3) { base -= 2; common.push(emptyAgo === 0 ? 'Passé aujourd\'hui sans rien trouver' : `Passé il y a ${emptyAgo} j sans rien trouver`); }
  else if (emptyAgo != null && emptyAgo <= 7) { base -= 1; common.push(`Passé il y a ${emptyAgo} j sans rien trouver`); }

  const perSpecies = inSeason.map((id) => {
    const sp = SPECIES.find((s) => s.id === id);
    const g = GUIDE[id];
    let score = base; const reasons = [];
    const season = seasonAt(id, alt);
    if (season.peak.includes(month)) { score += 1; reasons.push(alt != null && alt >= HIGH_ALT && HIGH_SHIFT.has(id) ? 'mois de pic en altitude' : 'mois de pic'); }
    // Grosse pluie dans la fenêtre de pousse de l'espèce.
    const rains = w?.bigRains ?? (w?.bigRainAgo != null ? [{ ago: w.bigRainAgo, mm: w.bigRainMm }] : []);
    if (rains.length) {
      const [lo, hi] = DELAY[id] ?? DELAY_DEFAULT;
      const hit = rains.find((b) => b.ago >= lo && b.ago <= hi);
      if (hit) { score += RAIN_BONUS[id] ?? 2; reasons.push(`grosse pluie (${hit.mm} mm) il y a ${hit.ago} j : dans sa fenêtre de pousse (${lo}–${hi} j)`); }
      else if (rains[0].ago < lo && lo > DELAY_DEFAULT[0]) reasons.push(`grosse pluie il y a ${rains[0].ago} j : il sort plutôt ${lo} à ${hi} j après`);
    }
    // Morille : chaleur cumulée sur 20 jours, et printemps qui suit un feu.
    if (id === 'morille' && w?.degreeDays20 != null) {
      const dd = w.degreeDays20, src = w.ddSource === 'air' ? 'de l\'air' : 'du sol';
      if (dd >= 230) { score += 1; reasons.push(`chaleur cumulée ${src} : ${dd} °C·j sur 20 j (les morilles sortent vers 230)`); }
      else if (dd < 150) { score -= 1; reasons.push(`encore froid : ${dd} °C·j ${src} sur 20 j (les morilles sortent vers 230)`); }
      else reasons.push(`chaleur cumulée ${src} : ${dd} °C·j sur 20 j, bientôt le seuil (≈ 230)`);
    }
    if (id === 'morille' && burned?.date && today) {
      const ago = (Date.parse(today) - Date.parse(burned.date)) / (30.4 * 86400000);
      if (ago >= 4 && ago <= 20) { score += 1; reasons.push(`zone brûlée (${burned.label}) : les morilles aiment le printemps qui suit un feu`); }
    }
    const st = SOIL_T[id];
    if (w?.soilT3 != null && st && !(w.frost7 >= 3)) {
      if (w.soilT3 >= st[0] && w.soilT3 <= st[1]) { score += 1; reasons.push(`sol à ${w.soilT3} °C : idéal (${st[0]}–${st[1]} °C)`); }
      else if (w.soilT3 < st[0] - 3) { score -= 2; reasons.push(`sol trop froid (${w.soilT3} °C)`); }
      else if (w.soilT3 > st[1] + 3) { score -= 2; reasons.push(`sol trop chaud (${w.soilT3} °C)`); }
      else reasons.push(`sol à ${w.soilT3} °C : un peu ${w.soilT3 < st[0] ? 'frais' : 'chaud'}`);
    }
    // Exposition : par temps sec, un versant nord garde l'humidité ; quand il fait frais, un versant sud se réchauffe.
    const face = exposure && exposure !== 'plat' ? (/^N/.test(exposure) ? 'nord' : /^S/.test(exposure) ? 'sud' : null) : null;
    if (w && face) {
      const dryish = (w.soilM3 != null ? w.soilM3 < SOIL_WET - 0.04 : w.rain10 < 20);
      const cool = w.soilT3 != null && st ? w.soilT3 < st[0] : (w.tmin7 != null && w.tmin7 < 5);
      if (dryish && !cool) { score += face === 'nord' ? 1 : -1; reasons.push(face === 'nord' ? 'versant nord : garde l\'humidité' : 'versant sud : sèche vite'); }
      else if (cool && !dryish) { score += face === 'sud' ? 1 : -1; reasons.push(face === 'sud' ? 'versant sud : plus chaud' : 'versant nord : plus froid'); }
    }
    // Sol (relevés de l'Inventaire forestier, carte des sols ou saisi à la main) : « mixte » ou inconnu → rien.
    const se = soilEffect(id, soil, history.some((f) => !f.empty && (f.species ?? []).includes(id)), trees);
    if (se.text) { score += se.delta; reasons.push(se.text); }
    if (!season.months.includes(month)) { score -= 1; reasons.push('fin de saison : possible car doux et sans gel'); }
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
  const dry = w && w.bigRainAgo == null && (w.soilM3 != null ? w.soilM3 < SOIL_DRY - 0.02 && w.rain10 < 20 : w.rain10 < 10);
  // Pluie toute récente sur un sol sec avant : trop tôt, les pousses ne sont pas encore sorties.
  const early = w && w.bigRainAgo != null && w.bigRainAgo < 5 && (w.rain10 - w.bigRainMm) < 10;
  let level = !w ? 'moyen' : dry ? 'faible' : best >= 6 ? 'bon' : best >= 3 ? 'moyen' : 'faible';
  // Réserve trop faible (sol pas encore rechargé) : pas plus que « moyen ».
  if (w && w.balance30 != null && w.balance30 <= -60 && level === 'bon') {
    level = 'moyen'; common.push(`Sol en déficit : pluie − évaporation = ${w.balance30} mm sur 30 jours, il n'est pas encore rechargé`);
  } else if (w && swi?.swi != null && swi.swi < 0.3 && level === 'bon') {
    level = 'moyen'; common.push(`Sol profond encore sec : réserve à ${Math.round(swi.swi * 100)} % (Météo-France), il n'est pas encore rechargé`);
  } else if (w && w.balance30 == null && w.rain30 != null && w.rain30 < 30 && level === 'bon') { level = 'moyen'; common.push(`Réserve d'eau faible : ${w.rain30} mm sur 30 jours, le sol n'est pas encore rechargé`); }
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
