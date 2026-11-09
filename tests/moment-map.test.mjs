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

import { cellCodes as cc2, pixelCode as pc2, soilOfCell, BAD_SOIL } from '../site/js/moment-map.js';
import { assess as as2 } from '../site/js/advisor.js';
test('carte du moment : le sol de la case compte (girolle jamais coloriée sur calcaire)', () => {
  const grid = { cells: { '436:50': 8, '432:63': 3.5, '433:57': 6.5 } };
  assert.equal(soilOfCell(grid, 43.61, 5.06), 'calcaire');      // Grans
  assert.equal(soilOfCell(grid, 43.27, 6.35), 'siliceux');      // Maures
  assert.equal(soilOfCell(grid, 43.35, 5.75), null);            // neutre
  assert.equal(soilOfCell(grid, 44.9, 6.9), null);              // pas de relevés
  const w = { rain10: 30, bigRainAgo: 7, bigRainMm: 25, frost7: 0, tmin7: 9, tmax7: 18, soilT3: null, soilM3: null };
  const [gir, cep] = cc2(['girolle', 'cepe'], 11, w, as2, 'calcaire');
  assert.equal(gir, BAD_SOIL);
  assert.ok(cep > 0);                                            // le cèpe reste possible sur calcaire
  assert.ok(cc2(['girolle'], 11, w, as2, 'siliceux')[0] > 0);
  assert.equal(pc2(0b01, [BAD_SOIL, 3]), BAD_SOIL);              // pixel où seule la girolle est concernée
  assert.equal(pc2(0b11, [BAD_SOIL, 2]), 2);                     // forêt aussi bonne pour le cèpe : couleur du cèpe
});
