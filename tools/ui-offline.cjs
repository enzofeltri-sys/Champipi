// Parcours hors ligne : enregistrer une zone (vraies tuiles IGN), couper le réseau, travailler, reconnecter.
const { chromium, devices } = require('playwright');
const { closeDialogs, openList, openSpot, setScope, pickSpecies, addAtCenter } = require('./ui-helpers.cjs');
const fakeMeteo = require('./fake-meteo.cjs');
const [, , SITE, OUT, PHOTO] = process.argv;
const REF = 'vvegujltsjgwszeloyaz';
const ME = '11111111-1111-1111-1111-111111111111';
const db = {
  spots: [{ id: 'aaaaaaaa-0000-0000-0000-000000000001', owner: ME, visibility: 'private', name: 'Hêtraie', lat: 43.318, lon: 5.765, species: ['cepe'], trees: [], note: null, created_at: '2026-09-01T00:00:00Z' }],
  finds: [], photos: [], files: new Map(), log: [],
};
let offline = false;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  const page = await ctx.newPage();
  await fakeMeteo(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ctx.route(`https://${REF}.supabase.co/**`, async (route) => {
    if (offline) return route.abort('internetdisconnected');
    const req = route.request(); const u = new URL(req.url()); const m = req.method();
    const obj = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj && Array.isArray(body) ? body[0] ?? null : body) });
    if (u.pathname.startsWith('/storage/v1/object/champi-photos/') && m === 'POST') { db.log.push('photo'); db.files.set(u.pathname, 1); return send({ Key: 'x' }); }
    if (u.pathname.startsWith('/functions/')) return send({ depts: {} });
    const t = u.pathname.replace('/rest/v1/', '');
    if (t === 'champi_allowed_emails') return send([{ email: 'x', label: 'Enzo' }]);
    if (t === 'champi_profiles') return send([{ id: ME, display_name: 'Enzo' }]);
    const T = { champi_spots: 'spots', champi_finds: 'finds', champi_photos: 'photos' }[t];
    if (T && m === 'GET') return send(db[T].map((r) => ({ ...r, author: { display_name: 'Enzo' } })));
    if (T && m === 'POST') { const r = { owner: ME, user_id: ME, created_at: new Date().toISOString(), ...JSON.parse(req.postData()) }; db[T].push(r); db.log.push(T + ':' + (r.name ?? r.found_on ?? r.path)); return send([r], 201); }
    return send([]);
  });
  await page.addInitScript(([ref, me]) => {
    localStorage.setItem('champi-tuto', '2');
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 9999999, user: { id: me, email: 'x@y.fr' } }));
    if (!localStorage.getItem('champi-view')) localStorage.setItem('champi-view', JSON.stringify({ lat: 43.32, lon: 5.765, zoom: 14 }));
  }, [REF, ME]);

  await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await page.waitForSelector('#screen-app:not([hidden])');
  console.log('service worker actif :', await page.evaluate(() => !!navigator.serviceWorker.controller));

  // 1. Enregistrer la zone affichée
  await page.click('#menu-btn'); await page.click('#offline-btn');
  const t0 = Date.now();
  await page.click('#offline-dl');
  await page.waitForFunction(() => /Zone enregistrée|échoué|Arrêté/.test(document.querySelector('#offline-msg').textContent), null, { timeout: 120000 });
  console.log('téléchargement :', await page.textContent('#offline-msg'), `(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  console.log('zones :', (await page.textContent('#zone-list')).replace(/\s+/g, ' ').trim());
  await page.screenshot({ path: `${OUT}/80-hors-ligne-zone.png` });
  await page.click('#dlg-offline .js-close');

  // 2. Couper le réseau, rouvrir l'appli
  offline = true; await ctx.setOffline(true);
  await page.reload(); await page.waitForSelector('#screen-app:not([hidden])', { timeout: 15000 });
  const tOpen = Date.now();
  await page.waitForSelector('.spot-item', { timeout: 20000, state: 'attached' });
  console.log('HORS LIGNE · coins affichés après', ((Date.now() - tOpen) / 1000).toFixed(1), 's');
  await page.waitForTimeout(1500);
  const tiles = await page.evaluate(() => { const im = [...document.querySelectorAll('img.leaflet-tile')]; return { total: im.length, ok: im.filter((i) => i.complete && i.naturalWidth > 0).length }; });
  console.log('HORS LIGNE · appli ouverte, coins :', await page.locator('.spot-item').count(), '| tuiles affichées :', JSON.stringify(tiles), '| bandeau :', await page.textContent('#offline-bar'));
  await page.screenshot({ path: `${OUT}/81-hors-ligne-carte.png` });

  // 3. Trouvaille avec photo, hors ligne
  await openSpot(page, 'Hêtraie', { more: false });
  await page.click('#find-add summary'); await page.click('#find-species [data-sp=cepe]');
  await page.setInputFiles('#find-photos', PHOTO);
  await page.click('#find-form button[type=submit]');
  await page.waitForSelector('#find-list .pending-tag');
  console.log('HORS LIGNE · trouvaille :', (await page.textContent('#find-list li')).replace(/\s+/g, ' ').trim().slice(0, 80));
  await page.screenshot({ path: `${OUT}/82-hors-ligne-trouvaille.png` });
  await page.click('#dlg-spot .js-close');

  // 4. Nouveau coin, hors ligne
  await addAtCenter(page);
  await page.fill('#edit-name', 'Coin noté en forêt'); await page.click('#edit-save');
  await page.waitForSelector('#dlg-spot[open]');
  await page.click('#dlg-spot .js-close');
  console.log('HORS LIGNE · bandeau :', await page.textContent('#offline-bar'), '| coins :', await page.locator('.spot-item .title').allTextContents());
  console.log('envoyé pendant la coupure :', JSON.stringify(db.log));

  // 5. Retour du réseau
  offline = false; await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => document.querySelector('#offline-bar').hidden, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  console.log('RETOUR RÉSEAU · ordre des envois :', JSON.stringify(db.log));
  console.log('bandeau :', await page.isVisible('#offline-bar') ? await page.textContent('#offline-bar') : '(caché)', '| en attente :', await page.locator('.pending-tag').count());
  console.log('ERREURS :', errors.length ? errors : 'aucune');
  await b.close();
})();
