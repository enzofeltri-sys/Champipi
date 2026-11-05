// Test de structure contre la VRAIE API Supabase : chaque requête « select » de l'appli est envoyée
// avec la clé publique (sans session). Réponse attendue : refus de droits (42501) ou liste vide.
// Toute autre erreur (lien ambigu PGRST201, colonne inconnue 42703, table inconnue…) est un bug.
// Usage : node tools/api-smoke.mjs
import { readFileSync } from 'node:fs';
import { SUPABASE_URL, SUPABASE_KEY } from '../site/js/config.js';

const src = ['site/js/app.js', 'site/js/photos.js'].map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n');
const re = /from\('([a-z_]+)'\)\s*\.select\('([^']*)'/g;
const queries = new Map();
for (const m of src.matchAll(re)) queries.set(`${m[1]}?${m[2]}`, [m[1], m[2]]);
let bad = 0;
for (const [table, select] of queries.values()) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1`, { headers: { apikey: SUPABASE_KEY } });
  const body = await r.json().catch(() => null);
  const code = Array.isArray(body) ? 'OK' : body?.code;
  const ok = code === 'OK' || code === '42501';
  if (!ok) bad++;
  console.log(ok ? '✔' : '✘', table.padEnd(26), (select || '*').slice(0, 70), ok ? '' : `→ ${code} ${body?.message ?? ''}`);
}
// Écritures : mêmes colonnes que l'appli. Sans session, la base doit refuser (42501) ; une colonne
// inconnue donnerait PGRST204. Rien n'est écrit : la clé publique seule n'a aucun droit d'écriture.
const U = '00000000-0000-0000-0000-000000000000';
const WRITES = {
  champi_spots: { id: U, name: 'x', visibility: 'private', species: [], note: null, lat: 43, lon: 5, trees: [], soil: null, exposure: null, access: null, altitude: null, forest_type: null },
  champi_finds: { id: U, spot_id: U, found_on: '2026-01-01', species: [], note: null, quantity: null, condition: null, weather: null },
  champi_photos: { spot_id: U, find_id: null, path: U + '/x.jpg' },
  champi_profiles: { display_name: 'x' },
  champi_access_requests: { display_name: 'x', message: null },
  champi_allowed_emails: { email: 'x@x.fr', label: null },
  champi_spot_shares: { spot_id: U, user_id: U },
  champi_push_subscriptions: { endpoint: 'https://x', p256dh: 'x', auth: 'x' },
};
for (const [table, row] of Object.entries(WRITES)) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) });
  const body = await r.json().catch(() => null);
  const ok = r.status === 401 || body?.code === '42501';
  if (!ok) bad++;
  console.log(ok ? '✔' : '✘', ('écriture ' + table).padEnd(36), ok ? '(refusée sans session, colonnes valides)' : `→ ${r.status} ${body?.code} ${body?.message ?? ''}`);
}
console.log(bad ? `\n${bad} requête(s) en erreur` : `\n${queries.size} lectures et ${Object.keys(WRITES).length} écritures valides`);
process.exit(bad ? 1 : 0);
