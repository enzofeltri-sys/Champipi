// Faire glisser le doigt sur le menu ne doit faire bouger ni la carte ni la page (vrais évènements tactiles).
const { chromium, devices } = require('playwright');
const fakeMeteo = require('./fake-meteo.cjs');
const [, , SITE, DEV] = process.argv;
const REF = 'vvegujltsjgwszeloyaz', ME = '11111111-1111-1111-1111-111111111111';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices[DEV || 'iPhone SE'], locale: 'fr-FR' });
  const page = await ctx.newPage(); await fakeMeteo(page);
  await page.route(`https://${REF}.supabase.co/**`, (route) => {
    const u = new URL(route.request().url()); const t = u.pathname.replace('/rest/v1/', '');
    const obj = (route.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    const body = { champi_allowed_emails: [{ email: 'x', label: 'Enzo' }], champi_profiles: [{ id: ME, display_name: 'Enzo' }] }[t] ?? (u.pathname.startsWith('/functions/') ? { depts: {} } : []);
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj ? body[0] ?? null : body) });
  });
  await page.addInitScript(([ref, me]) => {
    localStorage.setItem('champi-tuto', '3'); localStorage.setItem('champi-view', JSON.stringify({ lat: 43.4, lon: 5.6, zoom: 10 }));
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 9999999, user: { id: me, email: 'x@y.fr' } }));
  }, [REF, ME]);
  await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])'); await page.waitForTimeout(1200);
  await page.click('#menu-btn'); await page.waitForTimeout(300);
  const state = () => page.evaluate(() => ({ pane: document.querySelector('.leaflet-map-pane').style.transform, scrollY: window.scrollY, menuTop: document.querySelector('#menu').scrollTop, appTop: Math.round(document.querySelector('#screen-app').getBoundingClientRect().top) }));
  const before = await state();
  const cdp = await ctx.newCDPSession(page);
  const r = await page.locator('#menu').boundingBox();
  const x = r.x + r.width / 2;
  for (const [y0, y1] of [[r.y + r.height * 0.8, r.y + r.height * 0.2], [r.y + r.height * 0.2, r.y + r.height * 0.9]]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
    for (let k = 1; k <= 10; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * k) / 10 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(400);
  }
  const after = await state();
  console.log('avant :', JSON.stringify(before)); console.log('après :', JSON.stringify(after));
  console.log('carte immobile :', before.pane === after.pane, '| page immobile :', after.scrollY === 0 && after.appTop === 0);
  await b.close();
})();
