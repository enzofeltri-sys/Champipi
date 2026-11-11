import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeWeather, assess, nextSeason, forestToTrees, pacaGrid, inPolygon, PACA, GUIDE, rainColor } from '../site/js/advisor.js';
import { SPECIES } from '../site/js/logic.js';

// Vraie réponse Open-Meteo (Sainte-Victoire, 5 nov. 2026), tronquée.
const real = {
  time: ['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'],
  precipitation_sum: [0, 1.2, 0, 0, 0, 0, 0, 0, 0.6, 0, 0.8, 0, 0, 3.5, 16.03, 13.6, 0],
  temperature_2m_max: [11.4, 12.2, 9.9, 12.4, 17.5, 17.5, 15.6, 17.4, 15, 14, 13, 12, 12, 11, 10, 9, 12],
  temperature_2m_min: [4, 5, 3, 4, 8, 9, 8, 7, 6, 5, 4, 3, 3, 4, 5, 4, 2],
};

test('résumé météo : 10 jours passés, aujourd\'hui à part, prévisions', () => {
  const w = summarizeWeather(real, '2026-11-05');
  assert.equal(w.days.length, 10);
  assert.equal(w.days[0].date, '2026-10-26');
  assert.equal(w.days.at(-1).date, '2026-11-04');
  assert.equal(w.rain10, 4.9);
  assert.equal(w.today.rain, 16.03);
  assert.equal(w.rainNext, 13.6);
  assert.equal(w.lastRainAgo, 1);
  assert.equal(w.bigRainAgo, null);
  assert.equal(w.frost7, 0);
});

test('grosse pluie détectée (1 jour ≥ 15 mm ou 2 jours ≥ 20 mm)', () => {
  const d = { time: ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'],
    precipitation_sum: [0, 12, 11, 0, 0, 0, 0, 0, 0, 0, 0], temperature_2m_max: Array(11).fill(16), temperature_2m_min: Array(11).fill(8) };
  const w = summarizeWeather(d, '2026-10-30');
  assert.equal(w.bigRainAgo, 9);
  assert.equal(w.bigRainMm, 23);
  const a = assess(w, { month: 10, species: ['cepe'], trees: ['chataignier'] });
  assert.equal(a.level, 'bon');
  assert.deepEqual(a.perSpecies[0].reasons, ['mois de pic', 'grosse pluie (23 mm) il y a 9 j : dans sa fenêtre de pousse (7–25 j)', 'milieu typique']);
});

test('évaluation : sec, hors saison, sans espèce, historique', () => {
  const w = summarizeWeather(real, '2026-11-05');
  const sec = assess(w, { month: 11, species: ['lactaire-sanguin'], trees: ['pin-alep'] });
  assert.equal(sec.level, 'faible');
  assert.ok(sec.reasons[0].startsWith('Sec'));
  const hs = assess(w, { month: 11, species: ['morille'] });
  assert.equal(hs.level, 'hors-saison');
  assert.match(hs.reasons[0], /mars/);
  assert.equal(assess(w, { month: 11, species: ['autre'] }).level, null);
  const hist = assess(w, { month: 11, species: ['lactaire-sanguin'], history: [{ found_on: '2025-11-12', species: ['lactaire-sanguin'] }, { found_on: '2024-11-02', species: ['lactaire-sanguin'] }] });
  assert.ok(hist.perSpecies[0].reasons.includes('déjà trouvé ici en novembre (2 fois)'));
  const gel = summarizeWeather({ ...real, temperature_2m_min: real.temperature_2m_min.map(() => -2) }, '2026-11-05');
  assert.ok(assess(gel, { month: 11, species: ['petit-gris'] }).reasons.some((r) => r.startsWith('Froid')));
});

test('prochaine saison', () => {
  assert.equal(nextSeason('morille', 11), 3);
  assert.equal(nextSeason('cepe', 8), 9);
  assert.equal(nextSeason('lactaire-sanguin', 12), 1);
  assert.equal(nextSeason('autre', 5), null);
});

test('type de forêt IGN → arbres', () => {
  assert.deepEqual(forestToTrees("Forêt fermée de pin d'Alep pur"), ['pin-alep']);
  assert.deepEqual(forestToTrees('Forêt fermée de chênes sempervirents purs'), ['chene-vert']);
  assert.deepEqual(forestToTrees('Forêt fermée de chênes décidus purs'), ['chene-blanc']);
  assert.deepEqual(forestToTrees('Forêt fermée de hêtre pur'), ['hetre']);
  assert.deepEqual(forestToTrees('Lande'), []);
  assert.deepEqual(forestToTrees(null), []);
});

test('grille PACA : villes dedans, mer et Languedoc dehors', () => {
  for (const [n, p] of [['Aix', [43.53, 5.45]], ['Digne', [44.09, 6.24]], ['Gap', [44.56, 6.08]], ['Nice', [43.70, 7.26]], ['Avignon', [43.95, 4.81]], ['Toulon', [43.13, 5.93]]]) assert.ok(inPolygon(p, PACA), n);
  for (const [n, p] of [['Nîmes', [43.84, 4.36]], ['mer', [42.9, 6.0]], ['Turin', [45.07, 7.68]], ['Valence', [44.93, 4.89]]]) assert.ok(!inPolygon(p, PACA), n);
  const g = pacaGrid();
  assert.ok(g.length > 60 && g.length < 250, String(g.length));
});

test('guide : une fiche par espèce du calendrier', () => {
  for (const s of SPECIES) if (s.id !== 'autre') assert.ok(GUIDE[s.id]?.habitat && GUIDE[s.id]?.lookalikes, s.id);
  assert.equal(rainColor(0), '#d9d4c7');
  assert.equal(rainColor(60), '#0b3d7a');
});

test('pluie annoncée signalée', () => {
  const w = summarizeWeather(real, '2026-11-05');
  w.rainNext = 30;
  assert.ok(assess(w, { month: 11, species: ['cepe'] }).reasons.some((r) => r.startsWith('Pluie annoncée')));
});

test('pluie d\'hier sur sol sec : « trop tôt », jamais « favorable »', () => {
  const d = { time: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'],
    precipitation_sum: [0, 0, 0, 0, 0, 0, 0, 0, 0, 24, 0], temperature_2m_max: Array(11).fill(17), temperature_2m_min: Array(11).fill(9) };
  const w = summarizeWeather(d, '2026-11-05');
  const a = assess(w, { month: 11, species: ['lactaire-sanguin'], trees: ['pin-alep'], history: [{ found_on: '2025-11-02', species: ['lactaire-sanguin'] }] });
  assert.equal(a.level, 'moyen');
  assert.ok(a.reasons.some((r) => r.startsWith('Trop tôt')));
});

import { seasonOf, lateText } from '../site/js/logic.js';
test('fin de saison : cèpe en décembre seulement s\'il fait doux, sans gel, à basse altitude', () => {
  assert.equal(seasonOf('cepe', 10), 'peak'); assert.equal(seasonOf('cepe', 11), 'season');
  assert.equal(seasonOf('cepe', 12), 'late'); assert.equal(seasonOf('cepe', 2), 'off');
  assert.equal(lateText('cepe'), 'déc. si doux et sans gel');
  const doux = { rain10: 45, bigRainAgo: 8, bigRainMm: 30, frost7: 0, tmin7: 7, tmax7: 15, rainNext: 0 };
  const gel = { ...doux, frost7: 3, tmin7: -1 };
  const a = assess(doux, { month: 12, species: ['cepe'] });
  assert.equal(a.level, 'moyen');                                 // 3 + 2 + 1 − 1 (fin de saison) = 5 : jaune sur la carte
  assert.equal(assess(doux, { month: 12, species: ['cepe'], trees: ['chene-vert'] }).level, 'bon');   // coin aux bons arbres : vert possible
  assert.ok(a.perSpecies[0].reasons.includes('fin de saison : possible car doux et sans gel'));
  assert.equal(assess(gel, { month: 12, species: ['cepe'] }).level, 'hors-saison');
  assert.equal(assess(doux, { month: 12, species: ['cepe'], alt: 900 }).level, 'hors-saison');   // trop haut
  assert.equal(assess(null, { month: 12, species: ['cepe'] }).level, 'hors-saison');           // météo inconnue : prudence
  // en saison normale, pas de malus
  assert.ok(!assess(doux, { month: 11, species: ['cepe'] }).perSpecies[0].reasons.some((r) => r.startsWith('fin de saison')));
});

import { SOIL_T } from '../site/js/advisor.js';
function wx(days, f) {   // jours relatifs à aujourd'hui (2026-11-05) → daily Open-Meteo
  const time = [], rr = [], tx = [], tn = [], st = [], sm = [];
  for (let i = -14; i <= 2; i++) { const d = new Date(Date.UTC(2026, 10, 5 + i)).toISOString().slice(0, 10); const v = f(i); time.push(d); rr.push(v.rr ?? 0); tx.push(v.tx ?? 16); tn.push(v.tn ?? 7); st.push(v.st ?? null); sm.push(v.sm ?? null); }
  return summarizeWeather({ time, precipitation_sum: rr, temperature_2m_max: tx, temperature_2m_min: tn, soil_temperature_0_to_7cm_mean: st, soil_moisture_0_to_7cm_mean: sm }, '2026-11-05');
}
test('sol : température idéale par espèce, humidité, fin des chaleurs', () => {
  assert.deepEqual(SOIL_T.cepe, [12, 18]);
  const w = wx(0, (i) => ({ rr: i === -8 ? 30 : 0, st: 14, sm: 0.36, tx: i < -6 ? 29 : 20 }));
  assert.equal(w.soilT3, 14); assert.equal(w.soilM3, 0.36);
  assert.ok(w.heatEndAgo >= 3 && w.heatEndAgo <= 21, String(w.heatEndAgo));
  const a = assess(w, { month: 10, species: ['cepe', 'chanterelle-grise'] });
  assert.ok(a.reasons.some((r) => r.startsWith('Sol bien humide')));
  assert.ok(a.reasons.some((r) => r.startsWith('Fin des chaleurs')));
  assert.ok(!assess(w, { month: 12, species: ['cepe', 'chanterelle-grise'] }).reasons.some((r) => r.startsWith('Fin des chaleurs')));
  const cepe = a.perSpecies.find((x) => x.id === 'cepe'), grise = a.perSpecies.find((x) => x.id === 'chanterelle-grise');
  assert.ok(cepe.reasons.some((r) => r.includes('idéal')));          // 14 °C dans 12–18
  assert.ok(grise.reasons.some((r) => r.includes('un peu chaud')));  // 14 °C au-dessus de 4–12
  assert.ok(cepe.score > grise.score);
  // sol froid : le cèpe chute, la chanterelle est dans sa plage
  const froid = assess(wx(0, (i) => ({ rr: i === -8 ? 30 : 0, st: 6, sm: 0.36 })), { month: 11, species: ['cepe', 'chanterelle-grise'] });
  assert.ok(froid.perSpecies.find((x) => x.id === 'cepe').reasons.includes('sol trop froid (6 °C)'));
  assert.equal(froid.perSpecies[0].id, 'chanterelle-grise');
  // sol sec selon le modèle, sans grosse pluie : rouge
  assert.equal(assess(wx(0, () => ({ rr: 1, st: 15, sm: 0.1 })), { month: 10, species: ['cepe'] }).level, 'faible');
});
test('exposition : nord par temps sec, sud quand il fait frais', () => {
  const sec = wx(0, (i) => ({ rr: i === -8 ? 16 : 0, st: 15, sm: 0.18 }));
  const n = assess(sec, { month: 10, species: ['cepe'], exposure: 'N' }).perSpecies[0];
  const s = assess(sec, { month: 10, species: ['cepe'], exposure: 'S' }).perSpecies[0];
  assert.ok(n.reasons.includes('versant nord : garde l\'humidité') && n.score === s.score + 2);
  const frais = wx(0, (i) => ({ rr: i === -8 ? 30 : 0, st: 10, sm: 0.36 }));
  const sud = assess(frais, { month: 11, species: ['cepe'], exposure: 'SO' }).perSpecies[0];
  assert.ok(sud.reasons.includes('versant sud : plus chaud'));
  assert.equal(assess(frais, { month: 11, species: ['cepe'], exposure: 'plat' }).perSpecies[0].reasons.some((r) => r.startsWith('versant')), false);
});

import { lastEmptyVisit } from '../site/js/advisor.js';
test('« Passé, rien trouvé » : avis plus prudent quelques jours, puis plus rien', () => {
  const w = { rain10: 30, bigRainAgo: 7, bigRainMm: 25, frost7: 0, tmin7: 9, tmax7: 18, soilT3: null, soilM3: null };
  const base = assess(w, { month: 10, species: ['cepe'], today: '2026-10-20' });
  const at = (d) => assess(w, { month: 10, species: ['cepe'], today: '2026-10-20', history: [{ spot_id: 's', found_on: d, species: [], empty: true }] });
  assert.equal(at('2026-10-19').score, base.score - 2);
  assert.ok(at('2026-10-19').reasons.includes('Passé il y a 1 j sans rien trouver'));
  assert.equal(at('2026-10-20').reasons.includes('Passé aujourd\'hui sans rien trouver'), true);
  assert.equal(at('2026-10-15').score, base.score - 1);
  assert.equal(at('2026-10-10').score, base.score);
  // une vraie trouvaille après la sortie bredouille l'annule
  assert.equal(lastEmptyVisit([{ found_on: '2026-10-18', empty: true }, { found_on: '2026-10-19', species: ['cepe'] }], '2026-10-20'), null);
  assert.equal(lastEmptyVisit([{ found_on: '2026-10-18', empty: true }], null), null);
});

import { soilRank, burnedAt, DELAY } from '../site/js/advisor.js';
function wx31(f, today = '2026-11-05') {   // 31 jours passés + 3 de prévision
  const time = [], rr = [], tx = [], tn = [], st = [], sm = [];
  for (let i = -31; i <= 2; i++) { const d = new Date(Date.parse(today) + i * 86400000).toISOString().slice(0, 10); const v = f(i); time.push(d); rr.push(v.rr ?? 0); tx.push(v.tx ?? 16); tn.push(v.tn ?? 7); st.push(v.st ?? null); sm.push(v.sm ?? null); }
  return summarizeWeather({ time, precipitation_sum: rr, temperature_2m_max: tx, temperature_2m_min: tn, soil_temperature_0_to_7cm_mean: st, soil_moisture_0_to_7cm_mean: sm }, today);
}
test('délai par espèce : le cèpe profite d\'une pluie de 20 j, la girolle non', () => {
  assert.deepEqual(DELAY.cepe, [7, 25]);
  const w = wx31((i) => ({ rr: i === -20 ? 40 : 0 }));
  assert.deepEqual(w.bigRains, [{ ago: 20, mm: 40 }]);
  const a = assess(w, { month: 10, species: ['cepe', 'girolle'] });
  const c = a.perSpecies.find((x) => x.id === 'cepe'), g = a.perSpecies.find((x) => x.id === 'girolle');
  assert.ok(c.reasons.some((r) => r.includes('dans sa fenêtre de pousse (7–25 j)')));
  assert.ok(!g.reasons.some((r) => r.includes('fenêtre')));
  // pluie de 5 jours : bonne pour la girolle, trop tôt pour le cèpe
  const b = assess(wx31((i) => ({ rr: i === -5 ? 30 : 0 })), { month: 10, species: ['cepe', 'girolle'] });
  assert.ok(b.perSpecies.find((x) => x.id === 'girolle').reasons.some((r) => r.includes('fenêtre')));
  assert.ok(b.perSpecies.find((x) => x.id === 'cepe').reasons.includes('grosse pluie il y a 5 j : il sort plutôt 7 à 25 j après'));
});
test('pluie extrême : pas de bonus en plus au-delà de 100 mm en 2 jours', () => {
  const fort = assess(wx31((i) => ({ rr: i === -7 ? 90 : 0 })), { month: 10, species: ['girolle'] });   // 90 mm : réserve ≥ 80 aussi
  const extreme = assess(wx31((i) => ({ rr: i === -7 || i === -6 ? 70 : 0 })), { month: 10, species: ['girolle'] });
  assert.ok(extreme.reasons[0].startsWith('Pluie extrême : 140 mm en 2 jours'));
  assert.equal(extreme.perSpecies[0].score, fort.perSpecies[0].score - 1);
});
test('humidité du sol comparée à celle du coin ; pas de bonus en novembre–janvier', () => {
  const clim = { 10: [0.2, 0.22, 0.24, 0.26, 0.28, 0.3, 0.32, 0.34, 0.36], 12: [0.3, 0.31, 0.32, 0.33, 0.34, 0.35, 0.36, 0.37, 0.38] };
  assert.equal(soilRank(clim, 10, 0.35), 0.8); assert.equal(soilRank(clim, 10, 0.19), 0); assert.equal(soilRank(null, 10, 0.3), null);
  const w = wx31(() => ({ sm: 0.35, st: 14 }));
  const oct = assess(w, { month: 10, species: ['cepe'], soilClim: clim });
  assert.ok(oct.reasons.includes('Sol plus humide que 80 % des jours d\'octobre ici (35 %)'));
  const sans = assess(w, { month: 10, species: ['cepe'] });
  assert.equal(oct.perSpecies[0].score, sans.perSpecies[0].score);   // 0,35 ≥ 0,33 : bonus aussi sans climatologie
  const dec = assess(w, { month: 12, species: ['cepe'], soilClim: clim });   // 0,35 en décembre : comme d'habitude
  assert.ok(dec.reasons.includes('Sol humide comme d\'habitude en décembre ici (35 %)'));
  const decWet = assess(w, { month: 12, species: ['cepe'] });
  assert.ok(decWet.reasons.includes('Sol bien humide (35 %) (en fin de saison, ça compte peu)'));
  const sec = assess(w, { month: 10, species: ['cepe'], soilClim: { 10: Array(9).fill(0.4) } });
  assert.ok(sec.reasons.includes('Sol plus sec que d\'habitude en octobre ici (35 %)'));
});
test('morille : chaleur cumulée sur 20 j, zone brûlée', () => {
  const froid = wx31(() => ({ st: 6 }), '2026-04-10');
  const doux = wx31(() => ({ st: 12 }), '2026-04-10');
  assert.equal(froid.degreeDays20, 120); assert.equal(doux.degreeDays20, 240); assert.equal(doux.ddSource, 'sol');
  const air = wx31(() => ({ tn: 6, tx: 16 }), '2026-04-10');
  assert.equal(air.degreeDays20, 220); assert.equal(air.ddSource, 'air');
  const m = (w, extra = {}) => assess(w, { month: 4, species: ['morille'], today: '2026-04-10', ...extra }).perSpecies[0];
  assert.ok(m(doux).reasons.includes('chaleur cumulée du sol : 240 °C·j sur 20 j (les morilles sortent vers 230)'));
  assert.equal(m(doux).score - m(froid).score, 5);   // 2 pour la chaleur cumulée + 3 pour la température du sol (12 °C idéal, 6 °C trop froid)
  const fires = { fires: [{ date: '2025-08-12', ha: 300, bbox: [5, 43, 5.1, 43.1], rings: [[[5, 43], [5.1, 43], [5.1, 43.1], [5, 43.1], [5, 43]]] }] };
  const burned = burnedAt(fires, 43.05, 5.05);
  assert.equal(burned.label, 'feu de août 2025, 300 ha');
  assert.equal(burnedAt(fires, 43.2, 5.05), null);
  assert.equal(m(doux, { burned }).score - m(doux).score, 1);
  assert.ok(m(doux, { burned }).reasons.some((r) => r.startsWith('zone brûlée (feu de août 2025')));
});

test('humidité à 7–28 cm quand elle existe ; bilan pluie − évaporation sur 30 jours', () => {
  const time = [], rr = [], et = [], top = [], deep = [];
  for (let i = -31; i <= 2; i++) { time.push(new Date(Date.parse('2026-10-15') + i * 86400000).toISOString().slice(0, 10)); rr.push(i === -10 ? 60 : 0); et.push(2); top.push(0.2); deep.push(0.3); }
  const base = { time, precipitation_sum: rr, temperature_2m_max: time.map(() => 20), temperature_2m_min: time.map(() => 10), soil_temperature_0_to_7cm_mean: time.map(() => 14), soil_moisture_0_to_7cm_mean: top };
  const w = summarizeWeather({ ...base, soil_moisture_7_to_28cm_mean: deep, et0_fao_evapotranspiration: et }, '2026-10-15');
  assert.equal(w.soilM3, 0.3); assert.equal(w.soilTop3, 0.2); assert.equal(w.soilDepth, '7–28 cm');
  assert.equal(w.balance30, 0);   // 60 mm de pluie − 30 × 2 mm d'évaporation
  const a = assess(w, { month: 10, species: ['cepe'] });
  assert.ok(a.reasons.some((r) => r.startsWith('Bonne réserve d\'eau : pluie − évaporation = +0 mm')));
  const sec = summarizeWeather({ ...base, precipitation_sum: rr.map(() => 0), et0_fao_evapotranspiration: et.map(() => 3) }, '2026-10-15');
  assert.equal(sec.soilDepth, '0–7 cm'); assert.equal(sec.balance30, -90);
  // sans évaporation connue : l'ancienne règle de la pluie seule
  assert.equal(summarizeWeather(base, '2026-10-15').balance30, null);
});
test('sol en déficit : jamais « bon »', () => {
  const w = { rain10: 45, bigRainAgo: 8, bigRainMm: 40, frost7: 0, tmin7: 8, tmax7: 18, rainNext: 0, rain30: 45, balance30: -70, soilM3: 0.36, soilT3: 14 };
  const a = assess(w, { month: 10, species: ['cepe'], trees: ['chataignier'] });
  assert.equal(a.level, 'moyen');
  assert.ok(a.reasons.some((r) => r.startsWith('Sol en déficit : pluie − évaporation = -70 mm')));
});
test('indice d\'humidité des sols Météo-France : un seul point de réserve, plafond si sol profond sec', () => {
  const w = { rain10: 25, bigRainAgo: 8, bigRainMm: 20, frost7: 0, tmin7: 8, tmax7: 18, rainNext: 0, rain30: 50, balance30: -20, soilM3: 0.3, soilT3: 14 };
  const sans = assess(w, { month: 10, species: ['cepe'] }).perSpecies[0].score;
  const humide = assess(w, { month: 10, species: ['cepe'], swi: { swi: 0.8, normal: 0.5 } });
  assert.equal(humide.perSpecies[0].score, sans + 1);
  assert.ok(humide.reasons.includes('Bonne réserve d\'eau : réserve profonde du sol (Météo-France) : 80 %, normale 50 %'));
  const deux = assess({ ...w, balance30: 10 }, { month: 10, species: ['cepe'], swi: { swi: 0.8, normal: 0.5 } });
  assert.equal(deux.perSpecies[0].score, sans + 1);   // bilan positif ET indice humide : toujours +1
  const sec = assess({ ...w, rain10: 45, balance30: 0 }, { month: 10, species: ['cepe'], trees: ['chataignier'], swi: { swi: 0.2, normal: 0.5 } });
  assert.equal(sec.level, 'moyen');
  assert.ok(sec.reasons.some((r) => r.startsWith('Sol profond encore sec : réserve à 20 %')));
});

import { RAIN_BONUS } from '../site/js/advisor.js';
test('fenêtres de pousse calées sur les observations : trompette et lactaires jusqu\'à 25 j, pied-de-mouton +1', () => {
  assert.deepEqual(DELAY.trompette, [5, 25]); assert.deepEqual(DELAY['lactaire-sanguin'], [5, 25]); assert.equal(RAIN_BONUS['pied-de-mouton'], 1);
  const w = wx31((i) => ({ rr: i === -22 ? 40 : 0 }));
  const a = assess(w, { month: 11, species: ['trompette', 'girolle'] });
  assert.ok(a.perSpecies.find((x) => x.id === 'trompette').reasons.some((r) => r.includes('(5–25 j)')));
  assert.ok(!a.perSpecies.find((x) => x.id === 'girolle').reasons.some((r) => r.includes('fenêtre')));
  const b = assess(wx31((i) => ({ rr: i === -8 ? 40 : 0 })), { month: 11, species: ['pied-de-mouton', 'girolle'] });
  const pm = b.perSpecies.find((x) => x.id === 'pied-de-mouton'), gi = b.perSpecies.find((x) => x.id === 'girolle');
  assert.ok(pm.reasons.some((r) => r.includes('fenêtre')) && gi.reasons.some((r) => r.includes('fenêtre')));
});
