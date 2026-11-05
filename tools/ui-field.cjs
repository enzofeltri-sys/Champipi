// Parcours terrain : tutoriel, recherche, exports, date EXIF.
const { chromium, devices } = require('playwright');
const { closeDialogs, openList, openSpot, setScope, pickSpecies, addAtCenter } = require('./ui-helpers.cjs');
const fakeMeteo = require('./fake-meteo.cjs');
const fs = require('fs');
const [, , SITE, OUT, DATEJPG] = process.argv;
const REF = 'vvegujltsjgwszeloyaz';
const ME = '11111111-1111-1111-1111-111111111111';
const spots = [
  { id: 's1', owner: ME, visibility: 'private', name: 'Pinède du Vallon', lat: 43.3000, lon: 5.5000, species: ['cepe'], trees: [], note: 'Après la barrière DFCI', created_at: '2026-09-01T00:00:00Z' },
  { id: 's2', owner: ME, visibility: 'family', name: 'Clairière', lat: 43.5, lon: 5.6, species: [], trees: [], note: null, created_at: '2026-09-02T00:00:00Z' },
];
const finds = [{ id: 'f1', spot_id: 's2', user_id: ME, found_on: '2026-10-01', species: ['morille'], note: 'Énorme récolte; "panier"', created_at: '2026-10-01T00:00:00Z' }];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'fr-FR', acceptDownloads: true, geolocation: { latitude: 43.3045, longitude: 5.5000, accuracy: 8 }, permissions: ['geolocation', 'accelerometer', 'gyroscope', 'magnetometer'] });
  const page = await ctx.newPage();
  await fakeMeteo(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => { if (r.status() === 429) console.log('429 :', r.url().slice(0, 90)); });
  page.on('console', (m) => { if (m.type() === 'error' && !/open-meteo|CORS|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.route(`https://${REF}.supabase.co/**`, (route) => {
    const u = new URL(route.request().url()); const t = u.pathname.replace('/rest/v1/', '');
    const obj = (route.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    const body = { champi_allowed_emails: [{ email: 'x', label: 'Enzo' }], champi_profiles: [{ id: ME, display_name: 'Enzo' }], champi_spots: spots.map((s) => ({ ...s, author: { display_name: 'Enzo' } })), champi_finds: finds.map((f) => ({ ...f, author: { display_name: 'Enzo' } })) }[t] ?? [];
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj ? body[0] ?? null : body) });
  });
  await page.addInitScript(([ref, me]) => {
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 99999, user: { id: me, email: 'x@y.fr' } }));
  }, [REF, ME]);
  await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])');

  // 1. Tutoriel à la première ouverture
  await page.waitForSelector('#dlg-tuto[open]');
  const titles = [];
  for (let i = 0; i < 6; i++) { titles.push(await page.textContent('#tuto-body h2')); if (i === 1) await page.screenshot({ path: `${OUT}/60-tuto.png` }); await page.click('#tuto-next'); }
  console.log('tutoriel :', titles.join(' → '), '| fermé :', !(await page.isVisible('#dlg-tuto')), '| mémorisé :', await page.evaluate(() => localStorage.getItem('champi-tuto')));

  // 3. Recherche
  await openList(page);
  for (const q of ['barriere', 'ENORME', 'morille', 'cèpe', 'introuvable']) {
    await page.fill('#search', q);
    console.log(`recherche « ${q} » :`, await page.locator('.spot-item .title').allTextContents());
  }
  await page.fill('#search', '');

  // 4. Exports
  await closeDialogs(page);
  await page.click('#menu-btn');
  const [g] = await Promise.all([page.waitForEvent('download'), page.click('#export-gpx')]);
  const gpx = fs.readFileSync(await g.path(), 'utf8');
  console.log('GPX :', g.suggestedFilename(), '| points :', (gpx.match(/<wpt /g) || []).length, '| nom échappé :', gpx.includes('<name>Pinède du Vallon</name>'));
  await page.click('#menu-btn');
  const [c] = await Promise.all([page.waitForEvent('download'), page.click('#export-csv')]);
  const csv = fs.readFileSync(await c.path(), 'utf8');
  console.log('CSV :', c.suggestedFilename(), '|', JSON.stringify(csv.split('\r\n').slice(0, 2)));

  // 5. Date reprise de la photo
  await openSpot(page, 'Pinède', { more: false });
  await page.click('#find-add summary');
  await page.setInputFiles('#find-photos', DATEJPG);
  await page.waitForFunction(() => document.querySelector('#find-date').value !== new Date().toISOString().slice(0, 10), null, { timeout: 5000 }).catch(() => {});
  console.log('date de la trouvaille :', await page.inputValue('#find-date'));
  console.log('ERREURS :', errors.length ? errors : 'aucune');
  await b.close();
})();
