import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  inSeason, seasonText, parseCoords, sortSpots, filterSpots, spotSpecies, lastFinds,
  directionsUrl, escapeHtml, formatDate, SPECIES,
} from '../site/js/logic.js';

test('calendrier : chaque espèce demandée a ses mois', () => {
  const months = Object.fromEntries(SPECIES.map((s) => [s.id, s.months]));
  assert.deepEqual(months['lactaire-sanguin'], [10, 11, 12, 1]);
  assert.deepEqual(months.cepe, [6, 7, 9, 10, 11]);
  assert.deepEqual(months.girolle, [6, 9, 10, 11]);
  assert.deepEqual(months.berigoule, [3, 4, 5, 10, 11, 12]);
  assert.deepEqual(months.autre, []);
});

test('en saison : novembre, pic du lactaire', () => {
  const r = inSeason(['lactaire-sanguin', 'morille', 'autre'], 11);
  assert.deepEqual(r, [{ id: 'lactaire-sanguin', label: 'Lactaire sanguin', peak: true }]);
});

test('en saison : janvier pour le lactaire, pas en août pour le cèpe', () => {
  assert.equal(inSeason(['lactaire-sanguin'], 1).length, 1);
  assert.equal(inSeason(['cepe'], 8).length, 0);
  assert.equal(inSeason(['cepe'], 10)[0].peak, true);
  assert.equal(inSeason(['cepe'], 9)[0].peak, false);
  assert.equal(inSeason(null, 5).length, 0);
});

test('texte des saisons, avec passage de l\'année', () => {
  assert.equal(seasonText('cepe'), 'juin–juil., sept.–nov.');
  assert.equal(seasonText('lactaire-sanguin'), 'oct.–janv.');
  assert.equal(seasonText('girolle'), 'juin, sept.–nov.');
  assert.equal(seasonText('autre'), '');
});

test('coordonnées : formats décimaux', () => {
  assert.deepEqual(parseCoords('43.5297, 5.4474'), { lat: 43.5297, lon: 5.4474 });
  assert.deepEqual(parseCoords(' 43.5297 5.4474 '), { lat: 43.5297, lon: 5.4474 });
  assert.deepEqual(parseCoords('43,5297 5,4474'), { lat: 43.5297, lon: 5.4474 });
  assert.deepEqual(parseCoords('43,5297; 5,4474'), { lat: 43.5297, lon: 5.4474 });
  assert.deepEqual(parseCoords('-33.9, 151.2'), { lat: -33.9, lon: 151.2 });
});

test('coordonnées : degrés minutes secondes', () => {
  const p = parseCoords(`43°31'47"N 5°26'51"E`);
  assert.ok(Math.abs(p.lat - 43.529722) < 1e-5 && Math.abs(p.lon - 5.4475) < 1e-5);
  const q = parseCoords(`N 43° 31.78' E 5° 26.85'`);
  assert.ok(Math.abs(q.lat - 43.529667) < 1e-5 && Math.abs(q.lon - 5.4475) < 1e-5);
  const r = parseCoords(`43°31′47″ N, 5°26′51″ E`);
  assert.ok(Math.abs(r.lat - 43.529722) < 1e-5);
  const w = parseCoords(`43°31'47"N 1°26'51"O`);
  assert.ok(w.lon < 0);
});

test('coordonnées : liens', () => {
  assert.deepEqual(parseCoords('https://www.google.com/maps/@43.5297,5.4474,15z'), { lat: 43.5297, lon: 5.4474 });
  assert.deepEqual(parseCoords('https://maps.google.com/?q=43.5297,5.4474'), { lat: 43.5297, lon: 5.4474 });
  assert.deepEqual(parseCoords('https://www.openstreetmap.org/#map=15/43.5297/5.4474'), { lat: 43.5297, lon: 5.4474 });
  assert.deepEqual(parseCoords('geo:43.5297,5.4474'), { lat: 43.5297, lon: 5.4474 });
});

test('coordonnées : rejets', () => {
  assert.equal(parseCoords(''), null);
  assert.equal(parseCoords('bonjour'), null);
  assert.equal(parseCoords('95, 5'), null);
  assert.equal(parseCoords('43.5'), null);
});

const spots = [
  { id: 'a', owner: 'me', visibility: 'private', species: ['cepe'], created_at: '2026-01-01' },
  { id: 'b', owner: 'tata', visibility: 'family', species: [], created_at: '2026-03-01' },
  { id: 'c', owner: 'me', visibility: 'family', species: ['morille'], created_at: '2026-02-01' },
  { id: 'd', owner: 'tata', visibility: 'family', species: [], created_at: '2026-05-01' },
];
const finds = [
  { spot_id: 'a', found_on: '2026-10-02', species: ['cepe'] },
  { spot_id: 'b', found_on: '2026-10-20', species: ['lactaire-sanguin'] },
  { spot_id: 'a', found_on: '2026-10-25', species: [] },
];

test('tri par dernière trouvaille, puis par date de création', () => {
  assert.deepEqual(sortSpots(spots, finds).map((s) => s.id), ['a', 'b', 'd', 'c']);
  assert.equal(lastFinds(finds).get('a'), '2026-10-25');
});

test('filtres Tout / Mes coins / Famille et espèce', () => {
  assert.equal(filterSpots(spots, finds, { scope: 'all', me: 'me' }).length, 4);
  assert.deepEqual(filterSpots(spots, finds, { scope: 'mine', me: 'me' }).map((s) => s.id), ['a', 'c']);
  assert.deepEqual(filterSpots(spots, finds, { scope: 'family', me: 'me' }).map((s) => s.id), ['b', 'c', 'd']);
  // l'espèce vient de la fiche OU des trouvailles
  assert.deepEqual(filterSpots(spots, finds, { species: 'lactaire-sanguin' }).map((s) => s.id), ['b']);
  assert.deepEqual(filterSpots(spots, finds, { scope: 'mine', me: 'me', species: 'morille' }).map((s) => s.id), ['c']);
});

test('espèces d\'un coin : fiche + trouvailles, ordre du calendrier', () => {
  assert.deepEqual(spotSpecies({ id: 'b', species: ['cepe'] }, finds), ['lactaire-sanguin', 'cepe']);
});

test('divers', () => {
  assert.equal(directionsUrl(43.5, 5.4), 'https://www.google.com/maps/dir/?api=1&destination=43.5,5.4');
  assert.equal(escapeHtml('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;');
  assert.equal(formatDate('2026-11-05'), '5 novembre 2026');
});

import { readFileSync } from 'node:fs';
import { exifGps, fitSize } from '../site/js/logic.js';
const buf = (f) => { const b = readFileSync(new URL(f, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

test('GPS d\'une photo JPEG', () => {
  const p = exifGps(buf('./gps.jpg'));
  assert.ok(Math.abs(p.lat - 43.529722) < 1e-5 && Math.abs(p.lon - 5.4475) < 1e-5, JSON.stringify(p));
  const q = exifGps(buf('./gps-sw.jpg'));
  assert.ok(q.lat < 0 && q.lon < 0);
  assert.equal(exifGps(buf('./nogps.jpg')), null);
  assert.equal(exifGps(new ArrayBuffer(10)), null);
});

test('réduction des photos', () => {
  assert.deepEqual(fitSize(4032, 3024, 1600), { w: 1600, h: 1200 });
  assert.deepEqual(fitSize(3024, 4032, 400), { w: 300, h: 400 });
  assert.deepEqual(fitSize(800, 600, 1600), { w: 800, h: 600 });
});
