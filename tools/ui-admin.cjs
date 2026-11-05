// Parcours admin dans Chromium : une personne hors liste demande l'accès, l'admin accepte.
// Fausse API Supabase en mémoire qui applique les mêmes règles que la RLS pour ces tables.
const { chromium, devices } = require('playwright');
const fakeMeteo = require('./fake-meteo.cjs');
const [, , SITE, OUT] = process.argv;
const REF = 'vvegujltsjgwszeloyaz';
const ADMIN = { id: 'a0000000-0000-0000-0000-000000000000', email: 'enzofeltri@gmail.com' };
const MAMIE = { id: 'b0000000-0000-0000-0000-000000000000', email: 'mamie@test.fr' };

const db = {
  admins: ['enzofeltri@gmail.com'],
  allowed: [{ email: 'enzofeltri@gmail.com', label: 'Enzo', added_at: '2026-11-05T00:00:00Z' }, { email: 'tonton@test.fr', label: 'Tonton', added_at: '2026-11-05T01:00:00Z' }],
  requests: [], profiles: [{ id: ADMIN.id, display_name: 'Enzo' }],
};

async function open(browser, who) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  const page = await ctx.newPage();
  await fakeMeteo(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  const isAdmin = () => db.admins.includes(who.email);
  const isFamily = () => db.allowed.some((a) => a.email === who.email);
  await page.route(`https://${REF}.supabase.co/**`, async (route) => {
    const req = route.request(); const url = new URL(req.url()); const m = req.method();
    const obj = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const send = (body, status = 200, headers = {}) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(obj && Array.isArray(body) ? body[0] ?? null : body) });
    const table = url.pathname.replace('/rest/v1/', '');
    const eq = (k) => url.searchParams.get(k)?.replace(/^eq\./, '');
    if (url.pathname.startsWith('/auth/')) return send({});
    if (table === 'champi_spot_shares') return send([]);
    if (table === 'champi_admins') return send(db.admins.filter((e) => e === who.email && e === eq('email')).map((email) => ({ email })));
    if (table === 'champi_allowed_emails') {
      const vis = db.allowed.filter((a) => isAdmin() || a.email === who.email);
      if (m === 'GET') return send(vis.filter((a) => !eq('email') || a.email === eq('email')));
      if (m === 'POST') {
        if (!isAdmin()) return send({ code: '42501', message: 'new row violates row-level security policy' }, 403);
        const r = JSON.parse(req.postData());
        if (db.allowed.some((a) => a.email === r.email)) return send({ code: '23505', message: 'duplicate' }, 409);
        db.allowed.push({ added_at: new Date().toISOString(), ...r }); return send([], 201);
      }
      if (m === 'DELETE') { const e = eq('email'); if (isAdmin() && e !== who.email) db.allowed = db.allowed.filter((a) => a.email !== e); return send([], 204); }
    }
    if (table === 'champi_access_requests') {
      const vis = db.requests.filter((r) => isAdmin() || r.email === who.email);
      if (m === 'HEAD' || (m === 'GET' && (req.headers()['prefer'] || '').includes('count'))) return route.fulfill({ status: 200, headers: { 'content-range': `0-${vis.length - 1}/${vis.length}` }, body: '' });
      if (m === 'GET') return send(vis.filter((r) => !eq('email') || r.email === eq('email')));
      if (m === 'POST') {
        if (isFamily()) return send({ code: '42501', message: 'row-level security' }, 403);
        db.requests.push({ email: who.email, user_id: who.id, created_at: new Date().toISOString(), ...JSON.parse(req.postData()) }); return send([], 201);
      }
      if (m === 'DELETE') { const e = eq('email'); if (isAdmin() || e === who.email) db.requests = db.requests.filter((r) => r.email !== e); return send([], 204); }
    }
    if (table === 'champi_profiles') {
      if (m === 'GET') return send(db.profiles.filter((p) => p.id === who.id));
      if (m === 'POST') { if (!isFamily()) return send({ code: '42501', message: 'rls' }, 403); db.profiles.push({ id: who.id, ...JSON.parse(req.postData()) }); return send([], 201); }
    }
    if (['champi_spots', 'champi_finds', 'champi_photos'].includes(table)) return send(isFamily() ? [] : []);
    if (/champi_rain_(stations|daily)|champi_alert_log|champi_meteo_grid/.test(table)) return send([]);   // pluie Météo-France : rien de simulé
    return send({ message: 'non simulé ' + m + ' ' + table }, 500);
  });
  await page.addInitScript(([ref, u]) => {
    localStorage.setItem('champi-tuto', '1'); localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 99999, user: { id: u.id, email: u.email } }));
  }, [REF, who]);
  await page.goto(SITE);
  return { page, errors };
}

(async () => {
  const b = await chromium.launch();
  // 1. Mamie, hors liste : formulaire de demande
  const m = await open(b, MAMIE);
  await m.page.waitForSelector('#screen-denied:not([hidden])');
  await m.page.screenshot({ path: `${OUT}/30-demande.png` });
  await m.page.fill('#request-name', 'Mamie'); await m.page.fill('#request-msg', "C'est Mamie !");
  await m.page.click('#request-form button[type=submit]');
  await m.page.waitForSelector('#request-pending:not([hidden])');
  await m.page.screenshot({ path: `${OUT}/31-demande-envoyee.png` });
  console.log('demandes en base :', JSON.stringify(db.requests.map((r) => [r.email, r.display_name, r.message])));
  await m.page.click('#denied-retry'); await m.page.waitForTimeout(500);
  console.log('Mamie toujours en attente :', await m.page.isVisible('#screen-denied'));
  // Mamie ne peut pas s'ajouter elle-même à la liste
  const self = await m.page.evaluate(async () => (await window.__sbTest?.()) ?? null);
  void self;

  // 2. Admin : pastille, demandes, accepter
  const a = await open(b, ADMIN);
  await a.page.waitForSelector('#screen-app:not([hidden])'); await a.page.waitForTimeout(800);
  console.log('pastille admin visible :', await a.page.isVisible('#menu-dot'));
  await a.page.click('#menu-btn');
  console.log('bouton admin :', (await a.page.textContent('#admin-btn')).trim());
  await a.page.click('#admin-btn');
  await a.page.waitForSelector('[data-accept]');
  await a.page.screenshot({ path: `${OUT}/32-admin.png` });
  console.log('membres :', await a.page.locator('#member-list .head span:first-child').allTextContents());
  console.log('bouton Retirer sur moi :', await a.page.locator('#member-list li', { hasText: 'enzofeltri@gmail.com' }).locator('[data-remove]').count());
  await a.page.click('[data-accept]');
  await a.page.waitForFunction(() => document.querySelectorAll('#member-list li').length === 3);
  console.log('après acceptation : liste', JSON.stringify(db.allowed.map((x) => [x.email, x.label])), 'demandes', db.requests.length);
  // ajouter puis retirer quelqu'un
  await a.page.fill('#add-email', 'Cousine@Test.fr '); await a.page.fill('#add-label', 'Cousine');
  await a.page.click('#add-form button[type=submit]');
  await a.page.waitForFunction(() => document.querySelectorAll('#member-list li').length === 4);
  console.log('ajout manuel :', JSON.stringify(db.allowed.at(-1)));
  await a.page.locator('#member-list li', { hasText: 'tonton@test.fr' }).locator('[data-remove]').click();
  await a.page.waitForFunction(() => document.querySelectorAll('#member-list li').length === 3);
  console.log('après retrait :', db.allowed.map((x) => x.email));
  await a.page.screenshot({ path: `${OUT}/33-admin-apres.png` });
  console.log('pastille après traitement :', await a.page.isVisible('#menu-dot'));

  // 3. Mamie touche « Vérifier » : profil créé avec son prénom, appli ouverte
  await m.page.click('#denied-retry');
  await m.page.waitForSelector('#screen-app:not([hidden])', { timeout: 5000 });
  console.log('Mamie dans l\'appli, profil :', JSON.stringify(db.profiles.find((p) => p.id === MAMIE.id)), 'bouton admin visible :', await m.page.isVisible('#admin-btn'));
  console.log('ERREURS Mamie :', m.errors.length ? m.errors : 'aucune', '| admin :', a.errors.length ? a.errors : 'aucune');
  await b.close();
})();
