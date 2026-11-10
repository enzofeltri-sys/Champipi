import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOREST_CLASSES, favorableColors, favorableLabels, speciesTrees, colorKeyMap } from '../site/js/forests.js';

const hex = (label) => FOREST_CLASSES.find((c) => c.label === label).hex;

test('29 couleurs relevées, toutes différentes', () => {
  assert.equal(FOREST_CLASSES.length, 29);
  assert.equal(new Set(FOREST_CLASSES.map((c) => c.hex)).size, 29);
});

test('cèpe : chênes, châtaigniers, hêtres, pins sylvestres ; pas le pin d\'Alep', () => {
  const m = favorableColors('cepe');
  assert.equal(m.get(hex('Châtaigniers')), 2);
  assert.equal(m.get(hex('Hêtres')), 2);
  assert.equal(m.get(hex('Chênes blancs')), 2);
  assert.equal(m.get(hex('Pin sylvestre')), 2);
  assert.equal(m.get(hex('Mélange de feuillus')), 1);
  assert.equal(m.has(hex("Pin d'Alep")), false);
  assert.equal(m.has(hex('Prairies, pelouses')), false);
  assert.equal(m.has(hex('Pin noir / laricio')), false);   // le cèpe n'est pas un champignon « des pinèdes »
  assert.equal(m.get(hex('Mélange de pins')), 1);
  assert.equal(speciesTrees('cepe').includes('pin-autre'), false);
});

test('lactaire sanguin : pinèdes, dont mélanges de pins et pins noirs', () => {
  const m = favorableColors('lactaire-sanguin');
  assert.equal(m.get(hex("Pin d'Alep")), 2);
  assert.equal(m.get(hex('Mélange de pins')), 2);
  assert.equal(m.get(hex('Pin noir / laricio')), 2);
  assert.equal(m.has(hex('Châtaigniers')), false);
  assert.ok(speciesTrees('lactaire-sanguin').includes('pin-autre'));
});

test('coulemelle : prairies (et landes, possible) ; morille : chênes verts et pins d\'Alep', () => {
  const m = favorableColors('coulemelle');
  assert.equal(m.get(hex('Prairies, pelouses')), 2);
  assert.equal(m.get(hex('Landes')), 1);
  assert.ok(favorableColors('morille').size > 0);
  assert.deepEqual(favorableLabels('trompette'), ['Chênes blancs', 'Châtaigniers', 'Hêtres']);
});

test('table de recoloriage', () => {
  const k = colorKeyMap(new Map([['#ff1acd', 2]]));
  assert.equal(k.get(0xff1acd), 2);
});
