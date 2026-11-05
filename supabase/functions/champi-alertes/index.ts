// Alertes de pousse : chaque matin (planificateur pg_cron), envoie une notification aux membres
// dont un coin visible a des conditions favorables selon les mêmes règles que l'appli.
//   GET                         → { publicKey }   (clé VAPID publique ; générée au premier appel)
//   POST { action: 'test' }     → notification de test au demandeur (session requise)
//   POST { action: 'run' }      → tournée du matin (en-tête x-champi-token requis)
//   POST { action: 'news', find_id } → nouvelle trouvaille annoncée à la famille (déclencheur SQL, jeton requis)
//   POST { action: 'selftest', sub } → envoi chiffré vers une adresse de test (en-tête x-champi-token requis)
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import webpush from 'npm:web-push@3.6.7';
// Règles du conseiller : copie générée depuis l'appli (node tools/build-alertes.mjs).
import { summarizeWeather, assess, spotSpecies, SPECIES } from './rules.js';
import { rainIndex, mergeRain } from './rain.js';

const SITE = 'https://enzofeltri-sys.github.io/Champipi/';
const ORIGINS = ['https://enzofeltri-sys.github.io', 'http://localhost:5173'];
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const cors = (req: Request) => {
  const o = req.headers.get('origin') ?? '';
  return { 'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0], 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' };
};
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json; charset=utf-8' } });

async function config() {
  const { data, error } = await admin.from('champi_push_config').select('*').eq('id', true).single();
  if (error) throw error;
  if (!data.vapid_public || !data.vapid_private) {
    const k = webpush.generateVAPIDKeys();
    const { error: e2 } = await admin.from('champi_push_config').update({ vapid_public: k.publicKey, vapid_private: k.privateKey }).eq('id', true);
    if (e2) throw e2;
    return { ...data, vapid_public: k.publicKey, vapid_private: k.privateKey };
  }
  return data;
}

async function send(cfg: any, sub: any, payload: unknown) {
  // Apple refuse un contact invalide (403 BadJwtToken) : on donne l'adresse du site.
  webpush.setVapidDetails(SITE, cfg.vapid_public, cfg.vapid_private);
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 6 * 3600 });
    return 'ok';
  } catch (err: any) {
    if (err?.statusCode === 404 || err?.statusCode === 410) {             // abonnement expiré : on le retire
      await admin.from('champi_push_subscriptions').delete().eq('endpoint', sub.endpoint);
      return 'expiré';
    }
    return `erreur ${err?.statusCode ?? ''} ${String(err?.body || err?.message || err).slice(0, 160)}`;
  }
}

const today = () => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());

async function weatherFor(points: [number, number][]) {
  const out: any[] = [];
  for (let k = 0; k < points.length; k += 100) {
    const p = points.slice(k, k + 100);
    const q = `https://api.open-meteo.com/v1/forecast?latitude=${p.map((x) => x[0].toFixed(3)).join(',')}&longitude=${p.map((x) => x[1].toFixed(3)).join(',')}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&past_days=14&forecast_days=3&timezone=Europe%2FParis`;
    // Modèles Météo-France (AROME, ARPEGE) via Open-Meteo ; en secours, le mélange habituel.
    let r = await fetch(`${q}&models=meteofrance_seamless`);
    if (!r.ok) r = await fetch(q);
    if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
    const j = await r.json();
    out.push(...(Array.isArray(j) ? j : [j]).map((x: any) => ({ ...x.daily, elevation: x.elevation })));
  }
  return out;
}

async function morningRun(cfg: any) {
  const [subs, spots, finds, shares, allowed, profiles, log] = await Promise.all([
    admin.from('champi_push_subscriptions').select('*'),
    admin.from('champi_spots').select('id, owner, visibility, name, lat, lon, species, trees'),
    admin.from('champi_finds').select('spot_id, found_on, species'),
    admin.from('champi_spot_shares').select('spot_id, user_id'),
    admin.from('champi_allowed_emails').select('email'),
    admin.from('champi_profiles').select('id, notify_pousse'),
    admin.from('champi_alert_log').select('spot_id, user_id, sent_on').gte('sent_on', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)),
  ]);
  for (const r of [subs, spots, finds, shares, allowed, profiles, log]) if (r.error) throw r.error;
  if (!subs.data!.length) return { abonnés: 0 };

  // Qui est encore dans la famille ? (e-mail du compte ↔ liste autorisée)
  const users = new Map<string, string>();
  for (let page = 1; page < 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) users.set(u.id, (u.email ?? '').toLowerCase());
    if (data.users.length < 200) break;
  }
  const family = new Set(allowed.data!.map((a: any) => a.email));
  const isFamily = (uid: string) => family.has(users.get(uid) ?? '');
  const visible = (uid: string, s: any) => s.owner === uid || (isFamily(uid) && (s.visibility === 'family' || shares.data!.some((h: any) => h.spot_id === s.id && h.user_id === uid)));

  const day = today();
  const month = Number(day.slice(5, 7));
  const list = spots.data!;
  // Météo « doublée » : pluie mesurée Météo-France (relevée cette nuit) + Open-Meteo ; chacune secourt l'autre.
  const om = await weatherFor(list.map((s: any) => [s.lat, s.lon])).catch(() => null);
  const since = new Date(Date.now() - 16 * 86400000).toISOString().slice(0, 10);
  const st = await admin.from('champi_rain_stations').select('id, name, lat, lon, alt');
  const rows: any[] = []; let rainOk = !st.error;
  for (let from = 0; rainOk && from < 20000; from += 1000) {   // 1 000 lignes par réponse au maximum
    const r = await admin.from('champi_rain_daily').select('station_id, day, rr, tn, tx, hours').gte('day', since).order('day').order('station_id').range(from, from + 999);
    if (r.error) { rainOk = false; break; }
    rows.push(...r.data); if (r.data.length < 1000) break;
  }
  const idx = rainOk ? rainIndex(st.data, rows) : null;
  const daily = list.map((s: any, i: number) => mergeRain(om?.[i] ?? null, s.lat, s.lon, idx, day).daily);
  const verdict = new Map(list.filter((_: any, i: number) => daily[i]).map((s: any) => {
    const i = list.indexOf(s);
    const w = summarizeWeather(daily[i], day);
    const a = assess(w, { month, species: spotSpecies(s, finds.data!), trees: s.trees ?? [], history: finds.data!.filter((f: any) => f.spot_id === s.id) });
    return [s.id, { s, a }];
  }));

  const recent = new Set(log.data!.map((l: any) => `${l.spot_id}|${l.user_id}`));
  const byUser = new Map<string, any[]>();
  const muted = new Set(profiles.data!.filter((p: any) => p.notify_pousse === false).map((p: any) => p.id));
  for (const sub of subs.data!) if (!muted.has(sub.user_id)) byUser.set(sub.user_id, [...(byUser.get(sub.user_id) ?? []), sub]);
  const report: any[] = [];
  for (const [uid, userSubs] of byUser) {
    const good = list.filter((s: any) => visible(uid, s) && verdict.get(s.id)?.a.level === 'bon' && !recent.has(`${s.id}|${uid}`))
      .map((s: any) => verdict.get(s.id)!).sort((x: any, y: any) => y.a.score - x.a.score);
    if (!good.length) { report.push({ uid, coins: 0 }); continue; }
    const top = good[0];
    const body = `${top.s.name} : ${top.a.perSpecies[0]?.label ?? ''} — ${top.a.reasons[0] ?? ''}`
      + (good.length > 1 ? ` (+ ${good.length - 1} autre${good.length > 2 ? 's' : ''} coin${good.length > 2 ? 's' : ''})` : '');
    const payload = { title: '🍄 Conditions favorables', body, url: `${SITE}#journal=a:${top.s.id}:${day}`, tag: 'champi-pousse' };   // ouvre le journal
    const res = await Promise.all(userSubs.map((sub) => send(cfg, sub, payload)));
    if (res.includes('ok')) await admin.from('champi_alert_log').insert(good.map((g: any) => ({ spot_id: g.s.id, user_id: uid, sent_on: day })));
    report.push({ uid, coins: good.length, envois: res });
  }
  return { jour: day, abonnés: subs.data!.length, pluie_mesuree: idx ? idx.stations.length : 0, report };
}

async function familyEmails() {
  const [allowed, users] = [await admin.from('champi_allowed_emails').select('email'), new Map<string, string>()];
  if (allowed.error) throw allowed.error;
  for (let page = 1; page < 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) users.set(u.id, (u.email ?? '').toLowerCase());
    if (data.users.length < 200) break;
  }
  const family = new Set(allowed.data!.map((a: any) => a.email));
  return (uid: string) => family.has(users.get(uid) ?? '');
}

const label = (id: string) => SPECIES.find((s: any) => s.id === id)?.label ?? id;
export function newsText(who: string, spotName: string, species: string[], note: string | null) {
  const what = species.length ? species.map(label).join(', ').toLowerCase() : null;
  return {
    title: `${who} ${what ? `a trouvé : ${what}` : 'est allé·e aux champignons'}`,
    body: `${spotName}${note ? ` — ${note.length > 90 ? note.slice(0, 89) + '…' : note}` : ''}`,
  };
}

// Nouvelle trouvaille : prévenir ceux qui voient le coin (sauf l'auteur), s'ils n'ont pas coupé ces nouvelles.
async function announce(cfg: any, findId: string) {
  const { data: f, error } = await admin.from('champi_finds').select('id, spot_id, user_id, found_on, species, note').eq('id', findId).single();
  if (error) throw error;
  // Trouvaille ancienne (saisie après coup, photo de l'an dernier…) : pas d'annonce.
  if (Date.parse(f.found_on) < Date.parse(today()) - 3 * 86400000) return { annonce: 'trouvaille ancienne' };
  const { data: s, error: e2 } = await admin.from('champi_spots').select('id, owner, visibility, name').eq('id', f.spot_id).single();
  if (e2) throw e2;
  const [shares, profiles, subs] = await Promise.all([
    admin.from('champi_spot_shares').select('user_id').eq('spot_id', s.id),
    admin.from('champi_profiles').select('id, display_name, avatar_emoji, notify_news'),
    admin.from('champi_push_subscriptions').select('*'),
  ]);
  for (const r of [shares, profiles, subs]) if (r.error) throw r.error;
  const isFamily = await familyEmails();
  const shared = new Set(shares.data!.map((h: any) => h.user_id));
  const sees = (uid: string) => uid === s.owner || (isFamily(uid) && (s.visibility === 'family' || shared.has(uid)));
  const prof = new Map(profiles.data!.map((p: any) => [p.id, p]));
  const author = prof.get(f.user_id);
  const who = `${author?.avatar_emoji ?? '🍄'} ${author?.display_name ?? 'Quelqu\'un'}`;
  const text = newsText(who, s.name, f.species ?? [], f.note);
  const targets = subs.data!.filter((sub: any) => sub.user_id !== f.user_id && sees(sub.user_id) && prof.get(sub.user_id)?.notify_news !== false);
  const payload = { ...text, url: `${SITE}#journal=f:${f.id}`, tag: `champi-news-${f.id}` };   // ouvre le journal sur cette trouvaille
  const res = await Promise.all(targets.map((sub: any) => send(cfg, sub, payload)));
  return { destinataires: new Set(targets.map((t: any) => t.user_id)).size, envois: res };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  try {
    const cfg = await config();
    if (req.method === 'GET') return json(req, { publicKey: cfg.vapid_public });
    const body = await req.json().catch(() => ({}));
    if (body.action === 'run') {
      if (req.headers.get('x-champi-token') !== cfg.cron_token) return json(req, { error: 'jeton invalide' }, 401);
      return json(req, await morningRun(cfg));
    }
    if (body.action === 'news') {
      if (req.headers.get('x-champi-token') !== cfg.cron_token) return json(req, { error: 'jeton invalide' }, 401);
      return json(req, await announce(cfg, String(body.find_id ?? '')));
    }
    if (body.action === 'selftest') {   // vérifie le chiffrement Web Push vers une adresse de test (jeton requis)
      if (req.headers.get('x-champi-token') !== cfg.cron_token) return json(req, { error: 'jeton invalide' }, 401);
      return json(req, { envoi: await send(cfg, body.sub, { title: 'autotest', body: 'autotest' }) });
    }
    if (body.action === 'test') {
      const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
      const { data: u, error } = await admin.auth.getUser(jwt);
      if (error || !u.user) return json(req, { error: 'connexion requise' }, 401);
      const { data: subs } = await admin.from('champi_push_subscriptions').select('*').eq('user_id', u.user.id);
      if (!subs?.length) return json(req, { error: 'aucun abonnement pour ce compte' }, 404);
      const res = await Promise.all(subs.map((s) => send(cfg, s, { title: '🍄 Alerte de test', body: 'Les alertes de pousse fonctionnent sur ce téléphone.', url: SITE, tag: 'champi-test' })));
      return json(req, { envois: res });
    }
    return json(req, { error: 'action inconnue' }, 400);
  } catch (err: any) {
    return json(req, { error: String(err?.message ?? err) }, 500);
  }
});
