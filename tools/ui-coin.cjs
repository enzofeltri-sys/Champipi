// Parcours « coin ou trouvaille » : nouveau coin + première trouvaille d'un coup ; coin tout près → « C'est dans ce coin ? » ;
// « rien aujourd'hui » → coin seul.
const { chromium, devices } = require('playwright');
const fakeMeteo = require('./fake-meteo.cjs');
const [, , SITE, OUT] = process.argv;
const REF = 'vvegujltsjgwszeloyaz', ME = '11111111-1111-1111-1111-111111111111';
const S1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const db = { spots: [{ id: S1, owner: ME, visibility: 'private', name: 'Pinède du Vallon', lat: 43.4, lon: 5.6, species: [], trees: [], created_at: '2026-01-01T00:00:00Z' }], finds: [], posts: [] };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  const page = await ctx.newPage(); await fakeMeteo(page);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.route(`https://${REF}.supabase.co/**`, (route) => {
    const req = route.request(); const u = new URL(req.url()); const t = u.pathname.replace('/rest/v1/', '');
    const obj = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const send = (body, st = 200) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(obj && Array.isArray(body) ? body[0] ?? null : body) });
    if (req.method() === 'POST' && (t === 'champi_spots' || t === 'champi_finds')) {
      const row = JSON.parse(req.postData()); db.posts.push([t, row]);
      if (t === 'champi_spots') db.spots.push({ ...row, owner: ME, created_at: new Date().toISOString() }); else db.finds.push({ ...row, user_id: ME, created_at: new Date().toISOString() });
      return send([{ id: row.id }], 201);
    }
    if (t === 'champi_profiles') return send([{ id: ME, display_name: 'Enzo' }]);
    const body = { champi_allowed_emails: [{ email: 'x', label: 'Enzo' }], champi_spots: db.spots.map((s) => ({ ...s, author: {} })), champi_finds: db.finds.map((f) => ({ ...f, author: {} })) }[t] ?? (u.pathname.startsWith('/functions/') ? { depts: {} } : []);
    send(body);
  });
  await page.addInitScript(([ref, me]) => {
    localStorage.setItem('champi-tuto', '3'); localStorage.setItem('champi-view', JSON.stringify({ lat: 43.45, lon: 5.65, zoom: 14 }));
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 9999999, user: { id: me, email: 'x@y.fr' } }));
  }, [REF, ME]);
  await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])'); await page.waitForTimeout(1000);
  console.log('bouton principal :', (await page.textContent('#btn-add')).trim());

  // 1. Loin de tout coin : formulaire « ce que tu as trouvé » + « le coin »
  await page.click('#btn-add'); await page.click('#add-here');
  await page.waitForSelector('#dlg-edit[open]');
  console.log('formulaire :', (await page.locator('#dlg-edit h3').allTextContents()).join(' → '), '| champ espèces du coin :', await page.locator('#edit-species').count());
  await page.click('#nf-species [data-sp=cepe]'); await page.click('#nf-species [data-sp=girolle]');
  await page.selectOption('#nf-quantity', 'panier');
  await page.fill('#edit-name', 'Châtaigneraie nouvelle');
  await page.screenshot({ path: `${OUT}/k1-formulaire.png` });
  await page.click('#edit-save'); await page.waitForTimeout(1200);
  console.log('envoyé :', db.posts.map(([t, r]) => `${t.replace('champi_', '')}${r.species ? ' ' + JSON.stringify(r.species) : ''}${r.quantity ? ' ' + r.quantity : ''}`).join(' + '));
  console.log('message :', await page.textContent('#toast'), '| fiche ouverte :', await page.textContent('#spot-name'));
  console.log('fiche · rubrique :', (await page.locator('#dlg-spot h3').first().textContent()).trim(), '| trouvailles :', await page.locator('#find-list > li').count());
  await page.screenshot({ path: `${OUT}/k2-fiche.png` });
  await page.click('#dlg-spot .js-close');

  // 2. À 60 m d'un coin existant : la question
  await page.evaluate(() => { });
  const n0 = db.posts.length;
  await page.evaluate(([lat, lon]) => { const m = window.__champiMap; }, [0, 0]);
  await page.click('#btn-add');
  // centre la carte à ~60 m de « Pinède du Vallon »
  await page.evaluate(() => document.querySelector('#map')._leaflet_map?.setView([43.4005, 5.6], 17));
  const centered = await page.evaluate(() => !!document.querySelector('#map')._leaflet_map);
  if (!centered) {   // pas d'accès direct à la carte : on passe par « Ma position »
    await ctx.grantPermissions(['geolocation']); await ctx.setGeolocation({ latitude: 43.4005, longitude: 5.6 });
    await page.click('#add-locate'); await page.waitForTimeout(800);
  }
  await page.click('#add-here');
  await page.waitForSelector('#dlg-near[open]', { timeout: 5000 });
  console.log('question :', (await page.textContent('#near-text')).trim());
  await page.screenshot({ path: `${OUT}/k3-proche.png` });
  await page.click('#near-yes'); await page.waitForTimeout(500);
  console.log('→ fiche :', await page.textContent('#spot-name'), '| « Nouvelle trouvaille » ouverte :', await page.evaluate(() => document.querySelector('#find-add').open), '| rien envoyé :', db.posts.length === n0);
  await page.click('#dlg-spot .js-close');

  // 3. « Rien aujourd'hui » : coin seul
  await ctx.setGeolocation({ latitude: 43.5, longitude: 5.8 });
  await page.click('#btn-add'); await page.click('#add-locate'); await page.waitForTimeout(800); await page.click('#add-here');
  await page.waitForSelector('#dlg-edit[open]');
  await page.check('#nf-skip');
  console.log('rien aujourd\'hui → rubrique cachée :', await page.isHidden('#nf-body'));
  await page.fill('#edit-name', 'Endroit repéré'); await page.click('#edit-save'); await page.waitForTimeout(1000);
  console.log('envoyé :', db.posts.slice(n0).map(([t]) => t.replace('champi_', '')).join(' + '), '| message :', await page.textContent('#toast'));
  console.log('ERREURS :', errors.length ? errors : 'aucune');
  await b.close();
})();
