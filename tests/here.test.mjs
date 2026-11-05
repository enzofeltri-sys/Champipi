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

test('sol contraire ou altitude hors plage : écarté', () => {
  const chataigniers = treesAt('Forêt fermée de châtaignier pur');
  const sil = whatGrows({ trees: chataigniers, soil: 'siliceux', alt: 400, month: 10 }).map((x) => x.id);
  assert.ok(sil.includes('girolle') && sil.includes('oronge') && sil.includes('cepe'));
  const calc = whatGrows({ trees: chataigniers, soil: 'calcaire', alt: 400, month: 10 }).map((x) => x.id);
  assert.ok(!calc.includes('girolle') && calc.includes('cepe'));
  const unk = whatGrows({ trees: chataigniers, soil: null, alt: 400, month: 10 }).find((x) => x.id === 'girolle');
  assert.equal(unk.why.find((w) => w.ok === null).text, 'préfère un sol siliceux (sol non déterminé ici)');
  const haut = whatGrows({ trees: chataigniers, soil: 'siliceux', alt: 2000, month: 10 }).map((x) => x.id);
  assert.ok(!haut.includes('oronge'));
});

test('mélange : « possible », après les « probable »', () => {
  const r = whatGrows({ trees: treesAt('Forêt fermée à mélange de conifères prépondérants et feuillus'), soil: null, alt: 600, month: 11 });
  assert.ok(r.length > 0 && r.every((x) => x.level === 'possible'));
  const r2 = whatGrows({ trees: new Map([['pin-alep', 2], ['hetre', 1]]), soil: null, alt: 600, month: 11 });
  const lv = r2.map((x) => x.level); assert.equal(lv.indexOf('possible') > lv.lastIndexOf('probable'), true);
});
