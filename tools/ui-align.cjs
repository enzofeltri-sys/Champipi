// Captures d'alignement (iPhone, mode sombre) : carte, pluie, ajout d'un coin, « Ici ? ».
// Mesure les bords gauche / droit de chaque élément : ils doivent tous tomber sur la même marge.
const { chromium, devices } = require('playwright');
const fakeMeteo = require('./fake-meteo.cjs');
const [, , SITE, OUT] = process.argv;
const REF = 'vvegujltsjgwszeloyaz', ME = '11111111-1111-1111-1111-111111111111';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'fr-FR', colorScheme: 'dark' });
  const page = await ctx.newPage();
  await fakeMeteo(page);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.route(`https://${REF}.supabase.co/**`, (route) => {
    const u = new URL(route.request().url()); const t = u.pathname.replace('/rest/v1/', '');
    const obj = (route.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    const body = { champi_allowed_emails: [{ email: 'x', label: 'Enzo' }], champi_profiles: [{ id: ME, display_name: 'Enzo' }],
      champi_spots: [{ id: 's1', owner: ME, visibility: 'private', name: 'Coin', lat: 43.33, lon: 5.75, species: ['cepe'], trees: [], created_at: '2026-01-01' }] }[t] ?? (u.pathname.startsWith('/functions/') ? { depts: {} } : []);
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj ? body[0] ?? null : body) });
  });
  await page.addInitScript(([ref, me]) => {
    localStorage.setItem('champi-tuto', '1'); localStorage.setItem('champi-view', JSON.stringify({ lat: 43.45, lon: 5.6, zoom: 9 }));
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 9999999, user: { id: me, email: 'x@y.fr' } }));
  }, [REF, ME]);
  await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])'); await page.waitForTimeout(1500);
  const W = page.viewportSize().width;
  const edges = async (sels) => {
    const out = {};
    for (const s of sels) { const r = await page.locator(s).first().boundingBox().catch(() => null); if (r) out[s] = `g ${Math.round(r.x)} · d ${Math.round(W - r.x - r.width)} · haut ${Math.round(r.y)} · h ${Math.round(r.height)}`; }
    return out;
  };
  await page.click('#rail-rain'); await page.waitForTimeout(1500);
  console.log('CARTE', JSON.stringify(await edges(['.topbar', '.sp-chip', '#menu-btn', '.leaflet-control-scale', '.legend', '.rail', '#btn-add', '.leaflet-control-attribution']), null, 1));
  await page.screenshot({ path: `${OUT}/al1-carte.png` });
  await page.click('#btn-add'); await page.waitForTimeout(600);
  console.log('AJOUT', JSON.stringify(await edges(['#add-bar', '#add-locate', '#add-bar label.btn', '#add-cancel', '#add-here']), null, 1));
  await page.screenshot({ path: `${OUT}/al2-ajout.png` });
  await page.click('#add-cancel');
  await page.click('#rail-here'); await page.waitForTimeout(400);
  console.log('ICI', JSON.stringify(await edges(['#here-bar', '#here-locate', '#here-cancel', '#here-go']), null, 1));
  await page.screenshot({ path: `${OUT}/al3-ici.png` });
  console.log('ERREURS :', errors.length ? errors : 'aucune');
  await b.close();
})();
