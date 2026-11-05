// Parcours partage : Enzo partage un coin privé avec Mamie ; Tonton ne le voit pas.
// Fausse base qui applique les mêmes règles que la RLS (coins, partages, trouvailles).
const { chromium, devices } = require('playwright');
const fakeMeteo = require('./fake-meteo.cjs');
const [, , SITE, OUT] = process.argv;
const REF = 'vvegujltsjgwszeloyaz';
const P = { enzo: { id: 'e0000000-0000-0000-0000-000000000000', name: 'Enzo' }, mamie: { id: 'm0000000-0000-0000-0000-000000000000', name: 'Mamie' }, tonton: { id: 't0000000-0000-0000-0000-000000000000', name: 'Tonton' } };
const db = {
  spots: [{ id: 's-priv', owner: P.enzo.id, visibility: 'private', name: 'Coin secret des cèpes', lat: 43.32, lon: 5.76, species: ['cepe'], trees: [], note: null, created_at: '2026-09-01T00:00:00Z' }],
  shares: [], finds: [],
};
const visible = (who, s) => s.owner === who.id || s.visibility === 'family' || db.shares.some((h) => h.spot_id === s.id && h.user_id === who.id);
async function open(b, who) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  const page = await ctx.newPage();
  await fakeMeteo(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.route(`https://${REF}.supabase.co/**`, (route) => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method();
    const obj = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj && Array.isArray(body) ? body[0] ?? null : body) });
    const eq = (k) => u.searchParams.get(k)?.replace(/^eq\./, '');
    const t = u.pathname.replace('/rest/v1/', '');
    if (u.pathname.startsWith('/functions/')) return send({ depts: {} });
    if (t === 'champi_allowed_emails') return send([{ email: 'x', label: who.name }]);
    if (t === 'champi_profiles') {
      const all = Object.values(P).map((p) => ({ id: p.id, display_name: p.name }));
      return send(eq('id') ? all.filter((p) => p.id === eq('id')) : all);
    }
    if (t === 'champi_spots') return send(db.spots.filter((s) => visible(who, s)).map((s) => ({ ...s, author: { display_name: Object.values(P).find((p) => p.id === s.owner).name } })));
    if (t === 'champi_spot_shares') {
      if (m === 'GET') return send(db.shares.filter((h) => h.user_id === who.id || db.spots.find((s) => s.id === h.spot_id)?.owner === who.id));
      if (m === 'POST') {
        const rows = [].concat(JSON.parse(req.postData()));
        if (rows.some((r) => db.spots.find((s) => s.id === r.spot_id)?.owner !== who.id || r.user_id === who.id)) return send({ code: '42501', message: 'row-level security' }, 403);
        db.shares.push(...rows); return send([], 201);
      }
      if (m === 'DELETE') {
        const spot = eq('spot_id'); const inList = u.searchParams.get('user_id');
        const ids = inList?.startsWith('in.') ? inList.slice(4, -1).split(',').map((x) => x.replace(/"/g, '')) : [eq('user_id')];
        const owner = db.spots.find((s) => s.id === spot)?.owner === who.id;
        db.shares = db.shares.filter((h) => !(h.spot_id === spot && ids.includes(h.user_id) && (owner || h.user_id === who.id)));
        return send([], 204);
      }
    }
    if (t === 'champi_finds') {
      if (m === 'GET') return send(db.finds.filter((f) => visible(who, db.spots.find((s) => s.id === f.spot_id))).map((f) => ({ ...f, author: { display_name: Object.values(P).find((p) => p.id === f.user_id).name } })));
      if (m === 'POST') { const r = { user_id: who.id, created_at: new Date().toISOString(), ...JSON.parse(req.postData()) }; if (!visible(who, db.spots.find((s) => s.id === r.spot_id))) return send({ code: '42501' }, 403); db.finds.push(r); return send([r], 201); }
    }
    return send([]);
  });
  await page.addInitScript(([ref, u]) => {
    localStorage.setItem('champi-tuto', '1');
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 9999999, user: { id: u.id, email: u.name + '@test.fr' } }));
  }, [REF, who]);
  await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])');
  return { page, errors };
}
(async () => {
  const b = await chromium.launch();
  const e = await open(b, P.enzo), m = await open(b, P.mamie), t = await open(b, P.tonton);
  console.log('avant partage · Mamie voit :', await m.page.locator('.spot-item').count(), '| Tonton voit :', await t.page.locator('.spot-item').count());

  // Enzo partage avec Mamie
  await e.page.locator('.spot-item', { hasText: 'Coin secret' }).click();
  console.log('Enzo · bouton :', await e.page.textContent('#spot-share'));
  await e.page.click('#spot-share');
  console.log('Enzo · personnes proposées :', (await e.page.locator('.share-person').allTextContents()).map((x) => x.trim()));
  await e.page.locator('.share-person', { hasText: 'Mamie' }).locator('input').check();
  await e.page.screenshot({ path: `${OUT}/90-partage.png` });
  await e.page.click('#share-save');
  await e.page.waitForFunction(() => document.querySelector('#spot-share').textContent.includes('(1)'));
  console.log('Enzo · après :', await e.page.textContent('#spot-share'), '|', (await e.page.textContent('#spot-badges')).replace(/\s+/g, ' ').trim(), '| base :', JSON.stringify(db.shares));
  await e.page.screenshot({ path: `${OUT}/91-partage-fiche.png` });

  // Mamie et Tonton rechargent
  await m.page.reload(); await m.page.waitForSelector('.spot-item');
  await t.page.reload(); await t.page.waitForSelector('#screen-app:not([hidden])'); await t.page.waitForTimeout(800);
  console.log('Mamie voit :', await m.page.locator('.spot-item .title').allTextContents(), '| classe :', await m.page.getAttribute('.spot-item', 'class'), '| Tonton voit :', await t.page.locator('.spot-item').count());
  await m.page.click('.topbar [data-scope=family]');
  console.log('Mamie · filtre Famille :', await m.page.locator('.spot-item').count());
  await m.page.click('.topbar [data-scope=mine]');
  console.log('Mamie · filtre Mes coins :', await m.page.locator('.spot-item').count());
  await m.page.click('.topbar [data-scope=all]');
  await m.page.locator('.spot-item').click();
  console.log('Mamie · badges :', (await m.page.textContent('#spot-badges')).replace(/\s+/g, ' ').trim(), '| Modifier :', await m.page.isVisible('#spot-edit'), '| Partager :', await m.page.isVisible('#spot-share'), '| Ne plus voir :', await m.page.isVisible('#spot-unshare'));
  await m.page.click('#find-add summary'); await m.page.click('#find-species [data-sp=cepe]'); await m.page.click('#find-form button[type=submit]');
  await m.page.waitForFunction(() => document.querySelectorAll('#find-list .head').length === 1);
  await m.page.screenshot({ path: `${OUT}/92-partage-mamie.png` });
  await e.page.reload(); await e.page.locator('.spot-item').click(); await e.page.waitForSelector('#find-list .head');
  console.log('Enzo voit la trouvaille de Mamie :', (await e.page.textContent('#find-list li')).replace(/\s+/g, ' ').trim().slice(0, 60));

  // Mamie ne veut plus le voir
  await m.page.click('#spot-unshare'); await m.page.waitForTimeout(800);
  console.log('Mamie après « Ne plus voir » :', await m.page.locator('.spot-item').count(), '| base :', JSON.stringify(db.shares));
  console.log('ERREURS :', [...e.errors, ...m.errors, ...t.errors].length ? [...e.errors, ...m.errors, ...t.errors] : 'aucune');
  await b.close();
})();
