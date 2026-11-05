// Calendrier réel des espèces en PACA d'après GBIF (observations datées, iNaturalist et inventaires compris).
// Usage : node tools/gbif-phenology.mjs > site/data/phenology-paca.json
// Compte les observations par mois (facette « month ») dans le contour de la région, depuis 1990.
import { PACA } from '../site/js/advisor.js';

const NAMES = {
  'lactaire-sanguin': ['Lactarius sanguifluus', 'Lactarius vinosus'],
  'petit-gris': ['Tricholoma terreum'],
  cepe: ['Boletus edulis', 'Boletus aereus', 'Boletus reticulatus', 'Boletus pinophilus'],
  girolle: ['Cantharellus cibarius'],
  'pied-de-mouton': ['Hydnum repandum', 'Hydnum rufescens'],
  trompette: ['Craterellus cornucopioides'],
  oronge: ['Amanita caesarea'],
  coulemelle: ['Macrolepiota procera'],
  berigoule: ['Pleurotus eryngii'],
  morille: ['Morchella'],
  'saint-georges': ['Calocybe gambosa'],
  'chanterelle-grise': ['Craterellus tubaeformis'],
};
// WKT dans le sens inverse des aiguilles d'une montre (exigé par GBIF), en « lon lat ».
let ring = PACA.map(([la, lo]) => [lo, la]);
const area = ring.reduce((s, [x1, y1], i) => { const [x2, y2] = ring[(i + 1) % ring.length]; return s + (x1 * y2 - x2 * y1); }, 0);
if (area < 0) ring = ring.reverse();
const wkt = `POLYGON((${[...ring, ring[0]].map(([x, y]) => `${x} ${y}`).join(',')}))`;

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function get(u) {   // GBIF limite le rythme : pause entre les requêtes, nouvel essai si « 429 »
  for (const wait of [1500, 5000, 15000, 40000]) {
    await sleep(wait === 1500 ? 1500 : 0);
    const r = await fetch(u, { headers: { 'user-agent': 'carnet-champignons (usage familial)' } });
    if (r.ok) return r.json();
    if (r.status !== 429) throw new Error(`${r.status} ${u}`);
    await sleep(wait);
  }
  throw new Error(`429 persistant ${u}`);
}
const out = { source: 'GBIF.org (observations datées en Provence-Alpes-Côte d\'Azur, depuis 1990)', fetched: new Date().toISOString().slice(0, 10), species: {} };
for (const [id, names] of Object.entries(NAMES)) {
  const months = Array(12).fill(0); const used = [];
  for (const n of names) {
    const m = await get(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(n)}&kingdom=Fungi`);
    if (!m.usageKey || m.matchType === 'NONE') continue;
    const q = `https://api.gbif.org/v1/occurrence/search?taxonKey=${m.usageKey}&geometry=${encodeURIComponent(wkt)}&hasCoordinate=true&occurrenceStatus=PRESENT&year=1990,2026&limit=0&facet=month&facetLimit=12`;
    const r = await get(q);
    for (const c of r.facets?.[0]?.counts ?? []) months[Number(c.name) - 1] += c.count;
    used.push(`${m.canonicalName} (${r.count})`);
  }
  out.species[id] = { months, total: months.reduce((a, b) => a + b, 0), taxa: used };
}
console.log(JSON.stringify(out, null, 1));
