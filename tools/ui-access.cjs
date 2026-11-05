// Parcours « accès aux massifs » : hors saison (date réelle) et en été (horloge simulée au 10 août).
const { chromium, devices } = require('playwright');
const { closeDialogs, openList, openSpot, setScope, pickSpecies, addAtCenter } = require('./ui-helpers.cjs');
const fakeMeteo = require('./fake-meteo.cjs');
const [, , SITE, OUT] = process.argv;
const REF = 'vvegujltsjgwszeloyaz';
const ME = '11111111-1111-1111-1111-111111111111';
const spots = [
  { id: 'sb', owner: ME, visibility: 'private', name: 'Hêtraie de la Sainte-Baume', lat: 43.315, lon: 5.76, species: ['cepe'], trees: ['hetre'], note: null, created_at: '2026-09-01T00:00:00Z' },
  { id: 'sv', owner: ME, visibility: 'private', name: 'Pinède Sainte-Victoire', lat: 43.533, lon: 5.585, species: ['cepe'], trees: [], note: null, created_at: '2026-09-02T00:00:00Z' },
  { id: 'ville', owner: ME, visibility: 'private', name: 'Parc en ville', lat: 43.2965, lon: 5.3698, species: ['coulemelle'], trees: [], note: null, created_at: '2026-09-03T00:00:00Z' },
];
async function run(b, summer) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  const page = await ctx.newPage();
  if (summer) await page.clock.install({ time: new Date('2026-08-10T09:00:00+02:00') });
  await fakeMeteo(page);
  const errors = []; let calls = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(`https://${REF}.supabase.co/**`, (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/functions/v1/champi-acces') {
      calls++;
      const date = JSON.parse(route.request().postData() || '{}').date;
      const depts = summer ? { 4: null, 6: null, 13: { 1323: [1, 0] }, 83: { 832: [5, 0] }, 84: null } : { 4: null, 6: null, 13: null, 83: null, 84: null };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ date, depts }) });
    }
    const t = u.pathname.replace('/rest/v1/', '');
    const obj = (route.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    const body = { champi_allowed_emails: [{ email: 'x', label: 'Enzo' }], champi_profiles: [{ id: ME, display_name: 'Enzo' }], champi_spots: spots.map((s) => ({ ...s, author: { display_name: 'Enzo' } })) }[t] ?? [];
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj ? body[0] ?? null : body) });
  });
  await page.addInitScript(([ref, me]) => {
    localStorage.setItem('champi-tuto', '3');
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 9999999, user: { id: me, email: 'x@y.fr' } }));
  }, [REF, ME]);
  await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])');
  const label = summer ? 'ÉTÉ (10 août)' : 'AUJOURD\'HUI';
  for (const name of ['Hêtraie', 'Sainte-Victoire', 'Parc']) {
    await openSpot(page, name);
    await page.waitForTimeout(1200);
    const vis = await page.isVisible('#spot-access');
    console.log(`${label} · ${name} :`, vis ? (await page.textContent('#spot-access')).replace(/\s+/g, ' ').trim() : '(pas de ligne : hors massif)', '| classe :', await page.getAttribute('#spot-access', 'class'));
    if (summer && name === 'Hêtraie') await page.screenshot({ path: `${OUT}/70-acces-ferme.png` });
    await page.click('#dlg-spot .js-close');
  }
  await closeDialogs(page); await page.click('#menu-btn'); await page.click('#advisor-btn2');
  await page.waitForSelector('#advisor-body .rank', { timeout: 15000 });
  const txt = (await page.textContent('#advisor-body')).replace(/\s+/g, ' ');
  console.log(`${label} · conseiller :`, txt.match(/Accès aux massifs.*?(?=Tes coins)/)?.[0], '|', txt.match(/Tes coins.*/)?.[0].slice(0, 160));
  console.log(`${label} · appels au relais :`, calls, '| erreurs :', errors.length ? errors : 'aucune');
  await ctx.close();
}
(async () => { const b = await chromium.launch(); await run(b, false); await run(b, true); await b.close(); })();
