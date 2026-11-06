import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  inSeason, seasonText, parseCoords, sortSpots, filterSpots, spotSpecies, lastFinds,
  directionsUrl, escapeHtml, formatDate, SPECIES,
} from '../site/js/logic.js';

test('calendrier : chaque espèce demandée a ses mois', () => {
  const months = Object.fromEntries(SPECIES.map((s) => [s.id, s.months]));
  assert.deepEqual(months['lactaire-sanguin'], [9, 10, 11, 12, 1]);   // réglé sur iNaturalist PACA
  assert.deepEqual(months.cepe, [6, 7, 8, 9, 10, 11]);
  assert.deepEqual(months.girolle, [6, 8, 9, 10, 11, 12]);
  assert.deepEqual(months.berigoule, [3, 4, 5, 10, 11, 12]);
  assert.deepEqual(months.autre, []);
});

test('en saison : novembre, pic du lactaire', () => {
  const r = inSeason(['lactaire-sanguin', 'morille', 'autre'], 11);
  assert.deepEqual(r, [{ id: 'lactaire-sanguin', label: 'Lactaire sanguin', peak: true }]);
});

test('en saison : janvier pour le lactaire, pas en mars pour le cèpe', () => {
  assert.equal(inSeason(['lactaire-sanguin'], 1).length, 1);
  assert.equal(inSeason(['cepe'], 3).length, 0);
  assert.equal(inSeason(['cepe'], 10)[0].peak, true);
  assert.equal(inSeason(['cepe'], 9)[0].peak, false);
  assert.equal(inSeason(null, 5).length, 0);
});

test('texte des saisons, avec passage de l\'année', () => {
  assert.equal(seasonText('cepe'), 'juin–nov.');
  assert.equal(seasonText('lactaire-sanguin'), 'sept.–janv.');
  assert.equal(seasonText('girolle'), 'juin, août–déc.');
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

import { exifDate, searchSpots, toGpx, toCsv, fold } from '../site/js/logic.js';

test('date EXIF de la photo', () => {
  assert.equal(exifDate(buf('./date.jpg')), '2025-11-12');
  assert.equal(exifDate(buf('./nogps.jpg')), null);
  assert.equal(exifDate(new ArrayBuffer(4)), null);
});

test('recherche sans accents, sur nom, notes, espèces et journal', () => {
  const sp = [{ id: 'a', name: 'Pinède du Vallon', note: 'après la barrière', species: ['cepe'] }, { id: 'b', name: 'Clairière', note: null, species: [] }];
  const fi = [{ spot_id: 'b', note: 'Énorme récolte', species: ['morille'] }];
  assert.deepEqual(searchSpots(sp, fi, 'pinede').map((s) => s.id), ['a']);
  assert.deepEqual(searchSpots(sp, fi, 'CÈPE barriere').map((s) => s.id), ['a']);
  assert.deepEqual(searchSpots(sp, fi, 'enorme').map((s) => s.id), ['b']);
  assert.deepEqual(searchSpots(sp, fi, 'morille').map((s) => s.id), ['b']);
  assert.equal(searchSpots(sp, fi, '  ').length, 2);
  assert.equal(fold('Éé À'), 'ee a');
});

test('exports GPX et CSV', () => {
  const g = toGpx([{ name: 'Coin <1> & "2"', lat: 43.5, lon: 5.4, species: ['cepe'], note: 'Sous les chênes' }]);
  assert.match(g, /<wpt lat="43.5" lon="5.4">/);
  assert.match(g, /<name>Coin &lt;1&gt; &amp; &quot;2&quot;<\/name>/);
  assert.match(g, /<desc>Cèpe — Sous les chênes<\/desc>/);
  const c = toCsv([{ a: 'x;y', b: 'dit "oui"' }], [['A', (r) => r.a], ['B', (r) => r.b]]);
  assert.equal(c, '﻿A;B\r\n"x;y";"dit ""oui"""\r\n');
});

test('filtre Famille : inclut les coins partagés avec moi', () => {
  const sp = [{ id: 'p', owner: 'me', visibility: 'private' }, { id: 's', owner: 'tata', visibility: 'private', sharedWithMe: true }, { id: 'f', owner: 'tata', visibility: 'family' }];
  assert.deepEqual(filterSpots(sp, [], { scope: 'family', me: 'me' }).map((x) => x.id), ['s', 'f']);
  assert.deepEqual(filterSpots(sp, [], { scope: 'mine', me: 'me' }).map((x) => x.id), ['p']);
});

import { chipOrder, FAVORITES } from '../site/js/logic.js';
test('filtre : plusieurs espèces (l\'une ou l\'autre)', () => {
  assert.deepEqual(filterSpots(spots, finds, { species: ['morille', 'lactaire-sanguin'] }).map((s) => s.id), ['b', 'c']);
  assert.equal(filterSpots(spots, finds, { species: [] }).length, 4);
});
test('pastilles : cèpe, girolle, trompette, pied-de-mouton, chanterelle en premier', () => {
  const ids = chipOrder(4).map((s) => s.id);
  assert.deepEqual(ids.slice(0, 5), FAVORITES);
  assert.equal(ids[5], 'berigoule');            // ensuite, les espèces en saison (avril)
  assert.ok(!ids.includes('autre'));
});

import { searchHits } from '../site/js/logic.js';
test('recherche rapide : nom, espèce, note, trouvaille, personne — sans accents ni majuscules', () => {
  const spots = [
    { id: 'a', name: 'Pinède du Vallon', note: 'Parking après le pont', species: [] },
    { id: 'b', name: 'Châtaigneraie', note: '', species: ['girolle'], owner: 'm' },
    { id: 'c', name: 'Vallon des cèpes', species: [] },
  ];
  const finds = [{ spot_id: 'a', found_on: '2026-10-03', species: ['cepe'], note: 'sous le gros chêne' }];
  const names = (q) => searchHits(spots, finds, q, (s) => (s.owner === 'm' ? 'Mame' : 'moi')).map((h) => h.spot.name);
  assert.deepEqual(names('vallon'), ['Vallon des cèpes', 'Pinède du Vallon']);   // le nom qui commence par la recherche d'abord
  assert.deepEqual(names('CEPE'), ['Pinède du Vallon', 'Vallon des cèpes']);
  assert.deepEqual(names('chataigneraie'), ['Châtaigneraie']);
  assert.deepEqual(names('mame'), ['Châtaigneraie']);
  assert.deepEqual(names('gros chene'), ['Pinède du Vallon']);
  assert.deepEqual(names(''), []);
  const hit = searchHits(spots, finds, 'pont')[0];
  assert.equal(hit.why, 'note : Parking après le pont');
  assert.match(searchHits(spots, finds, 'gros')[0].why, /^trouvaille du 3 octobre 2026 : sous le gros chêne/);
});

test('onglet « Partagés » : famille, amis et partagés avec moi ; pas « Moi seul »', () => {
  const sp = [{ id: 'p', owner: 'me', visibility: 'private' }, { id: 'a', owner: 'x', visibility: 'friends' }, { id: 'f', owner: 'x', visibility: 'family' }, { id: 's', owner: 'x', visibility: 'private', sharedWithMe: true }];
  assert.deepEqual(filterSpots(sp, [], { scope: 'family', me: 'me' }).map((x) => x.id), ['a', 'f', 's']);
});
