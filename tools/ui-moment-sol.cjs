// Carte « bon moment » et sol : à Grans (calcaire) la girolle reste affichée mais pas en vert (une couleur en dessous),
// dans les Maures (acide) elle est en vert ; le lactaire sanguin n'apparaît pas dans les Maures. Météo simulée : bien arrosée partout.
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
    const one = (lat) => ({ daily: { time: days, precipitation_sum: days.map((_, i) => (i === 6 ? 25 : i === 9 ? 8 : 0)), temperature_2m_max: days.map(() => 16), temperature_2m_min: days.map(() => 7) } });
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(lats.length > 1 ? lats.map(one) : one(lats[0])) });
  });
  await page.route(`https://${REF}.supabase.co/**`, (route) => {
    const u = new URL(route.request().url()); const tb = u.pathname.replace('/rest/v1/', '');
    const obj = (route.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    const body = { champi_allowed_emails: [{ email: 'x', label: 'Enzo' }], champi_profiles: [{ id: ME, display_name: 'Enzo' }] }[tb] ?? (u.pathname.startsWith('/functions/') ? { depts: {} } : []);
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj ? body[0] ?? null : body) });
  });
  const count = () => page.evaluate(() => {
    const out = { vert: 0, jaune: 0, rouge: 0, autre: 0 };
    for (const c of document.querySelectorAll('.leaflet-tile-container canvas')) {
      const r = c.getBoundingClientRect(); if (r.bottom < 0 || r.top > window.innerHeight) continue;
      const d = c.getContext('2d').getImageData(0, 0, 256, 256).data;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) {
        const ref = { vert: [22, 163, 74], jaune: [234, 179, 8], rouge: [220, 38, 38], gris: [100, 116, 139], attente: [148, 163, 184] };
        let best = 'autre', bd = 1e9;
        for (const [n, c] of Object.entries(ref)) { const dd = Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]); if (dd < bd) { bd = dd; best = n; } }
        out[best] = (out[best] ?? 0) + 1;
      }
    }
    return out;
  });
  async function look(lat, lon, chip, label) {
    await page.evaluate(([la, lo]) => localStorage.setItem('champi-view', JSON.stringify({ lat: la, lon: lo, zoom: 12 })), [lat, lon]);
    await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])'); await page.waitForTimeout(1000);
    await page.locator('.sp-chip', { hasText: chip }).first().click();
    await page.waitForTimeout(7000);
    const n = await count();
    console.log(`${label} · ${chip} :`, JSON.stringify(n));
    await page.screenshot({ path: `${OUT}/s-${label.split(' ')[0].toLowerCase()}-${chip.toLowerCase()}.png` });
    await page.locator('.sp-chip.on').first().click(); await page.waitForTimeout(300);
    return n;
  }
  await page.addInitScript(([ref, me]) => {
    localStorage.setItem('champi-tuto', '3');
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 9999999, user: { id: me, email: 'x@y.fr' } }));
  }, [REF, ME]);
  await page.goto(SITE);
  const g1 = await look(43.64, 5.10, 'Girolle', 'Grans (calcaire)');
  const g2 = await look(43.27, 6.30, 'Girolle', 'Maures (acide)');
  const l2 = await look(43.15, 6.30, 'Lactaire', 'Maures-sud (acide)');
  console.log('résultat : girolle Grans', g1.jaune > 0 && g1.vert < g1.jaune / 20 ? `jaune (vert seulement dans les poches neutres : ${Math.round(100 * g1.vert / (g1.vert + g1.jaune))} %) ✔` : '✘', '| girolle Maures', g2.vert > 0 ? 'verte ✔' : '✘', '| lactaire Maures', l2.vert + l2.jaune + l2.rouge === 0 ? 'absent ✔' : '✘ ' + JSON.stringify(l2));
  console.log('ERREURS :', errors.length ? errors : 'aucune');
  await b.close();
})();
