// Chercher des coins dans une zone : grands peuplements purs (IGN BD Forêt V2) des essences voulues, en forêt publique,
// faciles d'accès (route ou piste, sentier, pente), classés. C'est la méthode utilisée pour les suggestions de coins.
// Usage : node tools/chercher-coins.mjs <sud> <ouest> <nord> <est> [essences séparées par des virgules] [ha mini]
//   essences : chene-blanc, chene-vert, chene-liege, pin-alep, pin-sylvestre, pin-maritime, hetre, chataignier, meleze
//   ex. : node tools/chercher-coins.mjs 44.45 5.95 44.65 6.25 pin-sylvestre,chene-blanc 50
import { ringHa, waysAt, zonesAt, lidarAt, accessRating } from '../site/js/lieu.js';
import { forestToTrees } from '../site/js/advisor.js';

const [S, W, N, E] = process.argv.slice(2, 6).map(Number);
const want = (process.argv[6] ?? 'chene-blanc,chene-vert,pin-sylvestre,pin-alep,hetre,chataignier').split(',');
const minHa = Number(process.argv[7] ?? 50);
const WFS = 'https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const feats = [];
for (let start = 0; ; start += 1000) {
  const r = await fetch(`${WFS}&TYPENAMES=LANDCOVER.FORESTINVENTORY.V2:formation_vegetale&COUNT=1000&STARTINDEX=${start}&BBOX=${S},${W},${N},${E},urn:ogc:def:crs:EPSG::4326`);
  const f = (await r.json()).features; feats.push(...f);
  if (f.length < 1000) break;
}
const inRing = (ring, x, y) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const stands = [];
for (const f of feats) {
  const tfv = f.properties?.tfv ?? '';
  if (!/pur/.test(tfv)) continue;                                     // peuplements purs seulement : on sait quels arbres
  const trees = forestToTrees(tfv);
  if (!trees.some((t) => want.includes(t))) continue;
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  const ha = Math.round(polys.reduce((s, p) => s + ringHa(p[0]), 0));
  if (ha < minHa) continue;
  // Point d'entrée : sommet intérieur le plus central possible (sommets du contour décalés vers le centre).
  const ring = polys.reduce((a, p) => (ringHa(p[0]) > ringHa(a) ? p[0] : a), polys[0][0]);
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  let pt = [cy, cx];
  if (!inRing(ring, cx, cy)) {
    const cand = ring.map(([x, y]) => [y + (cy - y) * 0.15, x + (cx - x) * 0.15]).filter(([y, x]) => inRing(ring, x, y));
    if (!cand.length) continue;
    pt = cand.sort((a, b) => Math.hypot(a[0] - cy, a[1] - cx) - Math.hypot(b[0] - cy, b[1] - cx))[0];
  }
  stands.push({ tfv, trees, ha, lat: +pt[0].toFixed(4), lon: +pt[1].toFixed(4) });
}
stands.sort((a, b) => b.ha - a.ha);
console.error(`${feats.length} polygones, ${stands.length} peuplements retenus ; examen des 20 plus grands…`);
const out = [];
for (const s of stands.slice(0, 20)) {
  try {
    const [z, w, l] = await Promise.all([zonesAt(s.lat, s.lon), waysAt(s.lat, s.lon), lidarAt(s.lat, s.lon).catch(() => null)]);
    const isPublic = z.some((x) => x.kind === 'onf');
    const forest = z.find((x) => x.kind === 'onf')?.llib_frt ?? null;
    const acc = accessRating({ ...w, slope: l?.slope ?? null, ha: s.ha, isPublic });
    out.push({ ...s, isPublic, forest, access: acc.level, parts: acc.parts.join(' · ') });
  } catch (e) { console.error('  échec', s.lat, s.lon, String(e).slice(0, 60)); }
  await sleep(500);
}
const rank = { facile: 0, moyen: 1, difficile: 2 };
out.sort((a, b) => Number(b.isPublic) - Number(a.isPublic) || rank[a.access] - rank[b.access] || b.ha - a.ha);
for (const o of out) console.log(`${o.isPublic ? '✅' : '❌'} ${o.access.padEnd(9)} ${String(o.ha).padStart(4)} ha  ${o.lat}, ${o.lon}  ${o.tfv}${o.forest ? ` — ${o.forest}` : ''}\n      ${o.parts}`);
