// Parcours terrain : tutoriel, boussole (GPS simulé qui se déplace), recherche, exports, date EXIF.
const { chromium, devices } = require('playwright');
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

  // 2. Boussole : à ~500 m au nord du coin, puis on se rapproche
  await page.locator('.spot-item', { hasText: 'Pinède' }).click();
  await page.click('#spot-compass');
  await page.waitForFunction(() => /m$/.test(document.querySelector('#compass-dist').textContent));
  console.log('boussole :', await page.textContent('#compass-dist'), '|', await page.textContent('#compass-dir'), '|', await page.textContent('#compass-acc'));
  await page.waitForTimeout(500);
  console.log('dialogue :', JSON.stringify(await page.evaluate(() => { const d = document.querySelector('#dlg-compass'); const r = d.getBoundingClientRect(); return { top: r.top, h: r.height, sh: d.scrollHeight, st: d.scrollTop, vh: innerHeight, sy: scrollY }; })));
  await page.locator('#dlg-compass').screenshot({ path: `${OUT}/61-boussole.png` });
  await ctx.setGeolocation({ latitude: 43.30005, longitude: 5.50003, accuracy: 6 });
  await page.waitForFunction(() => document.querySelector('#compass-dist').textContent.includes('Tu y es'), null, { timeout: 10000 });
  console.log('arrivée :', await page.textContent('#compass-dist'));
  // boussole du téléphone simulée : cap 90° (est) → la flèche vers le sud doit tourner de 180 - 90 = 90°
  await ctx.setGeolocation({ latitude: 43.3045, longitude: 5.5000, accuracy: 8 });
  await page.waitForFunction(() => /m$/.test(document.querySelector('#compass-dist').textContent));
  const btnVisible = await page.isVisible('#compass-enable');
  console.log('bouton « Activer la boussole » visible :', btnVisible, '| requestPermission :', await page.evaluate(() => typeof DeviceOrientationEvent.requestPermission));
  if (btnVisible) { await page.click('#compass-enable'); await page.waitForTimeout(300); }
  await page.evaluate(() => { const e = new Event('deviceorientationabsolute'); Object.assign(e, { absolute: true, alpha: 270 }); window.dispatchEvent(e); });
  await page.waitForTimeout(300);
  console.log('debug :', await page.evaluate(() => [document.querySelector('.compass').className, document.querySelector('#compass-dir').textContent]));
  console.log('flèche avec boussole (cap est) :', await page.evaluate(() => document.querySelector('#compass-arrow').style.transform));
  await page.click('#dlg-compass .js-close');
  await page.click('#dlg-spot .js-close');

  // 3. Recherche
  await page.click('#peek'); await page.waitForTimeout(300);
  for (const q of ['barriere', 'ENORME', 'morille', 'cèpe', 'introuvable']) {
    await page.fill('#search', q);
    console.log(`recherche « ${q} » :`, await page.locator('.spot-item .title').allTextContents());
  }
  await page.fill('#search', '');

  // 4. Exports
  await page.evaluate(() => scrollTo(0, 0));
  await page.click('#menu-btn');
  const [g] = await Promise.all([page.waitForEvent('download'), page.click('#export-gpx')]);
  const gpx = fs.readFileSync(await g.path(), 'utf8');
  console.log('GPX :', g.suggestedFilename(), '| points :', (gpx.match(/<wpt /g) || []).length, '| nom échappé :', gpx.includes('<name>Pinède du Vallon</name>'));
  await page.click('#menu-btn');
  const [c] = await Promise.all([page.waitForEvent('download'), page.click('#export-csv')]);
  const csv = fs.readFileSync(await c.path(), 'utf8');
  console.log('CSV :', c.suggestedFilename(), '|', JSON.stringify(csv.split('\r\n').slice(0, 2)));

  // 5. Date reprise de la photo
  await page.locator('.spot-item', { hasText: 'Pinède' }).click().catch(async () => { await page.click('#peek'); await page.locator('.spot-item', { hasText: 'Pinède' }).click(); });
  await page.click('#find-add summary');
  await page.setInputFiles('#find-photos', DATEJPG);
  await page.waitForFunction(() => document.querySelector('#find-date').value !== new Date().toISOString().slice(0, 10), null, { timeout: 5000 }).catch(() => {});
  console.log('date de la trouvaille :', await page.inputValue('#find-date'));
  console.log('ERREURS :', errors.length ? errors : 'aucune');
  await b.close();
})();
