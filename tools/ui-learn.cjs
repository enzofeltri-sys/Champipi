// Parcours apprentissage : bilan du coin et « Ton expérience » avec la vraie archive Open-Meteo.
const { chromium, devices } = require('playwright');
const fakeMeteo = require('./fake-meteo.cjs');
const [, , SITE, OUT] = process.argv;
const REF = 'vvegujltsjgwszeloyaz';
const ME = '11111111-1111-1111-1111-111111111111';
const spot = { id: 'sb', owner: ME, visibility: 'private', name: 'Hêtraie de la Sainte-Baume', lat: 43.318, lon: 5.765, species: ['cepe'], trees: ['hetre'], note: null, created_at: '2024-09-01T00:00:00Z' };
const finds = ['2024-10-28', '2024-11-08', '2025-10-25', '2025-11-12'].map((d, i) => ({ id: 'f' + i, spot_id: 'sb', user_id: ME, found_on: d, species: i === 1 ? ['cepe', 'trompette'] : ['cepe'], note: null, created_at: d + 'T10:00:00Z' }));
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  const page = await ctx.newPage();
  if (!process.env.FAKE_ARCHIVE) process.env.REAL_ARCHIVE = '1';
  await fakeMeteo(page);
  const errors = []; let archive = 0;
  if (process.env.FAKE_ARCHIVE) await page.route('https://archive-api.open-meteo.com/**', (route) => {
    const u = new URL(route.request().url()); const days = [];
    for (let d = new Date(u.searchParams.get('start_date') + 'T12:00:00Z'); d <= new Date(u.searchParams.get('end_date') + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ daily: { time: days, precipitation_sum: days.map((d) => (d.endsWith('-18') || d.endsWith('-30') ? 30 : 0)), temperature_2m_max: days.map(() => 17), temperature_2m_min: days.map(() => 8) } }) });
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => { if (r.url().includes('archive-api')) { archive++; if (!r.ok()) errors.push('archive ' + r.status()); } });
  await page.route(`https://${REF}.supabase.co/**`, (route) => {
    const u = new URL(route.request().url()); const t = u.pathname.replace('/rest/v1/', '');
    const obj = (route.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    const body = { champi_allowed_emails: [{ email: 'x', label: 'Enzo' }], champi_profiles: [{ id: ME, display_name: 'Enzo' }], champi_spots: [{ ...spot, author: { display_name: 'Enzo' } }], champi_finds: finds.map((f) => ({ ...f, author: { display_name: 'Enzo' } })) }[t] ?? (u.pathname.startsWith('/functions/') ? { depts: {} } : []);
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj && Array.isArray(body) ? body[0] ?? null : body) });
  });
  await page.addInitScript(([ref, me]) => {
    localStorage.setItem('champi-tuto', '1');
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 9999999, user: { id: me, email: 'x@y.fr' } }));
  }, [REF, ME]);
  await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])');
  await page.locator('.spot-item').click();
  await page.waitForFunction(() => /trouvailles \(/.test(document.querySelector('#spot-bilan')?.textContent || ''), null, { timeout: 30000 });
  console.log('bilan :', (await page.textContent('#spot-bilan')).replace(/\s+/g, ' ').trim());
  await page.waitForSelector('#spot-meteo .verdict', { timeout: 30000 });
  console.log('avis :', await page.textContent('#spot-meteo .verdict'), '|', (await page.locator('#spot-meteo .reasons li').allTextContents()).filter((r) => r.includes('expérience')));
  await page.locator('#spot-bilan').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/95-bilan.png` });
  // 2e ouverture : l'historique est mémorisé (pas de nouvel appel)
  const before = archive;
  await page.click('#dlg-spot .js-close'); await page.locator('.spot-item').click(); await page.waitForTimeout(1500);
  console.log('appels archive :', before, '→ après réouverture :', archive);
  console.log('ERREURS :', errors.length ? errors : 'aucune');
  await b.close();
})();
