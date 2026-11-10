// Météo mesurée par Météo-France, appelée par le planificateur (en-tête x-champi-token) :
//   POST { action: 'run' }    → la nuit, API « Données climatologiques » : relève au plus 12 stations pas encore
//                               à jour aujourd'hui (14 derniers jours : pluie, mini, maxi ; données vérifiées),
//                               ou rafraîchit la liste des stations PACA si elle a plus de 7 jours.
//   POST { action: 'hourly' } → chaque heure, API « Package Observations » : cumul du jour en cours (pluie
//                               des heures passées, mini, maxi) pour toutes les stations des 6 départements.
//   POST { action: 'grid' }   → toutes les 6 h : météo de toute la région (grille de 0,1°) depuis Open-Meteo :
//                               modèles Météo-France (pluie, mini, maxi, prévisions) + sol (température et
//                               humidité, modèle par défaut). Les téléphones lisent la grille dans la base.
//   POST { action: 'probe' }  → diagnostic de la clé (jamais renvoyée).
// La clé (secret METEOFRANCE_API_KEY) ne quitte jamais le serveur.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const MF = 'https://public-api.meteofrance.fr/public/DPClim/v1';
const OBS = 'https://public-api.meteofrance.fr/public/DPPaquetObs/v2';
const parisDay = (ms: number) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(ms));
const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);
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

/** Fichier CSV Météo-France → [{ day, rr, tn, tx }] (mm et °C, virgule décimale ; vide = pas mesuré). */
export function parseDaily(csv: string) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const head = lines.shift()?.split(';') ?? [];
  const iD = head.indexOf('DATE'), iR = head.indexOf('RR'), iN = head.indexOf('TN'), iX = head.indexOf('TX');
  const num = (v?: string) => { if (!v) return null; const x = Number(v.replace(',', '.')); return Number.isFinite(x) ? x : null; };
  const out: { day: string; rr: number | null; tn: number | null; tx: number | null }[] = [];
  for (const l of lines) {
    const c = l.split(';');
    const rr = num(c[iR]), tn = num(c[iN]), tx = num(c[iX]);
    if (rr == null && tn == null && tx == null) continue;
    out.push({ day: `${c[iD].slice(0, 4)}-${c[iD].slice(4, 6)}-${c[iD].slice(6, 8)}`, rr: rr != null && rr >= 0 ? rr : null, tn, tx });
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
      const rows = parseDaily(await f.text()).map((x) => ({ station_id: id, ...x, hours: 24, src: 'clim' }));
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

// Chaque heure : observations des dernières 24 h (une requête par département), cumulées par jour (heure de Paris).
async function hourly() {
  const key = Deno.env.get('METEOFRANCE_API_KEY') ?? '';
  const H = { apikey: key, accept: '*/*' };
  const agg = new Map<string, any>();
  const seen = new Map<string, { lat: number; lon: number }>();
  const errors: Record<string, string> = {};
  for (const d of DEPTS) {
    const r = await fetch(`${OBS}/paquet/horaire?id-departement=${Number(d)}&format=json`, { headers: H });   // « 4 », pas « 04 »
    if (!r.ok) { errors[d] = String(r.status); continue; }
    for (const o of await r.json()) {
      const id = o.geo_id_insee; if (!id) continue;
      seen.set(id, { lat: o.lat, lon: o.lon });
      const day = parisDay(Date.parse(o.validity_time) - 60000);   // l'heure qui finit à minuit compte pour la veille
      const k = `${id}|${day}`;
      const a = agg.get(k) ?? { station_id: id, day, rr: null, tn: null, tx: null, hours: 0, src: 'obs' };
      a.hours++;
      if (o.rr1 != null && o.rr1 >= 0) a.rr = (a.rr ?? 0) + o.rr1;
      const tn = o.tn ?? o.t, tx = o.tx ?? o.t;
      if (tn != null) a.tn = Math.min(a.tn ?? Infinity, tn - 273.15);
      if (tx != null) a.tx = Math.max(a.tx ?? -Infinity, tx - 273.15);
      agg.set(k, a);
    }
  }
  // Nouvelles stations (inconnues de la climatologie) : nom et altitude depuis la liste des stations d'observation.
  const { data: known } = await admin.from('champi_rain_stations').select('id');
  const have = new Set((known ?? []).map((x: any) => x.id));
  const missing = [...seen.keys()].filter((id) => !have.has(id));
  if (missing.length) {
    const lr = await fetch(`${OBS}/liste-stations`, { headers: H });
    const info = new Map<string, any>();
    if (lr.ok) for (const l of (await lr.text()).split(/\r?\n/).slice(1)) { const c = l.split(';'); if (c[0]) info.set(c[0], { name: c[2], alt: Number(c[5]) || null }); }
    const rows = missing.map((id) => ({ id, name: info.get(id)?.name || id, lat: seen.get(id)!.lat, lon: seen.get(id)!.lon, alt: info.get(id)?.alt ?? null }));
    const { error } = await admin.from('champi_rain_stations').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
  }
  // On n'écrase jamais une journée déjà vérifiée par la climatologie.
  const days = [...new Set([...agg.values()].map((a) => a.day))];
  const { data: clim } = await admin.from('champi_rain_daily').select('station_id, day').eq('src', 'clim').in('day', days);
  const done = new Set((clim ?? []).map((c: any) => `${c.station_id}|${c.day}`));
  const rows = [...agg.entries()].filter(([k]) => !done.has(k)).map(([, a]) => ({ ...a, rr: r1(a.rr), tn: r1(a.tn), tx: r1(a.tx) }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from('champi_rain_daily').upsert(rows.slice(i, i + 500), { onConflict: 'station_id,day' });
    if (error) throw error;
  }
  return { stations: seen.size, nouvelles: missing.length, lignes: rows.length, erreurs: errors };
}

// ---------------------------------------------------------------------------
// Grille météo de la région (0,1°), lue par les téléphones : un seul relevé Open-Meteo pour toute la famille.
const PACA = [
  [44.17, 4.65], [44.33, 4.80], [44.45, 5.00], [44.40, 5.42], [44.50, 5.65], [44.80, 5.60], [44.90, 5.95],
  [45.12, 6.25], [44.98, 6.75], [44.70, 7.05], [44.35, 6.95], [44.10, 7.70], [43.78, 7.53], [43.55, 7.05],
  [43.40, 6.75], [43.10, 6.40], [43.05, 6.00], [43.15, 5.55], [43.22, 5.30], [43.38, 4.85], [43.40, 4.55],
  [43.70, 4.62], [43.95, 4.70],
];
function inPolygon([lat, lon]: number[], poly: number[][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function gridCells() {
  const out: { key: string; lat: number; lon: number }[] = [];
  for (let i = 430; i < 452; i++) for (let j = 45; j < 78; j++) {
    const c = [(i + 0.5) / 10, (j + 0.5) / 10];
    const corners = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]].map(([a, b]) => [a / 10, b / 10]);
    if (inPolygon(c, PACA) || corners.some((k) => inPolygon(k, PACA))) out.push({ key: `${i}:${j}`, lat: +c[0].toFixed(2), lon: +c[1].toFixed(2) });
  }
  return out;
}
async function om(points: { lat: number; lon: number }[], vars: string, model: string | null, past = 14) {
  const q = `https://api.open-meteo.com/v1/forecast?latitude=${points.map((p) => p.lat).join(',')}&longitude=${points.map((p) => p.lon).join(',')}&daily=${vars}&past_days=${past}&forecast_days=3&timezone=Europe%2FParis${model ? `&models=${model}` : ''}`;
  const r = await fetch(q);
  if (!r.ok) throw new Error(`Open-Meteo ${r.status} ${(await r.text()).slice(0, 120)}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [j];
}
// Open-Meteo limite aussi le nombre d'appels par minute (et compte plus cher au-delà de 14 jours) : chaque passage
// traite au plus 120 cases (les plus anciennes), en lots de 60 ; le planificateur fait 4 passages espacés de 2 minutes.
// Pluie et températures : 31 jours passés (réserve d'eau du mois) ; sol : 14 jours (21 de mars à juin, pour la chaleur
// cumulée des morilles), complétés au début par des vides pour rester alignés sur les dates.
const MAIN_PAST = 31;
const soilPast = () => ([3, 4, 5, 6].includes(Number(today().slice(5, 7))) ? 21 : 14);
const pad = (a: unknown[] | null | undefined, n: number) => (Array.isArray(a) ? [...new Array(Math.max(0, n - a.length)).fill(null), ...a] : null);
async function grid() {
  const cells = gridCells();
  const { data: have } = await admin.from('champi_meteo_grid').select('key, updated_at');
  const age = new Map((have ?? []).map((r: any) => [r.key, Date.parse(r.updated_at)]));
  const todo = cells.filter((c) => !age.has(c.key) || Date.now() - age.get(c.key)! > 3 * 3600 * 1000)
    .sort((a, b) => (age.get(a.key) ?? 0) - (age.get(b.key) ?? 0)).slice(0, 120);
  let rows = 0; const errors: string[] = [];
  for (let k = 0; k < todo.length; k += 60) {
    const part = todo.slice(k, k + 60);
    try {
      let main;
      try { main = await om(part, 'precipitation_sum,temperature_2m_max,temperature_2m_min', 'meteofrance_seamless', MAIN_PAST); }
      catch { main = await om(part, 'precipitation_sum,temperature_2m_max,temperature_2m_min', null, MAIN_PAST); }
      let soil: any[] = [];
      try { soil = await om(part, 'soil_temperature_0_to_7cm_mean,soil_moisture_0_to_7cm_mean', null, soilPast()); } catch (e) { errors.push('sol ' + String(e).slice(0, 80)); }
      const up = part.map((c, i) => {
        const n = main[i].daily.time.length;
        return {
          key: c.key, lat: c.lat, lon: c.lon, elevation: main[i]?.elevation ?? null, updated_at: new Date().toISOString(),
          daily: { ...main[i].daily, soil_temperature_0_to_7cm_mean: pad(soil[i]?.daily?.soil_temperature_0_to_7cm_mean, n), soil_moisture_0_to_7cm_mean: pad(soil[i]?.daily?.soil_moisture_0_to_7cm_mean, n) },
        };
      });
      const { error } = await admin.from('champi_meteo_grid').upsert(up, { onConflict: 'key' });
      if (error) throw error;
      rows += up.length;
    } catch (e) { errors.push(String(e).slice(0, 120)); }
  }
  return { cases: cells.length, a_faire: todo.length, enregistrees: rows, erreurs: errors };
}

// Humidité habituelle du sol (déciles par mois, saisons des 4 dernières années, même modèle que la grille) pour les
// cases de 0,1° qui ont des coins : une case par appel de nuit (≈ 100 appels Open-Meteo chacune), refaite chaque année.
async function soilClim() {
  const [{ data: spots }, { data: have }] = await Promise.all([admin.from('champi_spots').select('lat, lon'), admin.from('champi_soil_clim').select('key, updated_at')]);
  const done = new Map((have ?? []).map((r: any) => [r.key, Date.parse(r.updated_at)]));
  const keys = [...new Set((spots ?? []).map((s: any) => `${Math.floor(s.lat * 10)}:${Math.floor(s.lon * 10)}`))];
  const todo = keys.find((k) => !done.has(k) || Date.now() - done.get(k)! > 365 * 86400000);
  if (!todo) return 'à jour';
  const [i, j] = todo.split(':').map(Number);
  const y = Number(today().slice(0, 4));
  const r = await fetch(`https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=${((i + 0.5) / 10).toFixed(2)}&longitude=${((j + 0.5) / 10).toFixed(2)}&start_date=${y - 4}-01-01&end_date=${y - 1}-12-31&daily=soil_moisture_0_to_7cm_mean&timezone=Europe%2FParis`);
  if (!r.ok) return `Open-Meteo ${r.status}`;
  const d = (await r.json()).daily;
  const byMonth: Record<string, number[]> = {};
  d.time.forEach((t: string, k: number) => { const v = d.soil_moisture_0_to_7cm_mean[k]; if (v != null) (byMonth[String(Number(t.slice(5, 7)))] ??= []).push(v); });
  const months: Record<string, number[]> = {};
  for (const [m, v] of Object.entries(byMonth)) {
    if (v.length < 30) continue;
    v.sort((a, b) => a - b);
    months[m] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((q) => Math.round(v[Math.floor((q / 10) * (v.length - 1))] * 1000) / 1000);
  }
  const { error } = await admin.from('champi_soil_clim').upsert({ key: todo, months, updated_at: new Date().toISOString() });
  if (error) throw error;
  return todo;
}

// Diagnostic : API ouvertes par la clé (lues dans le jeton, jamais renvoyé) et réponse de chacune.
async function probe() {
  const key = Deno.env.get('METEOFRANCE_API_KEY') ?? '';
  const out: Record<string, unknown> = {
    forme: { longueur: key.length, morceaux: key.split('.').length, debut_jwt: key.startsWith('eyJ'), espaces: /\s/.test(key), guillemets: /["']/.test(key), bearer: /^bearer/i.test(key) },
  };
  try {
    const p = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    out.expire = p.exp ? new Date(p.exp * 1000).toISOString() : null;
    out.api = (p.subscribedAPIs ?? []).map((a: any) => `${a.name} → ${a.context}`);
  } catch { out.api = 'clé illisible'; }
  const P = 'https://public-api.meteofrance.fr/public';
  const tests: Record<string, string> = {
    climatologie: `${P}/DPClim/v1/liste-stations/quotidienne?id-departement=13&parametre=precipitation`,
    paquet_horaire: `${P}/DPPaquetObs/v2/paquet/horaire?id-departement=13&format=json`,
    paquet_stations: `${P}/DPPaquetObs/v2/liste-stations`,
    observation: `${P}/DPObs/v1/liste-stations`,
    vigilance: `${P}/DPVigilance/v1/cartevigilance/encours`,
    radar: `${P}/DPRadar/v1/mosaiques/METROPOLE/observations/LAME_D_EAU/produit?maille=1000`,
  };
  for (const [k, u] of Object.entries(tests)) {
    try { const r = await fetch(u, { headers: { apikey: key, accept: '*/*' } }); const t = await r.text(); out[k] = `${r.status} (${t.length} car.) ${t.slice(0, 700).replaceAll(key, '***')}`; }
    catch (e) { out[k] = 'erreur ' + String(e).slice(0, 80); }
  }
  // Prévisions du modèle Météo-France servies par Open-Meteo (sans clé : rien n'est envoyé).
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=43.53&longitude=5.44&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&past_days=14&forecast_days=3&timezone=Europe%2FParis&models=meteofrance_seamless');
    out.open_meteo_mf = `${r.status} ${(await r.text()).slice(0, 600)}`;
  } catch (e) { out.open_meteo_mf = 'erreur ' + String(e).slice(0, 80); }
  return out;
}

Deno.serve(async (req) => {
  try {
    const { data: cfg } = await admin.from('champi_push_config').select('cron_token').eq('id', true).single();
    if (req.headers.get('x-champi-token') !== cfg?.cron_token) return json({ error: 'jeton invalide' }, 401);
    const body = await req.json().catch(() => ({}));
    if (body.action === 'run') return json({ ...(await run()), sol_habituel: await soilClim().catch((e) => String(e).slice(0, 80)) });
    if (body.action === 'soilclim') return json({ sol_habituel: await soilClim() });
    if (body.action === 'hourly') return json(await hourly());
    if (body.action === 'grid') return json(await grid());
    if (body.action === 'probe') return json(await probe());
    return json({ error: 'action inconnue' }, 400);
  } catch (err: any) {
    return json({ error: String(err?.message ?? err) }, 500);
  }
});
