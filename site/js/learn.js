// Apprentissage sur tes propres trouvailles : conditions météo réelles avant chaque trouvaille,
// seuils personnels par coin, et bilan (mois, années, espèces). Logique pure, testée.
import { summarizeWeather } from './advisor.js';
import { speciesLabel, MONTHS } from './logic.js';

export const MIN_FINDS = 3;   // en dessous, on n'en tire pas de règle

const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const addDays = (iso, k) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };

/** Période d'historique à demander pour un coin : 15 jours avant la première trouvaille → la dernière. */
export function historyRange(finds) {
  const dates = finds.map((f) => f.found_on).sort();
  return dates.length ? { start: addDays(dates[0], -15), end: dates.at(-1) } : null;
}

/** Conditions avant chaque trouvaille (le jour même exclu). daily = réponse Open-Meteo « archive ». */
export function findConditions(finds, daily) {
  return finds.map((f) => ({ find: f, w: summarizeWeather(daily, f.found_on) }))
    .filter((x) => x.w.days.length >= 7);
}

/** Profil d'un coin à partir de ses trouvailles (avec ou sans météo). */
export function spotProfile(finds, conditions = []) {
  const months = Array(12).fill(0), years = {}, species = {};
  for (const f of finds) {
    months[Number(f.found_on.slice(5, 7)) - 1]++;
    const y = f.found_on.slice(0, 4); years[y] = (years[y] ?? 0) + 1;
    for (const s of f.species ?? []) species[s] = (species[s] ?? 0) + 1;
  }
  const best = months.indexOf(Math.max(...months));
  const rains = conditions.map((c) => c.w.rain14);   // 14 j : couvre le délai habituel des pousses
  const delays = conditions.map((c) => c.w.bigRainAgo).filter((d) => d != null);
  const learned = conditions.length >= MIN_FINDS;
  return {
    n: finds.length, months, years, species,
    bestMonth: finds.length ? best + 1 : null,
    topSpecies: Object.entries(species).sort((a, b) => b[1] - a[1]).map(([id, k]) => ({ id, label: speciesLabel(id), k })),
    learned,
    nWeather: conditions.length,
    rain14Median: learned ? Math.round(median(rains)) : null,
    rain14Min: learned ? Math.round(Math.min(...rains)) : null,
    delayMin: learned && delays.length >= 2 ? Math.min(...delays) : null,
    delayMax: learned && delays.length >= 2 ? Math.max(...delays) : null,
  };
}

/** Raisons et bonus « personnels » pour la météo actuelle w, si le profil est appris. */
export function personalAdvice(w, p) {
  if (!w || !p?.learned) return { bonus: 0, reasons: [] };
  let bonus = 0; const reasons = [];
  if (w.rain14 >= p.rain14Min) { bonus += 1; reasons.push(`assez de pluie pour ce coin (tes trouvailles : dès ${p.rain14Min} mm sur 14 j)`); }
  else { bonus -= 1; reasons.push(`moins de pluie que lors de tes trouvailles ici (au moins ${p.rain14Min} mm sur 14 j)`); }
  if (p.delayMin != null && w.bigRainAgo != null) {
    if (w.bigRainAgo >= p.delayMin - 1 && w.bigRainAgo <= p.delayMax + 1) { bonus += 2; reasons.push(`bon délai : tes trouvailles ici arrivent ${p.delayMin} à ${p.delayMax} j après une grosse pluie`); }
    else if (w.bigRainAgo < p.delayMin - 1) reasons.push(`encore ${p.delayMin - w.bigRainAgo} j environ avant le délai habituel de ce coin`);
  }
  return { bonus, reasons };
}

/** Phrase de bilan lisible. */
export function profileSummary(p) {
  if (!p.n) return 'Aucune trouvaille notée pour l\'instant.';
  const ys = Object.entries(p.years).sort().map(([y, k]) => `${y} : ${k}`).join(', ');
  let s = `${p.n} trouvaille${p.n > 1 ? 's' : ''} (${ys}). Meilleur mois : ${MONTHS[p.bestMonth - 1]}.`;
  if (p.learned) s += ` Conditions apprises sur ${p.nWeather} trouvailles : en général ${p.rain14Median} mm sur les 14 jours d'avant`
    + (p.delayMin != null ? `, ${p.delayMin} à ${p.delayMax} jours après une grosse pluie.` : '.');
  else s += ` Encore ${MIN_FINDS - p.nWeather} trouvaille${MIN_FINDS - p.nWeather > 1 ? 's' : ''} pour apprendre les conditions de ce coin.`;
  return s;
}
