import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBil, terrainStats, terrainText, zonesText, oldForestText, windowBox, PX } from '../site/js/lieu.js';

test('LiDAR : lecture BIL, hauteur et couvert des arbres, creux, pente', () => {
  const buf = new ArrayBuffer(12); const v = new DataView(buf); v.setFloat32(0, 12.5, true); v.setFloat32(4, -99999, true); v.setFloat32(8, 0, true);
  assert.deepEqual(parseBil(buf), [12.5, null, 0]);
  const n = PX * PX, c = Math.floor(PX / 2);
  const mnh = Array.from({ length: n }, (_, i) => (i % 2 ? 18 : 1));                      // moitié d'arbres de 18 m
  const bowl = Array.from({ length: n }, (_, i) => { const r = Math.floor(i / PX), k = i % PX; return 300 + Math.hypot(r - c, k - c) * 0.5; });   // cuvette
  const t = terrainStats(mnh, bowl);
  assert.equal(t.canopy, 18); assert.equal(t.cover, Math.round((Math.floor(n / 2) / n) * 100)); assert.ok(t.tall >= 49);
  assert.ok(t.tpi < -1.5, String(t.tpi)); assert.equal(t.slope, 0);
  assert.ok(terrainText(t).some((s) => s.includes('creux')));
  const plan = Array.from({ length: n }, (_, i) => 100 + (i % PX) * 0.5);                  // pente régulière vers l'est
  const p = terrainStats(null, plan);
  assert.equal(p.canopy, null); assert.equal(p.slope, 6);   // 0,5 m pour ~4,8 m : ~6°
  assert.equal(terrainStats(null, null), null);
  const [s, w, n2, e] = windowBox(43.5, 5.5); assert.ok(Math.abs((n2 - s) * 111320 - 120) < 1 && e > w);
});

test('zones protégées : le plus contraignant d\'abord, forêt publique ou privée', () => {
  const z = zonesText([
    { kind: 'pnr', nom_site: 'Luberon', url_fiche: 'u1' },
    { kind: 'pn', nom_site: 'Mercantour', zone: 'Cœur', url_fiche: 'u2' },
    { kind: 'onf', llib_frt: 'Forêt domaniale de la Sainte-Baume' },
  ]);
  assert.equal(z[0].level, 'stop'); assert.ok(z[0].text.startsWith('Cœur du parc national Mercantour'));
  assert.ok(z.some((x) => x.text.startsWith('Forêt domaniale de la Sainte-Baume (ONF)')));
  assert.ok(zonesText([])[0].text.startsWith('Pas de forêt publique ici'));
  assert.ok(zonesText([{ kind: 'pn', nom_site: "Mercantour [Aire D'Adhésion]", zone: 'Adhesion' }])[0].text.startsWith("Aire d'adhésion du parc national Mercantour :"));
  assert.ok(oldForestText('foret ancienne').includes('Forêt ancienne'));
  assert.ok(oldForestText('foret recente').includes('Forêt récente'));
  assert.equal(oldForestText(null), null);
});

test('réserve géologique : les champignons ne sont pas visés', () => {
  const z = zonesText([{ kind: 'rnn', nom_site: 'Lubéron', p4_geologi: 'T' }, { kind: 'rnn', nom_site: 'Périmètre De Protection De La Réserve Naturelle Géologique De Luberon' }, { kind: 'rnn', nom_site: 'Sainte-Victoire' }]);
  assert.ok(z.some((x) => x.level === 'info' && x.text.startsWith('Réserve naturelle géologique (Lubéron)')));
  assert.ok(z.some((x) => x.level === 'info' && x.text.startsWith('Périmètre de protection d\'une réserve')));
  assert.ok(z.some((x) => x.level === 'stop' && x.text.startsWith('Réserve naturelle Sainte-Victoire')));
});

import { ringHa, standOf, distToLine, nearestWays, accessRating } from '../site/js/lieu.js';
test('peuplement : surface du polygone qui contient le point', () => {
  const sq = (x, y, d) => [[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]];
  assert.ok(Math.abs(ringHa(sq(6, 44.5, 0.01)) - 88) < 3);   // ~795 m × 1 107 m
  const fs = [{ properties: { tfv: 'petit' }, geometry: { type: 'Polygon', coordinates: [sq(6.02, 44.5, 0.001)] } },
    { properties: { tfv: 'grand' }, geometry: { type: 'Polygon', coordinates: [sq(6, 44.5, 0.01)] } }];
  assert.deepEqual(standOf(fs, 44.505, 6.005), { ha: 88, tfv: 'grand' });
  assert.equal(standOf(fs, 44.6, 6.1), null);
});
test('accès : route, sentier, pente, privé', () => {
  assert.ok(Math.abs(distToLine(44.5, 6, [[6.001, 44.49], [6.001, 44.51]]) - 79) < 2);
  const line = (lon) => ({ type: 'LineString', coordinates: [[lon, 44.49], [lon, 44.51]] });
  const w = nearestWays([
    { properties: { nature: 'Route à 1 chaussée', acces_vehicule_leger: 'Libre' }, geometry: line(6.003) },
    { properties: { nature: 'Route empierrée', acces_vehicule_leger: 'Restreint aux ayants droit' }, geometry: line(6.0005) },
    { properties: { nature: 'Sentier', acces_vehicule_leger: 'Physiquement impossible' }, geometry: line(6.001) },
  ], 44.5, 6);
  assert.equal(w.road.nature, 'Route à 1 chaussée'); assert.ok(w.road.m > 230 && w.road.m < 245);
  assert.equal(w.path.nature, 'Sentier');
  assert.equal(accessRating({ ...w, slope: 10, isPublic: true, ha: 100 }).level, 'facile');
  assert.equal(accessRating({ ...w, slope: 30, isPublic: true }).level, 'moyen');
  assert.equal(accessRating({ road: { m: 1500, nature: 'Route à 1 chaussée' } }).level, 'difficile');
  assert.equal(accessRating({}).level, 'difficile');
  const priv = accessRating({ ...w, slope: 10, isPublic: false, ha: 12 });
  assert.equal(priv.text, '🟢 Accès facile · petit bois · accord du propriétaire nécessaire');
  assert.ok(priv.parts.includes('peuplement de 12 ha') && priv.parts.includes('privé probable'));
});
