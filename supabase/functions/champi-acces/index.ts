// Relais vers les données publiques d'accès aux massifs forestiers des préfectures
// (risque-prevention-incendie.fr), qui ne sont pas lisibles directement depuis le navigateur.
// GET ?date=AAAAMMJJ (défaut : aujourd'hui, heure de Paris) → { date, depts: { "13": { "1322": [niveau, procédure] } | null } }
const DEPTS = ['4', '6', '13', '83', '84'];
const SOURCE = 'https://www.risque-prevention-incendie.fr/static';
const ORIGINS = ['https://enzofeltri-sys.github.io', 'http://localhost:5173'];

function cors(req: Request) {
  const o = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
}

function parisDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(d).replaceAll('-', '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  const url = new URL(req.url);
  let date = url.searchParams.get('date') ?? '';
  if (req.method === 'POST') { try { date = (await req.json())?.date ?? date; } catch { /* corps vide */ } }
  if (!/^\d{8}$/.test(date)) date = parisDate();

  const entries = await Promise.all(DEPTS.map(async (d) => {
    try {
      const r = await fetch(`${SOURCE}/${d}/import_data/${date}.json`, { headers: { 'user-agent': 'carnet-champignons (usage familial)' } });
      if (!r.ok) return [d, null];
      const j = await r.json();
      return [d, j?.massifs ?? null];
    } catch { return [d, null]; }
  }));

  return new Response(JSON.stringify({ date, source: 'risque-prevention-incendie.fr', depts: Object.fromEntries(entries) }), {
    headers: { ...cors(req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=1800' },
  });
});
