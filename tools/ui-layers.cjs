// Vérifie les fonds de carte (tuiles réellement chargées) et le calque des massifs.
const { chromium, devices } = require('playwright');
const [, , SITE, OUT] = process.argv;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  const page = await ctx.newPage();
  await page.route('https://vvegujltsjgwszeloyaz.supabase.co/**', (r) => {
    const u = new URL(r.request().url()).pathname;
    const body = u.includes('champi_allowed') ? [{ email: 'x' }] : u.includes('champi_profiles') ? { id: 'u', display_name: 'Enzo' } : [];
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.addInitScript(() => {
    localStorage.setItem('champi-tuto', '3'); localStorage.setItem('sb-vvegujltsjgwszeloyaz-auth-token', JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 99999, user: { id: 'u', email: 'x@y.fr' } }));
    localStorage.setItem('champi-massifs', '1');
  });
  const tiles = {};
  page.on('response', (r) => { const u = r.url(); const k = u.includes('PLANIGNV2') ? 'plan' : u.includes('ORTHOPHOTOS') ? 'ortho' : u.includes('opentopomap') ? 'otm' : null; if (k) { tiles[k] = tiles[k] || { ok: 0, ko: 0 }; tiles[k][r.ok() ? 'ok' : 'ko']++; } });
  await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])'); await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/11-massifs.png` });
  for (const [label, file] of [['ortho', '12-photos'], ['otm', '13-opentopomap'], ['plan', '14-plan']]) {
    await page.tap('#menu-btn'); await page.tap(`#base-seg [data-base=${label}]`); await page.tap('#menu-btn');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}/${file}.png` });
  }
  console.log('tuiles :', JSON.stringify(tiles));
  console.log('attribution :', await page.textContent('.leaflet-control-attribution'));
  // zoom sur la forêt relique
  await page.evaluate(() => {});
  await b.close();
})();
