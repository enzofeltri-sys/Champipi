import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accessStatus, massifAt, accessFor, inFireSeason, prettyName } from '../site/js/access.js';

const data = JSON.parse(readFileSync(new URL('../site/data/massifs-acces.json', import.meta.url)));

test('niveaux par département', () => {
  assert.equal(accessStatus(13, 2).state, 'ok');
  assert.equal(accessStatus(13, 3).state, 'closed');
  assert.equal(accessStatus(83, 3).state, 'warn');
  assert.match(accessStatus(83, 4).text, /ZAPEF/);
  assert.equal(accessStatus(84, 2).state, 'warn');
  assert.equal(accessStatus(84, 3).state, 'closed');
  assert.equal(accessStatus(6, 3, 2).state, 'closed');
  assert.equal(accessStatus(6, 3, 1).state, 'warn');
  assert.equal(accessStatus(4, 5, 1).state, 'closed');
  assert.equal(accessStatus(4, 1, 0).state, 'ok');
  assert.equal(accessStatus(13, 0), null);
});

test('massif officiel sous un point', () => {
  const sb = massifAt(43.315, 5.76, data);      // forêt relique de la Sainte-Baume (Plan-d'Aups, Var)
  assert.equal(sb?.dept, '83');
  const sv = massifAt(43.533, 5.585, data);     // Sainte-Victoire
  assert.equal(sv?.dept, '13');
  assert.equal(massifAt(43.3398, 5.547, data)?.name, 'Garlaban');
  const maures = massifAt(43.24, 6.31, data);   // Collobrières
  assert.equal(maures?.dept, '83');
  const lub = massifAt(43.80, 5.31, data);      // Luberon (Bonnieux)
  assert.equal(lub?.dept, '84');
  assert.equal(massifAt(43.2965, 5.3698, data), null);   // Vieux-Port de Marseille
  assert.equal(massifAt(48.85, 2.35, data), null);       // Paris
});

test('texte d\'accès : saison, hors saison, carte non publiée', () => {
  const m = { dept: '13', id: '1322', name: 'Sainte-Baume' };
  assert.equal(accessFor(m, { depts: { 13: { 1322: [3, 0] } } }, 8).state, 'closed');
  assert.equal(accessFor(m, { depts: { 13: { 1322: [1, 0] } } }, 8).text, 'Accès autorisé');
  assert.match(accessFor(m, { depts: { 13: null } }, 11).text, /Hors période/);
  assert.match(accessFor(m, { depts: { 13: null } }, 7).text, /non publiée/);
  assert.match(accessFor(null, null, 7).text, /Hors des massifs/);
  assert.ok(inFireSeason(6) && inFireSeason(9) && !inFireSeason(10));
});

test('noms de massifs lisibles', () => {
  assert.equal(prettyName('SAINTE BAUME'), 'Sainte Baume');
  assert.equal(prettyName('CORNICHE DES MAURES'), 'Corniche des Maures');
  assert.equal(prettyName('Massif du petit Luberon'), 'Massif du petit Luberon');
  assert.equal(prettyName('MOYEN PAYS OUEST'), 'Moyen Pays Ouest');
});
