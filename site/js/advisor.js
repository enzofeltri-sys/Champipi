// Le « conseiller » : règles simples et transparentes (pas d'IA) qui croisent la météo,
// la saison, le milieu et l'historique des trouvailles. Indicatif uniquement.
import { SPECIES, MONTHS, LATE_MAX_ALT } from './logic.js';

// Fiches des espèces : milieux, sol, altitude indicative, sosies dangereux.
// Source : connaissances mycologiques générales (à confirmer auprès d'une société mycologique).
export const SOIL_WET = 0.33, SOIL_DRY = 0.26;   // humidité du sol (m³/m³), à affiner avec vos trouvailles
export const SOIL_T = {
  'lactaire-sanguin': [8, 16], 'petit-gris': [5, 12], cepe: [12, 18], girolle: [12, 18], 'pied-de-mouton': [6, 14],
  trompette: [8, 15], oronge: [16, 24], coulemelle: [12, 20], berigoule: [10, 18], morille: [8, 14],
  'saint-georges': [8, 14], 'chanterelle-grise': [4, 12], 'lactaire-delicieux': [8, 16],
};
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
    soilT: daily.soil_temperature_0_to_7cm_mean?.[i] ?? null,
    soilM: daily.soil_moisture_0_to_7cm_mean?.[i] ?? null,
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
  const soilT3 = avg(recent, 'soilT'), soilM3 = avg2(recent, 'soilM');
  // Choc thermique : les nuits (moyenne sur 3 jours) chutent d'au moins 4 °C par rapport aux 3 jours d'avant.
  let shockAgo = null, shockDrop = 0;
  const p = past.slice(-17);
  for (let i = p.length - 3; i >= 3; i--) {
    const after = avg(p.slice(i, i + 3), 'tmin'), before = avg(p.slice(i - 3, i), 'tmin');
    if (after != null && before != null && before - after >= 4) { shockAgo = dayDiff(p[i].date, today); shockDrop = Math.round(before - after); break; }
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

// Au-dessus de 1 000 m, cèpe, girolle, trompette, pied-de-mouton et chanterelle grise sortent en juillet–octobre,
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

export function assess(w, { month, species = [], trees = [], history = [], personal = null, alt: alt0 = null, exposure = null, soil = null, today = null }) {
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
    if (w.rain10 >= 40) { base += 3; common.push(`Bien arrosé : ${w.rain10} mm sur 10 jours`); }
    else if (w.rain10 >= 20) { base += 2; common.push(`Assez arrosé : ${w.rain10} mm sur 10 jours`); }
    else if (w.rain10 >= 10) { base += 1; common.push(`Un peu de pluie : ${w.rain10} mm sur 10 jours`); }
    else common.push(`Sec : ${w.rain10} mm sur 10 jours`);

    if (w.bigRainAgo != null && w.bigRainAgo >= 5 && w.bigRainAgo <= 15) { base += 2; common.push(`Grosse pluie (${w.bigRainMm} mm) il y a ${w.bigRainAgo} j : bonne fenêtre de pousse`); }
    else if (w.bigRainAgo != null && w.bigRainAgo < 5) common.push(`Grosse pluie (${w.bigRainMm} mm) il y a ${w.bigRainAgo} j : les pousses arrivent en général 5 à 10 jours après`);

    // Températures : en début de saison (août–octobre) la chaleur freine la pousse, en fin de saison (novembre–janvier)
    // c'est le froid ; des nuits douces la prolongent (études catalanes : Karavani 2018, Morera 2021).
    if (w.frost7 >= 3 || (w.tmin7 != null && w.tmin7 < 1)) { base -= 2; common.push(`Froid : ${w.frost7} nuit(s) de gel cette semaine`); }
    else if ([8, 9, 10].includes(month) && w.tmax7 != null && w.tmax7 > 26) { base -= 1; common.push(`Chaud : ${w.tmax7} °C de max en moyenne (la chaleur freine la pousse)`); }
    else if ([11, 12, 1].includes(month) && w.tmin7 != null && w.tmin7 >= 6) { base += 1; common.push(`Nuits douces (${w.tmin7} °C) : la saison se prolonge`); }
    // Humidité du sol (modèle, couche 0–7 cm, m³/m³) : la pluie compte, mais surtout ce que le sol a gardé.
    // Seuils réglés sur la Provence (près d'Aix : ~0,27 après deux semaines sèches, ~0,40 après une bonne pluie).
    if (w.soilM3 != null) {
      if (w.soilM3 >= SOIL_WET) { base += 1; common.push(`Sol bien humide (${Math.round(w.soilM3 * 100)} %)`); }
      else if (w.soilM3 < SOIL_DRY) { base -= 1; common.push(`Sol sec (${Math.round(w.soilM3 * 100)} %)`); }
      else common.push(`Sol moyennement humide (${Math.round(w.soilM3 * 100)} %)`);
    }
    // Réserve d'eau : un sol méditerranéen doit d'abord se recharger ; la pluie récente ne fait que choisir le moment.
    // Seuils provisoires (30 / 80 mm sur 30 jours), à caler sur les trouvailles de la famille.
    if (w.rain30 != null && w.rain30 >= 80) { base += 1; common.push(`Bonne réserve d'eau : ${w.rain30} mm sur 30 jours (${w.rainDays30} jours de pluie)`); }
    if (w.shockAgo != null && w.shockAgo >= 3 && w.shockAgo <= 14) { base += 1; common.push(`Choc thermique il y a ${w.shockAgo} j (nuits plus fraîches de ${w.shockDrop} °C) : souvent un déclencheur`); }
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
  if (w && w.rain30 != null && w.rain30 < 30 && level === 'bon') { level = 'moyen'; common.push(`Réserve d'eau faible : ${w.rain30} mm sur 30 jours, le sol n'est pas encore rechargé`); }
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
