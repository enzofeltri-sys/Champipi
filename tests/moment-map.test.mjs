import { test } from 'node:test';
import assert from 'node:assert/strict';
import { habitatTable, gridStep, cellsFor, cellKey, cellCodes, pixelCode, pxLat, pxLon } from '../site/js/moment-map.js';
import { assess, summarizeWeather } from '../site/js/advisor.js';

test('table des forêts : poids et espèces concernées', () => {
  const t = habitatTable(['cepe', 'lactaire-sanguin']);
  const alep = t.get(0xff1acd), chataignier = t.get(0x40ff26);
  assert.deepEqual(alep, { w: 2, mask: 0b10 });          // pin d'Alep : lactaire seulement
  assert.deepEqual(chataignier, { w: 2, mask: 0b01 });   // châtaignier : cèpe seulement
});

test('grille : au plus 100 points', () => {
  const small = { south: 43.2, north: 43.6, west: 5.4, east: 6.0 };
  assert.equal(gridStep(small), 0.1);
  const paca = { south: 43.0, north: 45.1, west: 4.6, east: 7.7 };
  assert.ok(gridStep(paca) >= 0.3 && cellsFor(paca, gridStep(paca)).length <= 100);
  const c = cellsFor(small, 0.1);
  assert.ok(c.every((x) => cellKey(x.lat, x.lon, 0.1) === x.key));
});

test('avis par case et par pixel', () => {
  const today = '2026-11-05'; const days = [];
  for (let i = -14; i <= 2; i++) { const d = new Date(Date.UTC(2026, 10, 5 + i)); days.push(d.toISOString().slice(0, 10)); }
  const wet = summarizeWeather({ time: days, precipitation_sum: days.map((_, i) => (i === 6 ? 25 : i === 9 ? 8 : 0)), temperature_2m_max: days.map(() => 16), temperature_2m_min: days.map(() => 7) }, today);
  const dry = summarizeWeather({ time: days, precipitation_sum: days.map(() => 0), temperature_2m_max: days.map(() => 16), temperature_2m_min: days.map(() => 7) }, today);
  assert.deepEqual(cellCodes(['lactaire-sanguin', 'morille'], 11, wet, assess), [3, 0]);   // bon / hors saison
  assert.deepEqual(cellCodes(['lactaire-sanguin'], 11, dry, assess), [1]);                // sec : pas le moment
  assert.deepEqual(cellCodes(['lactaire-sanguin'], 11, null, assess), [-1]);              // météo inconnue
  assert.equal(pixelCode(0b11, [1, 3]), 3);
  assert.equal(pixelCode(0b01, [1, 3]), 1);
});

test('coordonnées des pixels (Web Mercator)', () => {
  assert.ok(Math.abs(pxLon(256 * 2 ** 9 * (5.5 + 180) / 360, 9) - 5.5) < 1e-9);
  assert.ok(Math.abs(pxLat(256 * 2 ** 3 / 2, 3)) < 1e-9);
});
