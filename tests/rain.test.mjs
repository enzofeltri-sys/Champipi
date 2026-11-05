import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rainIndex, nearStations, rainAt, mergeRain, distKm, rainSource } from '../site/js/rain.js';

const stations = [{ id: 'aix', name: 'AIX EN PROVENCE', lat: 43.5295, lon: 5.4245 }, { id: 'nice', name: 'NICE', lat: 43.65, lon: 7.2 }, { id: 'ste', name: 'STE VICTOIRE', lat: 43.53, lon: 5.6 }];
const rows = [
  { station_id: 'aix', day: '2026-11-04', rr: 11.4 }, { station_id: 'ste', day: '2026-11-04', rr: 20 },
  { station_id: 'aix', day: '2026-11-03', rr: 2 }, { station_id: 'nice', day: '2026-11-04', rr: 15.3 },
];
const idx = rainIndex(stations, rows);

test('distance', () => { assert.ok(Math.abs(distKm(43.5295, 5.4245, 43.53, 5.6) - 14.1) < 0.5); });

test('stations proches et moyenne pondérée', () => {
  const near = nearStations(idx, 43.53, 5.43);
  assert.deepEqual(near.map((s) => s.id), ['aix', 'ste']);          // Nice trop loin
  const v = rainAt(idx, near, '2026-11-04');
  assert.ok(v >= 11.4 && v < 12, String(v));                         // presque Aix (à 0,5 km)
  assert.equal(rainAt(idx, near, '2026-11-03'), 2);
  assert.equal(rainAt(idx, near, '2026-10-01'), null);
});

test('fusion avec Open-Meteo : passé mesuré, aujourd\'hui et prévisions gardés', () => {
  const daily = { time: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'], precipitation_sum: [9, 9, 9, 9, 9], temperature_2m_max: [15, 15, 15, 15, 15], temperature_2m_min: [5, 5, 5, 5, 5] };
  const r = mergeRain(daily, 43.53, 5.43, idx, '2026-11-05');
  assert.deepEqual(r.daily.precipitation_sum.map((x) => Math.round(x)), [9, 2, 11, 9, 9]);
  assert.equal(r.measured, 2);
  assert.match(rainSource(r), /Météo-France \(AIX EN PROVENCE, 0 km \+ 1 station\)/);
  const loin = mergeRain(daily, 44.9, 6.6, idx, '2026-11-05');
  assert.equal(loin.measured, 0); assert.equal(loin.daily, daily);
  assert.equal(rainSource(loin), 'Pluie : Open-Meteo (modèle)');
});

test('Open-Meteo indisponible : pluie seule si assez de jours mesurés', () => {
  assert.equal(mergeRain(null, 43.53, 5.43, idx, '2026-11-05').daily, null);   // 2 jours seulement
  const many = [];
  for (let i = 1; i <= 14; i++) many.push({ station_id: 'aix', day: new Date(Date.parse('2026-11-05') - i * 86400000).toISOString().slice(0, 10), rr: i === 8 ? 25 : 0 });
  const r = mergeRain(null, 43.53, 5.43, rainIndex(stations, many), '2026-11-05');
  assert.equal(r.daily.time.length, 14); assert.equal(r.rainOnly, true);
  assert.equal(r.daily.precipitation_sum.reduce((a, b) => a + b, 0), 25);
});
