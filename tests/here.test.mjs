import { test } from 'node:test';
import assert from 'node:assert/strict';
import { treesAt, soilKind, whatGrows } from '../site/js/here.js';

test('forêt IGN → arbres', () => {
  assert.equal(treesAt("Forêt fermée de pin d'Alep pur").get('pin-alep'), 2);
  assert.equal(treesAt('Forêt fermée de pin à crochets ou pin cembro pur').get('pin-autre'), 2);
  assert.equal(treesAt('Forêt fermée à mélange de feuillus').get('chene-blanc'), 1);
  const m = treesAt('Forêt fermée à mélange de conifères prépondérants et feuillus');
  assert.equal(m.get('pin-alep'), 1); assert.equal(m.get('hetre'), 1);
  assert.equal(treesAt('Formation herbacée').get('prairie'), 2);
  assert.equal(treesAt('').size, 0);
});

test('sol : calcaire, siliceux ou non déterminé', () => {
  assert.equal(soilKind({ nom_sol_dominant: 'RENDOSOL', nom_ucs: 'Relief de calcaire dur' }).kind, 'calcaire');
  assert.equal(soilKind({ nom_sol_dominant: 'RANKOSOL', nom_ucs: 'Massifs cristallins : Maures' }).kind, 'siliceux');
  assert.equal(soilKind({ nom_sol_dominant: 'BRUNISOL', nom_ucs: 'Vallons des Maures. Viticulture' }).kind, 'siliceux');
  assert.equal(soilKind({ nom_sol_dominant: 'LITHOSOL', nom_ucs: 'Gneiss, diorite et granite' }).kind, 'siliceux');
  assert.equal(soilKind({ nom_sol_dominant: 'FERSIALSOL', nom_ucs: 'Calcarénites et marnes sableuses' }).kind, 'calcaire');
  assert.equal(soilKind({ nom_sol_dominant: 'LITHOSOL', nom_ucs: 'Sols superficiels des pentes fortes des Alpilles' }).kind, null);
  assert.equal(soilKind({ nom_sol_dominant: 'X', nom_ucs: 'Massif d\u0092Allauch' }).text, 'Massif d’Allauch');
  assert.equal(soilKind({ nom_sol_dominant: 'LITHOSOL', nom_ucs: "Massif de l'Etoile, zone centrale dolimitique" }).kind, 'calcaire');
  assert.equal(soilKind(null).kind, null);
});

test('pinède d\'Alep calcaire en novembre : lactaire sanguin en tête', () => {
  const r = whatGrows({ trees: treesAt("Forêt fermée de pin d'Alep pur"), soil: 'calcaire', alt: 300, month: 11 });
  assert.equal(r[0].id, 'lactaire-sanguin');
  assert.equal(r[0].level, 'probable'); assert.equal(r[0].peak, true);
  assert.ok(r.some((x) => x.id === 'petit-gris'));
  assert.ok(!r.some((x) => x.id === 'girolle'));          // pas d'arbre de la girolle
  assert.ok(!r.some((x) => x.id === 'morille'));          // milieu non décrit par des arbres
});

test('sol contraire ou altitude hors plage : écarté (sol : seulement les espèces strictes)', () => {
  const chataigniers = treesAt('Forêt fermée de châtaignier pur');
  const sil = whatGrows({ trees: chataigniers, soil: 'siliceux', alt: 400, month: 10 });
  assert.ok(['girolle', 'oronge', 'cepe'].every((id) => sil.some((x) => x.id === id)));
  const calc = whatGrows({ trees: chataigniers, soil: 'calcaire', alt: 400, month: 10 });
  const gc = calc.find((x) => x.id === 'girolle'), gs = sil.find((x) => x.id === 'girolle');
  assert.ok(gc && calc.some((x) => x.id === 'cepe'));                     // girolle possible sur calcaire…
  assert.equal(gs.score - gc.score, 2);                                   // …mais moins (+1 acide, −1 calcaire)
  assert.ok(gc.why.some((w) => /moins fréquent/.test(w.text)));
  const pins = treesAt("Forêt fermée de pin d'Alep pur");
  assert.ok(!whatGrows({ trees: pins, soil: 'siliceux', alt: 200, month: 10 }).some((x) => x.id === 'lactaire-sanguin'));   // strict
  const unk = whatGrows({ trees: chataigniers, soil: null, alt: 400, month: 10 }).find((x) => x.id === 'girolle');
  assert.equal(unk.why.find((w) => w.ok === null).text, 'préfère un sol acide (sol non déterminé ici)');
  const haut = whatGrows({ trees: chataigniers, soil: 'siliceux', alt: 2000, month: 10 }).map((x) => x.id);
  assert.ok(!haut.includes('oronge'));
});

test('mélange : « possible », après les « probable »', () => {
  const r = whatGrows({ trees: treesAt('Forêt fermée à mélange de conifères prépondérants et feuillus'), soil: null, alt: 600, month: 11 });
  assert.ok(r.length > 0 && r.every((x) => x.level === 'possible'));
  const r2 = whatGrows({ trees: new Map([['pin-alep', 2], ['hetre', 1]]), soil: null, alt: 600, month: 11 });
  const lv = r2.map((x) => x.level); assert.equal(lv.indexOf('possible') > lv.lastIndexOf('probable'), true);
});

import { trophClass, trophSummary, soilGuess, trophText } from '../site/js/soil.js';
import { assess } from '../site/js/advisor.js';

test('relevés IFN : niveau trophique → acide / neutre / calcaire', () => {
  assert.equal(trophClass(2).label, 'très acide'); assert.equal(trophClass(2).kind, 'siliceux');
  assert.equal(trophClass(5).label, 'acide');
  assert.equal(trophClass(6.5).kind, 'neutre');
  assert.equal(trophClass(9).kind, 'calcaire');
});

test('relevés IFN : médiane des placettes proches, 3 km puis 6 km', () => {
  const at = (dKm, troph) => ({ lat: 43.27 + dKm / 111.2, lon: 6.35, troph });
  const maures = trophSummary([at(1.6, 3), at(2.1, 5), at(3.0 - 0.1, 3), at(4.1, 4), at(10, 9)], 43.27, 6.35);
  assert.equal(maures.n, 3); assert.equal(maures.median, 3); assert.equal(maures.kind, 'siliceux'); assert.equal(maures.radiusKm, 3);
  const far = trophSummary([at(1, 9), at(4, 10), at(5, 8), at(8, 2)], 43.27, 6.35);
  assert.equal(far.radiusKm, 6); assert.equal(far.n, 3); assert.equal(far.kind, 'calcaire');
  assert.equal(trophSummary([at(1, 9)], 43.27, 6.35), null);
  assert.match(trophText(maures), /acide · 3 relevés .* moins de 3 km/);
});

test('sol retenu : relevés de terrain d\'abord, carte des sols en secours', () => {
  assert.deepEqual(soilGuess({ kind: 'siliceux' }, 'calcaire'), { kind: 'siliceux', source: 'ifn' });
  assert.deepEqual(soilGuess({ kind: 'neutre' }, 'calcaire'), { kind: null, source: 'ifn' });
  assert.deepEqual(soilGuess(null, 'calcaire'), { kind: 'calcaire', source: 'carte' });
  assert.deepEqual(soilGuess(null, null), { kind: null, source: null });
});

test('sol dans « Ici ? » : bonus souple pour le cèpe sur sol acide, jamais de refus', () => {
  const trees = treesAt('Forêt fermée de châtaignier pur');
  const acid = whatGrows({ trees, soil: 'siliceux', alt: 400, month: 10 }).find((r) => r.id === 'cepe');
  const calc = whatGrows({ trees, soil: 'calcaire', alt: 400, month: 10 }).find((r) => r.id === 'cepe');
  assert.ok(acid && calc); assert.equal(acid.score, calc.score + 1);
});

test('conseiller : le sol compte (girolle acide +1, calcaire −1 sauf si déjà trouvée ici ; lactaire strict −2 ; cèpe acide +1)', () => {
  const w = { rain10: 30, bigRainAgo: 7, bigRainMm: 25, frost7: 0, tmin7: 9, tmax7: 18, soilT3: null, soilM3: null };
  const s = (id, soil) => assess(w, { month: 10, species: [id], soil }).perSpecies[0].score;
  assert.equal(s('girolle', 'siliceux') - s('girolle', null), 1);
  assert.equal(s('girolle', 'calcaire') - s('girolle', null), -1);
  assert.equal(s('lactaire-sanguin', 'siliceux') - s('lactaire-sanguin', null), -2);
  const found = assess(w, { month: 10, species: ['girolle'], soil: 'calcaire', history: [{ found_on: '2026-11-05', species: ['girolle'] }] }).perSpecies[0];
  const none = assess(w, { month: 10, species: ['girolle'], history: [{ found_on: '2026-11-05', species: ['girolle'] }] }).perSpecies[0];
  assert.equal(found.score, none.score); assert.ok(found.reasons.includes('sol calcaire, mais déjà trouvé ici'));
  assert.equal(s('cepe', 'siliceux') - s('cepe', null), 1);
  assert.equal(s('cepe', 'calcaire') - s('cepe', null), 0);
  assert.equal(s('cepe', 'mixte') - s('cepe', null), 0);
});
