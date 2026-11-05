// Parcours « carte simplifiée » : pastilles champignon, forêts favorables (vraies tuiles IGN repeintes),
// coins filtrés par espèce, « ce que tu y as trouvé », boutons ronds, ajout au viseur.
const { chromium, devices } = require('playwright');
const fakeMeteo = require('./fake-meteo.cjs');
const [, , SITE, OUT] = process.argv;
const REF = 'vvegujltsjgwszeloyaz';
const ME = '11111111-1111-1111-1111-111111111111';
const spots = [
  { id: 'aaaaaaaa-0000-0000-0000-000000000001', owner: ME, visibility: 'private', name: 'Hêtraie Sainte-Baume', lat: 43.316, lon: 5.757, species: ['cepe'], trees: ['hetre'], note: null, created_at: '2026-09-01T00:00:00Z' },
  { id: 'aaaaaaaa-0000-0000-0000-000000000002', owner: ME, visibility: 'private', name: 'Pinède de Luminy', lat: 43.233, lon: 5.44, species: ['lactaire-sanguin'], trees: ['pin-alep'], note: null, created_at: '2026-09-02T00:00:00Z' },
  { id: 'aaaaaaaa-0000-0000-0000-000000000003', owner: ME, visibility: 'family', name: 'Clairière famille', lat: 43.36, lon: 5.62, species: [], trees: [], note: null, created_at: '2026-09-03T00:00:00Z' },
];
const finds = [
  { id: 'f1', spot_id: spots[0].id, user_id: ME, found_on: '2025-10-12', species: ['cepe'], created_at: '2025-10-12T10:00:00Z' },
  { id: 'f2', spot_id: spots[0].id, user_id: ME, found_on: '2025-11-02', species: ['cepe', 'trompette'], created_at: '2025-11-02T10:00:00Z' },
  { id: 'f3', spot_id: spots[1].id, user_id: ME, found_on: '2025-11-20', species: ['lactaire-sanguin'], created_at: '2025-11-20T10:00:00Z' },
];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'fr-FR', geolocation: { latitude: 43.3165, longitude: 5.7575, accuracy: 10 }, permissions: ['geolocation'] });
  const page = await ctx.newPage();
  await fakeMeteo(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(`https://${REF}.supabase.co/**`, (route) => {
    const u = new URL(route.request().url()); const t = u.pathname.replace('/rest/v1/', '');
    const obj = (route.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    const body = { champi_allowed_emails: [{ email: 'x', label: 'Enzo' }], champi_profiles: [{ id: ME, display_name: 'Enzo' }],
      champi_spots: spots.map((s) => ({ ...s, author: { display_name: 'Enzo' } })), champi_finds: finds.map((f) => ({ ...f, author: { display_name: 'Enzo' } })) }[t] ?? (u.pathname.startsWith('/functions/') ? { depts: {} } : []);
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj && Array.isArray(body) ? body[0] ?? null : body) });
  });
  await page.addInitScript(([ref, me]) => {
    localStorage.setItem('champi-tuto', '1');
    localStorage.setItem('champi-view', JSON.stringify({ lat: 43.3, lon: 5.62, zoom: 11 }));
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 9999999, user: { id: me, email: 'x@y.fr' } }));
  }, [REF, ME]);
  const pins = () => page.locator('.leaflet-marker-icon').count();

  await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])'); await page.waitForTimeout(1500);
  console.log('pastilles :', (await page.locator('.sp-chip').allTextContents()).slice(0, 6).join(' | '), '…');
  console.log('épingles (Tous) :', await pins(), '| bandeau visible :', await page.isVisible('#species-banner'));
  await page.screenshot({ path: `${OUT}/a1-carte.png` });

  // Cèpe
  await page.locator('.sp-chip', { hasText: 'Cèpe' }).click();
  await page.waitForTimeout(3500);
  const colored = await page.evaluate(() => [...document.querySelectorAll('.leaflet-tile-container canvas')].reduce((n, c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) k++; return n + (k > 0 ? 1 : 0); }, 0));
  console.log('CÈPE · épingles :', await pins(), '| tuiles forêt colorées :', colored);
  console.log('bandeau :', (await page.textContent('#species-banner')).replace(/\s+/g, ' ').trim().slice(0, 230));
  await page.screenshot({ path: `${OUT}/a2-cepe.png` });

  // Plusieurs espèces : Cèpe + Lactaire → les deux coins
  await page.locator('.sp-chip', { hasText: 'Lactaire' }).click(); await page.waitForTimeout(800);
  console.log('CÈPE + LACTAIRE · épingles :', await pins(), '| pastilles cochées :', (await page.locator('.sp-chip.on').allTextContents()).join(' | '));
  console.log('bandeau :', (await page.textContent('#species-banner')).replace(/\s+/g, ' ').trim().slice(0, 260));
  await page.screenshot({ path: `${OUT}/a2b-plusieurs.png` });
  // On retire le lactaire : retour au cèpe seul, toucher l'épingle
  await page.locator('.sp-chip', { hasText: 'Lactaire' }).click(); await page.waitForTimeout(500);
  console.log('CÈPE seul · épingles :', await pins());
  await page.locator('.leaflet-marker-icon').first().click();
  await page.waitForSelector('#dlg-spot[open]');
  console.log('fiche :', await page.textContent('#spot-name'), '| trouvé ici :', (await page.textContent('#spot-found')).replace(/\s+/g, ' ').trim(), '| surligné :', await page.locator('#spot-found .sp.match').count(), '| détails repliés :', !(await page.evaluate(() => document.querySelector('#spot-more').open)));
  await page.screenshot({ path: `${OUT}/a3-coin.png` });
  await page.click('#dlg-spot .js-close');

  // Boutons ronds
  await page.click('#rail-spots'); await page.waitForTimeout(300);
  console.log('⭐ masqué · épingles :', await pins(), '| mémorisé :', await page.evaluate(() => localStorage.getItem('champi-spots')));
  await page.click('#rail-spots');
  await page.click('#rail-locate'); await page.waitForTimeout(800);
  console.log('📍 point bleu :', await page.locator('.loc-dot').count());

  // Ajout au viseur
  await page.click('#btn-add');
  console.log('viseur :', await page.isVisible('#crosshair'), '| bas caché :', !(await page.isVisible('#btn-add')));
  await page.screenshot({ path: `${OUT}/a4-viseur.png` });
  const center = await page.evaluate(() => { const r = document.querySelector('#map').getBoundingClientRect(); return [r.width / 2, r.height / 2]; });
  await page.click('#add-here');
  await page.waitForSelector('#dlg-edit[open]');
  console.log('fiche nouveau coin, position :', await page.textContent('#edit-coords'));
  await page.click('#edit-form [value=cancel] >> nth=1');
  console.log('après annulation · bouton + visible :', await page.isVisible('#btn-add'));

  // Tous
  await page.locator('.sp-chip', { hasText: 'Tous' }).click(); await page.waitForTimeout(400);
  console.log('TOUS · épingles :', await pins(), '| bandeau :', await page.isVisible('#species-banner'), '| calque forêts :', await page.locator('.leaflet-tile-container canvas').count());
  // Liste
  await page.click('#menu-btn'); await page.click('#list-btn');
  console.log('liste :', await page.locator('.spot-item .title').allTextContents());
  console.log('ERREURS :', errors.length ? errors : 'aucune');
  await b.close();
})();
