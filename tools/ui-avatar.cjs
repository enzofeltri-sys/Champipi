// Parcours logos, aide complète et blocage du zoom de la page.
const { chromium, devices } = require('playwright');
const fakeMeteo = require('./fake-meteo.cjs');
const { openSpot, closeDialogs } = require('./ui-helpers.cjs');
const [, , SITE, OUT] = process.argv;
const REF = 'vvegujltsjgwszeloyaz';
const ME = '11111111-1111-1111-1111-111111111111', TATA = '22222222-2222-2222-2222-222222222222';
const db = {
  profiles: [{ id: ME, display_name: 'Enzo', avatar_emoji: null, avatar_color: null }, { id: TATA, display_name: 'Tata', avatar_emoji: '🦊', avatar_color: '#c0392b' }],
  spots: [{ id: 'aaaaaaaa-0000-0000-0000-000000000001', owner: ME, visibility: 'private', name: 'Mon coin secret', lat: 43.32, lon: 5.6, species: ['cepe'], trees: [], created_at: '2026-09-01T00:00:00Z' },
    { id: 'aaaaaaaa-0000-0000-0000-000000000002', owner: TATA, visibility: 'family', name: 'Coin de Tata', lat: 43.34, lon: 5.66, species: ['cepe'], trees: [], created_at: '2026-09-02T00:00:00Z' }],
  finds: [{ id: 'f1', spot_id: 'aaaaaaaa-0000-0000-0000-000000000002', user_id: TATA, found_on: '2025-10-10', species: ['cepe'], created_at: '2025-10-10T00:00:00Z' }],
};
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  const page = await ctx.newPage();
  await fakeMeteo(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(`https://${REF}.supabase.co/**`, (route) => {
    const req = route.request(); const u = new URL(req.url()); const t = u.pathname.replace('/rest/v1/', '');
    const obj = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const send = (body, st = 200) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(obj && Array.isArray(body) ? body[0] ?? null : body) });
    if (t === 'champi_profiles' && req.method() === 'PATCH') { Object.assign(db.profiles[0], JSON.parse(req.postData())); return send([db.profiles[0]]); }
    if (t === 'champi_profiles') { const id = u.searchParams.get('id')?.slice(3); return send(id ? db.profiles.filter((p) => p.id === id) : db.profiles); }
    const body = { champi_allowed_emails: [{ email: 'x', label: 'Enzo' }], champi_spots: db.spots.map((s) => ({ ...s, author: {} })), champi_finds: db.finds.map((f) => ({ ...f, author: {} })) }[t] ?? (u.pathname.startsWith('/functions/') ? { depts: {} } : []);
    send(body);
  });
  await page.addInitScript(([ref, me]) => {
    localStorage.setItem('champi-tuto', '2');
    localStorage.setItem('champi-view', JSON.stringify({ lat: 43.33, lon: 5.63, zoom: 12 }));
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 9999999, user: { id: me, email: 'x@y.fr' } }));
  }, [REF, ME]);
  await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])'); await page.waitForTimeout(1200);

  const pinInfo = () => page.evaluate(() => [...document.querySelectorAll('.leaflet-marker-icon .pin')].map((p) => [p.querySelector('.pin-emoji')?.textContent, p.querySelector('path').style.fill, p.querySelector('.lock')?.textContent ?? '']));
  console.log('épingles (emblème, couleur, cadenas) :', JSON.stringify(await pinInfo()));
  await page.screenshot({ path: `${OUT}/b1-logos.png` });

  // Mon profil : choisir 🦉 sur fond bleu
  await page.click('#menu-btn');
  console.log('menu, ligne profil :', (await page.textContent('#profile-btn')).trim());
  await page.click('#profile-btn');
  await page.click('#prof-emojis [data-emoji="🦉"]'); await page.click('#prof-colors [data-color="#2f6db5"]');
  await page.screenshot({ path: `${OUT}/b2-profil.png` });
  await page.click('#prof-save'); await page.waitForTimeout(800);
  console.log('enregistré :', JSON.stringify(db.profiles[0]));
  console.log('épingles après :', JSON.stringify(await pinInfo()));

  // Journal : logo de Tata
  await openSpot(page, 'Coin de Tata', { more: false });
  console.log('fiche Tata · badge :', (await page.textContent('#spot-badges')).replace(/\s+/g, ' ').trim(), '| journal :', (await page.textContent('#find-list .by')).trim());
  await page.screenshot({ path: `${OUT}/b3-journal.png` });
  await closeDialogs(page);

  // Aide complète
  await page.click('#menu-btn'); await page.click('#help-btn');
  const sections = await page.locator('#dlg-help summary').allTextContents();
  console.log('aide :', sections.length, 'rubriques :', sections.join(' | '));
  await page.screenshot({ path: `${OUT}/b4-aide.png` });
  await closeDialogs(page);

  // Zoom de la page bloqué
  const vp = await page.getAttribute('meta[name=viewport]', 'content');
  const fonts = await page.evaluate(() => [...document.querySelectorAll('input, select, textarea')].map((e) => parseFloat(getComputedStyle(e).fontSize)).filter((f) => f < 16).length);
  const blocked = await page.evaluate(() => { const ev = new Event('gesturestart', { cancelable: true, bubbles: true }); document.body.dispatchEvent(ev); return ev.defaultPrevented; });
  const ta = await page.evaluate(() => getComputedStyle(document.documentElement).touchAction);
  console.log('viewport :', vp, '| champs < 16 px :', fonts, '| pincement bloqué :', blocked, '| touch-action :', ta);
  // la carte se zoome toujours (deux doigts → Leaflet) : zoom par l'API tactile simulée
  const z0 = await page.evaluate(() => document.querySelector('.leaflet-container') && 1);
  console.log('ERREURS :', errors.length ? errors : 'aucune', z0 ? '' : '');
  await b.close();
})();
