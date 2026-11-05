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
  assert.ok(a.reasons.some((r) => r.includes('bonne fenêtre')));
  assert.deepEqual(a.perSpecies[0].reasons, ['mois de pic', 'milieu typique']);
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
