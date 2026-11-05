// Pluie mesurée par Météo-France (API « Données climatologiques », données quotidiennes des stations).
// Appelée la nuit par le planificateur (en-tête x-champi-token) :
//   POST { action: 'run' } → relève au plus 12 stations pas encore à jour aujourd'hui (14 derniers jours),
//                            ou rafraîchit la liste des stations PACA si elle a plus de 7 jours.
// La clé (secret METEOFRANCE_API_KEY) ne quitte jamais le serveur.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const MF = 'https://public-api.meteofrance.fr/public/DPClim/v1';
const DEPTS = ['04', '05', '06', '13', '83', '84'];
const PER_RUN = 12;
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const today = () => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

let last = 0;
async function mf(path: string) {
  const wait = last + 1300 - Date.now(); if (wait > 0) await sleep(wait);   // ≤ 46 requêtes / minute
  last = Date.now();
  return fetch(`${MF}${path}`, { headers: { apikey: Deno.env.get('METEOFRANCE_API_KEY') ?? '', accept: '*/*' } });
}

async function refreshStations() {
  const rows: any[] = [];
  for (const d of DEPTS) {
    const r = await mf(`/liste-stations/quotidienne?id-departement=${d}&parametre=precipitation`);
    if (!r.ok) throw new Error(`liste ${d} : ${r.status}`);
    for (const s of await r.json()) if (s.posteOuvert) rows.push({ id: s.id, name: s.nom, lat: s.lat, lon: s.lon, alt: s.alt });
  }
  const { error } = await admin.from('champi_rain_stations').upsert(rows, { onConflict: 'id', ignoreDuplicates: false });
  if (error) throw error;
  await admin.from('champi_push_config').update({ rain_stations_on: today() }).eq('id', true);
  return rows.length;
}

/** Fichier CSV Météo-France → [{ day, rr }] (pluie RR en mm, virgule décimale ; vide = pas encore mesuré). */
export function parseDaily(csv: string) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const head = lines.shift()?.split(';') ?? [];
  const iD = head.indexOf('DATE'), iR = head.indexOf('RR');
  const out: { day: string; rr: number }[] = [];
  for (const l of lines) {
    const c = l.split(';'); const v = c[iR];
    if (!v) continue;
    const rr = Number(v.replace(',', '.'));
    if (Number.isFinite(rr) && rr >= 0) out.push({ day: `${c[iD].slice(0, 4)}-${c[iD].slice(4, 6)}-${c[iD].slice(6, 8)}`, rr });
  }
  return out;
}

async function fetchStation(id: string) {
  const end = new Date(); const start = new Date(Date.now() - 14 * 86400000);
  const iso = (x: Date) => x.toISOString().slice(0, 10) + 'T00:00:00Z';
  const r = await mf(`/commande-station/quotidienne?id-station=${id}&date-deb-periode=${iso(start)}&date-fin-periode=${iso(end)}`);
  if (r.status !== 202) return `commande ${r.status}`;
  const cmd = (await r.json())?.elaboreProduitAvecDemandeResponse?.return;
  for (let k = 0; k < 5; k++) {
    await sleep(k ? 2500 : 800);
    const f = await mf(`/commande/fichier?id-cmde=${cmd}`);
    if (f.status === 201 || f.status === 200) {
      const rows = parseDaily(await f.text()).map((x) => ({ station_id: id, ...x }));
      if (rows.length) { const { error } = await admin.from('champi_rain_daily').upsert(rows, { onConflict: 'station_id,day' }); if (error) throw error; }
      await admin.from('champi_rain_stations').update({ fetched_on: today() }).eq('id', id);
      return rows.length;
    }
    if (f.status !== 204) return `fichier ${f.status}`;
  }
  return 'fichier pas prêt';
}

async function run() {
  const { data: cfg } = await admin.from('champi_push_config').select('rain_stations_on').eq('id', true).single();
  const old = !cfg?.rain_stations_on || Date.parse(cfg.rain_stations_on) < Date.parse(today()) - 7 * 86400000;
  if (old) return { stations: await refreshStations() };
  const { data: todo, error } = await admin.from('champi_rain_stations').select('id')
    .or(`fetched_on.is.null,fetched_on.lt.${today()}`).order('fetched_on', { ascending: true, nullsFirst: true }).limit(PER_RUN);
  if (error) throw error;
  const res: Record<string, unknown> = {};
  for (const s of todo ?? []) {
    try { res[s.id] = await fetchStation(s.id); } catch (e) { res[s.id] = String(e).slice(0, 80); }
    // Échec (station muette, refus…) : on réessaiera demain, sans bloquer la file des autres stations.
    if (typeof res[s.id] === 'string') await admin.from('champi_rain_stations').update({ fetched_on: today() }).eq('id', s.id);
  }
  // Ménage : on ne garde que 40 jours.
  await admin.from('champi_rain_daily').delete().lt('day', new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10));
  const { count } = await admin.from('champi_rain_stations').select('id', { count: 'exact', head: true })
    .or(`fetched_on.is.null,fetched_on.lt.${today()}`);
  return { relevés: res, restant: count };
}

Deno.serve(async (req) => {
  try {
    const { data: cfg } = await admin.from('champi_push_config').select('cron_token').eq('id', true).single();
    if (req.headers.get('x-champi-token') !== cfg?.cron_token) return json({ error: 'jeton invalide' }, 401);
    const body = await req.json().catch(() => ({}));
    if (body.action === 'run') return json(await run());
    return json({ error: 'action inconnue' }, 400);
  } catch (err: any) {
    return json({ error: String(err?.message ?? err) }, 500);
  }
});
