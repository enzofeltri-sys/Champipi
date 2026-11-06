// Parcours « 🔎 Chercher » : bouton sur la carte, recherche par nom, espèce, note, personne ; un toucher → la carte va au coin.
const { chromium, devices } = require('playwright');
const fakeMeteo = require('./fake-meteo.cjs');
const [, , SITE, OUT] = process.argv;
const REF = 'vvegujltsjgwszeloyaz', ME = '11111111-1111-1111-1111-111111111111', MAME = '22222222-2222-2222-2222-222222222222';
const sp = (id, owner, name, lat, lon, extra = {}) => ({ id, owner, visibility: 'family', name, lat, lon, species: [], trees: [], created_at: '2026-01-01T00:00:00Z', ...extra });
const db = {
  spots: [
    sp('aaaaaaaa-0000-0000-0000-000000000001', ME, 'Pinède du Vallon', 43.40, 5.60, { note: 'Parking après le pont' }),
    sp('aaaaaaaa-0000-0000-0000-000000000002', MAME, 'Janas', 43.08, 5.88),
    sp('aaaaaaaa-0000-0000-0000-000000000003', ME, 'Foret Magique', 43.30, 6.30),
  ],
  finds: [{ id: 'ffffffff-0000-0000-0000-000000000001', spot_id: 'aaaaaaaa-0000-0000-0000-000000000002', user_id: MAME, found_on: '2026-11-06', species: ['cepe'], note: 'sous le gros chêne', created_at: '2026-11-06T11:00:00Z' }],
};
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  const page = await ctx.newPage(); await fakeMeteo(page);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.route(`https://${REF}.supabase.co/**`, (route) => {
    const req = route.request(); const u = new URL(req.url()); const t = u.pathname.replace('/rest/v1/', '');
    const obj = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const send = (body, st = 200) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(obj && Array.isArray(body) ? body[0] ?? null : body) });
    if (t === 'champi_profiles') { const all = [{ id: ME, display_name: 'Enzo' }, { id: MAME, display_name: 'Mame' }]; const id = (u.searchParams.get('id') || '').replace('eq.', ''); return send(id ? all.filter((x) => x.id === id) : all); }
    const body = { champi_allowed_emails: [{ email: 'x', label: 'Enzo' }], champi_spots: db.spots.map((s) => ({ ...s, author: {} })), champi_finds: db.finds.map((f) => ({ ...f, author: {} })) }[t] ?? (u.pathname.startsWith('/functions/') ? { depts: {} } : []);
    send(body);
  });
  await page.addInitScript(([ref, me]) => {
    localStorage.setItem('champi-tuto', '3'); localStorage.setItem('champi-view', JSON.stringify({ lat: 43.45, lon: 5.65, zoom: 12 }));
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 9999999, user: { id: me, email: 'x@y.fr' } }));
  }, [REF, ME]);
  page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)); });
  await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])', { timeout: 15000 }).catch(async () => { console.log('écran :', await page.evaluate(() => [...document.querySelectorAll('[id^=screen]')].map((e) => e.id + (e.hidden ? ' caché' : ' visible')).join(', ')), errors); }); await page.waitForTimeout(1200);

  const box = await page.locator('#rail-search').boundingBox();
  const last = await page.locator('#rail-locate').boundingBox();
  console.log('bouton 🔎 :', Math.round(box.y), 'px · bas de la colonne :', Math.round(last.y + last.height), 'px / écran', page.viewportSize().height);
  await page.screenshot({ path: `${OUT}/q0-carte.png` });
  await page.click('#rail-search');
  await page.waitForSelector('#dlg-search[open]');
  console.log('vide :', await page.textContent('#qs-count'), '| curseur dans le champ :', await page.evaluate(() => document.activeElement?.id));
  const look = async (q) => { await page.fill('#qs-input', q); await page.waitForTimeout(150); return (await page.locator('#qs-list .spot-item').allTextContents()).map((x) => x.replace(/\s+/g, ' ').trim()); };
  console.log('« vallon » :', await look('vallon'));
  console.log('« CEPE » :', await look('CEPE'));
  console.log('« mame » :', await look('mame'));
  console.log('« pont » :', await look('pont'));
  console.log('« gros chene » :', await look('gros chene'));
  console.log('« zzz » :', await look('zzz'), await page.textContent('#qs-count'));
  await look('cepe');
  await page.screenshot({ path: `${OUT}/q1-recherche.png` });
  await page.locator('#qs-list .spot-item').first().click();
  await page.waitForSelector('#dlg-spot[open]');
  const c = await page.evaluate(() => { const m = document.querySelector('#map')._leaflet_map; return m ? m.getCenter() : null; });
  console.log('→ fiche :', await page.textContent('#spot-name'), '| recherche fermée :', !(await page.evaluate(() => document.querySelector('#dlg-search').open)), c ? `| carte centrée : ${c.lat.toFixed(2)}, ${c.lng.toFixed(2)}` : '');
  await page.click('#dlg-spot .js-close');
  // Entrée → premier résultat
  await page.click('#rail-search'); await page.fill('#qs-input', 'foret'); await page.press('#qs-input', 'Enter');
  await page.waitForSelector('#dlg-spot[open]');
  console.log('Entrée → fiche :', await page.textContent('#spot-name'));
  console.log('ERREURS :', errors.length ? errors : 'aucune');
  await b.close();
})();
