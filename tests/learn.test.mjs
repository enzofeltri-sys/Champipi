import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyRange, findConditions, spotProfile, personalAdvice, profileSummary } from '../site/js/learn.js';
import { summarizeWeather, assess } from '../site/js/advisor.js';

// Météo fictive de l'automne 2025 : grosses pluies le 1er oct., le 20 oct. et le 9 nov.
const days = []; for (let d = new Date('2025-09-15T12:00:00Z'); d <= new Date('2025-11-30T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
const rainOn = { '2025-10-01': 30, '2025-10-20': 25, '2025-11-09': 40, '2025-10-02': 5 };
const daily = { time: days, precipitation_sum: days.map((d) => rainOn[d] ?? 0), temperature_2m_max: days.map(() => 18), temperature_2m_min: days.map(() => 8) };
const finds = [
  { found_on: '2025-10-10', species: ['cepe'] },          // 9 j après le 1er oct.
  { found_on: '2025-10-28', species: ['cepe', 'girolle'] }, // 8 j après le 20 oct.
  { found_on: '2025-11-20', species: ['cepe'] },          // 11 j après le 9 nov.
];

test('période d\'historique à demander', () => {
  assert.deepEqual(historyRange(finds), { start: '2025-09-25', end: '2025-11-20' });
  assert.equal(historyRange([]), null);
});

test('conditions avant chaque trouvaille', () => {
  const c = findConditions(finds, daily);
  assert.equal(c.length, 3);
  assert.deepEqual(c.map((x) => x.w.bigRainAgo), [9, 8, 11]);
  assert.deepEqual(c.map((x) => x.w.rain14), [35, 25, 40]);
  assert.equal(c[2].w.rain10, 0);   // la pluie du 9 nov. sort de la fenêtre de 10 j : d'où les 14 j
});

test('profil appris du coin', () => {
  const p = spotProfile(finds, findConditions(finds, daily));
  assert.equal(p.learned, true);
  assert.equal(p.bestMonth, 10);
  assert.equal(p.months[9], 2);
  assert.deepEqual(p.years, { 2025: 3 });
  assert.equal(p.topSpecies[0].id, 'cepe');
  assert.equal(p.rain14Min, 25);
  assert.equal(p.rain14Median, 35);
  assert.deepEqual([p.delayMin, p.delayMax], [8, 11]);
  assert.match(profileSummary(p), /8 à 11 jours après une grosse pluie/);
});

test('pas assez de trouvailles : rien n\'est appris', () => {
  const p = spotProfile(finds.slice(0, 2), findConditions(finds.slice(0, 2), daily));
  assert.equal(p.learned, false);
  assert.match(profileSummary(p), /Encore 1 trouvaille pour apprendre/);
  assert.deepEqual(personalAdvice({ rain14: 50, bigRainAgo: 9 }, p), { bonus: 0, reasons: [] });
});

test('conseil personnel intégré à l\'évaluation', () => {
  const p = spotProfile(finds, findConditions(finds, daily));
  const now = summarizeWeather(daily, '2025-11-19');   // 10 j après la pluie du 9 nov.
  const adv = personalAdvice(now, p);
  assert.equal(adv.bonus, 3);
  const a = assess(now, { month: 11, species: ['cepe'], personal: adv });
  assert.ok(a.reasons.some((r) => r.startsWith('Ton expérience : bon délai')));
  const tooEarly = personalAdvice({ rain14: 40, bigRainAgo: 3 }, p);
  assert.ok(tooEarly.reasons.some((r) => r.startsWith('encore 5 j')));
  const dry = personalAdvice({ rain14: 5, bigRainAgo: null }, p);
  assert.equal(dry.bonus, -1);
});
