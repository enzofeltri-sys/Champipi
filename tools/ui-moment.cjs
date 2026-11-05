// Parcours « bon moment sur la carte » : forêts du cèpe coloriées selon la météo de chaque case.
// Météo simulée : bien arrosé au sud de 43,40° N, sec au nord (on doit voir du vert en bas, du rouge en haut).
const { chromium, devices } = require('playwright');
const [, , SITE, OUT] = process.argv;
const REF = 'vvegujltsjgwszeloyaz', ME = '11111111-1111-1111-1111-111111111111';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  const page = await ctx.newPage();
  const errors = []; let meteoCalls = 0, points = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://api.open-meteo.com/**', (route) => {
    const u = new URL(route.request().url()); const lats = u.searchParams.get('latitude').split(',').map(Number);
    meteoCalls++; points += lats.length;
    const t = new Date(); const days = [];
    for (let i = -14; i <= 2; i++) { const d = new Date(t); d.setDate(d.getDate() + i); days.push(d.toISOString().slice(0, 10)); }
    const one = (lat) => ({ daily: { time: days, precipitation_sum: days.map((_, i) => (lat < 43.4 ? (i === 6 ? 25 : i === 9 ? 8 : 0) : 0)), temperature_2m_max: days.map(() => 16), temperature_2m_min: days.map(() => 7) } });
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(lats.length > 1 ? lats.map(one) : one(lats[0])) });
  });
  await page.route(`https://${REF}.supabase.co/**`, (route) => {
    const u = new URL(route.request().url()); const tb = u.pathname.replace('/rest/v1/', '');
    const obj = (route.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    const body = { champi_allowed_emails: [{ email: 'x', label: 'Enzo' }], champi_profiles: [{ id: ME, display_name: 'Enzo' }] }[tb] ?? (u.pathname.startsWith('/functions/') ? { depts: {} } : []);
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj ? body[0] ?? null : body) });
  });
  await page.addInitScript(([ref, me]) => {
    localStorage.setItem('champi-tuto', '1');
    localStorage.setItem('champi-view', JSON.stringify({ lat: 43.40, lon: 6.20, zoom: 10 }));
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 9999999, user: { id: me, email: 'x@y.fr' } }));
  }, [REF, ME]);
  await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])'); await page.waitForTimeout(1200);
  await page.locator('.sp-chip', { hasText: 'Cèpe' }).click();
  await page.waitForTimeout(6000);
  // Couleurs présentes sur les tuiles, par moitié d'écran
  const stats = await page.evaluate(() => {
    const out = { haut: {}, bas: {} }; const name = { '22,163,74': 'vert', '234,179,8': 'jaune', '220,38,38': 'rouge', '100,116,139': 'gris-hors', '148,163,184': 'gris-attente' };
    const mid = window.innerHeight / 2;
    for (const c of document.querySelectorAll('.leaflet-tile-container canvas')) {
      const r = c.getBoundingClientRect(); if (r.bottom < 0 || r.top > window.innerHeight) continue;
      const d = c.getContext('2d').getImageData(0, 0, 256, 256).data;
      for (let i = 0; i < d.length; i += 16) if (d[i + 3]) {
        const y = r.top + (Math.floor(i / 4 / 256) / 256) * r.height; let k = 'autre', best = 1e9;   // couleur la plus proche (la transparence arrondit un peu les valeurs)
        for (const [rgb, n] of Object.entries(name)) { const [a, b2, c2] = rgb.split(',').map(Number); const e = (d[i] - a) ** 2 + (d[i + 1] - b2) ** 2 + (d[i + 2] - c2) ** 2; if (e < best) { best = e; k = n; } }
        const h = y < mid ? out.haut : out.bas; h[k] = (h[k] ?? 0) + 1;
      }
    }
    return out;
  });
  console.log('couleurs (moitié haute = nord, sec) :', JSON.stringify(stats.haut));
  console.log('couleurs (moitié basse = sud, arrosé) :', JSON.stringify(stats.bas));
  console.log('appels météo :', meteoCalls, '| points :', points);
  console.log('bandeau :', (await page.textContent('#species-banner')).replace(/\s+/g, ' ').trim());
  await page.screenshot({ path: `${OUT}/m1-cepe-moment.png` });
  // Hors saison : morille (mars–mai) → forêts en gris, sans météo
  await page.locator('.sp-chip', { hasText: 'Cèpe' }).click();
  console.log('ERREURS :', errors.length ? errors : 'aucune');
  await b.close();
})();
