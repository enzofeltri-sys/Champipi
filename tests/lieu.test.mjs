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
