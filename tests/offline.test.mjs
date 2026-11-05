import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lonToX, latToY, tilesFor, bestMaxZoom, isNetworkError, mergePending, sendOrder, PLAN_IGN } from '../site/js/offline.js';

test('tuiles : même numérotation que Leaflet / IGN', () => {
  // Valeurs calculées indépendamment (formule Web Mercator standard, en Python).
  assert.equal(lonToX(5.6, 12), 2111);
  assert.equal(latToY(43.42, 12), 1498);
  assert.match(PLAN_IGN(12, 2112, 1497), /TILEMATRIX=12&TILEROW=1497&TILECOL=2112/);
});

test('zone d\'un massif : nombre de tuiles et zoom maximal', () => {
  const sainteBaume = { west: 5.70, east: 5.85, south: 43.28, north: 43.36 };   // ~12 x 9 km
  const t = tilesFor(sainteBaume, 12, 15);
  assert.ok(t.length > 50 && t.length < 600, String(t.length));
  const z = bestMaxZoom(sainteBaume, 12, 17, 1500);
  assert.ok(z >= 15 && z <= 16, String(z));
  assert.ok(tilesFor(sainteBaume, 12, z).length <= 1500);
  assert.equal(bestMaxZoom({ west: 4.5, east: 7.7, south: 43, north: 45 }, 12, 17, 1500), 12);  // toute la région : trop grand
});

test('erreur réseau reconnue', () => {
  assert.ok(isNetworkError(new TypeError('Failed to fetch')));
  assert.ok(isNetworkError({ message: 'Load failed' }));
  assert.ok(!isNetworkError({ message: 'new row violates row-level security policy' }));
});

test('envois en attente fusionnés et ordonnés', () => {
  const items = [
    { qid: 2, kind: 'find', row: { id: 'f9', spot_id: 'sNew', found_on: '2026-11-05' }, files: [{}, {}] },
    { qid: 1, kind: 'spot', row: { id: 'sNew', name: 'Nouveau' } },
    { qid: 3, kind: 'find', row: { id: 'f1', spot_id: 'a' } },
  ];
  const m = mergePending({ spots: [{ id: 'a' }], finds: [{ id: 'f1' }] }, items);
  assert.deepEqual(m.spots.map((s) => [s.id, !!s.pending]), [['a', false], ['sNew', true]]);
  assert.deepEqual(m.finds.map((f) => [f.id, !!f.pending]), [['f9', true], ['f1', false]]);
  assert.equal(m.finds[0].pendingPhotos, 2);
  assert.deepEqual(sendOrder(items).map((i) => i.qid), [1, 2, 3]);
});
