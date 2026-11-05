// Parcours « 🌱 Qu'est-ce qui pousse ici ? » (vrais services IGN : forêt, sol, altitude ; météo simulée),
// cases des alertes, filtres abaissés.
const { chromium, devices } = require('playwright');
const fakeMeteo = require('./fake-meteo.cjs');
const { closeDialogs } = require('./ui-helpers.cjs');
const [, , SITE, OUT] = process.argv;
const REF = 'vvegujltsjgwszeloyaz';
const ME = '11111111-1111-1111-1111-111111111111';
const db = { profiles: [{ id: ME, display_name: 'Enzo', avatar_emoji: null, avatar_color: null, notify_pousse: true, notify_news: true }], patches: [] };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'fr-FR', permissions: ['geolocation'], geolocation: { latitude: 43.25, longitude: 5.52 } });
  const page = await ctx.newPage();
  await fakeMeteo(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => { if (r.url().includes('geopf') && !r.url().includes('/tms/') && !r.url().includes('/wmts') && r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 90)}`); });
  await page.route(`https://${REF}.supabase.co/**`, (route) => {
    const req = route.request(); const u = new URL(req.url()); const t = u.pathname.replace('/rest/v1/', '');
    const obj = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const send = (body, st = 200) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(obj && Array.isArray(body) ? body[0] ?? null : body) });
    if (t === 'champi_profiles' && req.method() === 'PATCH') { const p = JSON.parse(req.postData()); db.patches.push(p); Object.assign(db.profiles[0], p); return send([db.profiles[0]]); }
    if (t === 'champi_profiles') return send(db.profiles);
    const days = []; for (let i = 1; i <= 14; i++) days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
    const rain = days.map((day, i) => ({ station_id: 'MRS', day, rr: i === 3 ? 31 : 0 }));   // une station près de Marseille : 31 mm il y a 4 j
    if (t === 'champi_rain_daily' && Number(u.searchParams.get('offset') || 0) > 0) return send([]);
    if (t === 'champi_meteo_grid') {   // grille du serveur : une case sur les Maures avec le sol (0–7 cm)
      const time = []; for (let i = -14; i <= 2; i++) time.push(new Date(Date.now() + i * 86400000).toISOString().slice(0, 10));
      return send([{ key: '433:63', elevation: 380, updated_at: new Date().toISOString(), daily: { time,
        precipitation_sum: time.map((_, i) => (i === 6 ? 26 : 0)), temperature_2m_max: time.map(() => 17), temperature_2m_min: time.map(() => 8),
        soil_temperature_0_to_7cm_mean: time.map(() => 14.5), soil_moisture_0_to_7cm_mean: time.map(() => 0.36) } }]);
    }
    const body = { champi_allowed_emails: [{ email: 'x', label: 'Enzo' }], champi_rain_stations: [{ id: 'MRS', name: 'MARSEILLE-TEST', lat: 43.26, lon: 5.50 }], champi_rain_daily: rain }[t] ?? (u.pathname.startsWith('/functions/') ? { depts: {} } : []);
    send(body);
  });
  await page.addInitScript(([ref, me]) => {
    localStorage.setItem('champi-tuto', '2');
    localStorage.setItem('champi-view', JSON.stringify({ lat: 43.25, lon: 5.52, zoom: 14 }));
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 9999999, user: { id: me, email: 'x@y.fr' } }));
  }, [REF, ME]);
  await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])'); await page.waitForTimeout(1500);
  const box = async (sel) => { const r = await page.locator(sel).boundingBox(); return r ? Math.round(r.y) : null; };
  console.log('haut des filtres :', await box('#species-bar'), 'px · rail :', await box('.rail'), 'px · bouton 🌱 :', await box('#rail-here'), 'px');
  await page.screenshot({ path: `${OUT}/h1-carte.png` });

  const analyse = async (lat, lon, shot) => {
    await ctx.setGeolocation({ latitude: lat, longitude: lon });
    await page.click('#rail-here');
    if (shot) await page.screenshot({ path: `${OUT}/h2-viseur.png` });
    await page.evaluate(() => { document.querySelector('#here-body').textContent = 'Analyse en cours'; });
    await page.click('#here-locate');
    await page.waitForFunction(() => !document.querySelector('#here-body').textContent.includes('Analyse en cours'), null, { timeout: 40000 });
    const place = (await page.textContent('#here-body .here-place')).replace(/\s+/g, ' ').trim();
    const sp = await page.$$eval('#here-body .here-sp', (els) => els.map((e) => e.querySelector('.head').textContent.replace(/\s+/g, ' ').trim()));
    return { place, sp };
  };
  const r1 = await analyse(43.25, 5.52, true);
  console.log('\n[Pinède d\'Alep, Marseille]', r1.place, '\n  →', r1.sp.join(' | '));
  await page.screenshot({ path: `${OUT}/h3-resultat.png` });
  await page.locator('#here-body .here-sp').first().screenshot({ path: `${OUT}/h3b-carte-espece.png` }).catch(() => {});
  // « Voir ses forêts » : pastille choisie
  await page.click('#here-body [data-here-sp]');
  await page.waitForTimeout(800);
  console.log('après « Voir ses forêts » : pastille =', (await page.textContent('.sp-chip.on')).trim(), '· dialogue ouvert :', await page.evaluate(() => document.querySelector('#dlg-here').open));
  await page.click('.sp-chip[data-sp=""]');

  const r2 = await analyse(43.30, 6.33);
  console.log('\n[Pin maritime, Maures]', r2.place, '\n  →', r2.sp.join(' | '));
  await page.screenshot({ path: `${OUT}/h4-maures.png` });
  await closeDialogs(page);
  const r3 = await analyse(43.37, 5.42);
  console.log('\n[Lande, Étoile]', r3.place, '\n  →', r3.sp.join(' | ') || '(aucun)');
  await closeDialogs(page);

  // Alertes : deux cases enregistrées dans le profil
  await page.click('#menu-btn'); await page.click('#alerts-btn');
  console.log('\ncases :', await page.isChecked('#notify-pousse'), await page.isChecked('#notify-news'));
  await page.click('#notify-news'); await page.waitForTimeout(600);
  console.log('après décocher « Nouvelles » :', JSON.stringify(db.patches), '·', await page.textContent('#alerts-msg'));
  await page.screenshot({ path: `${OUT}/h5-alertes.png` });
  console.log('\nERREURS :', errors.length ? errors : 'aucune');
  await b.close();
})();
