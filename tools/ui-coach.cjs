// Parcours visite guidée (bulles pointées sur chaque bouton), bouton 🔄 Actualiser, exports dans « Mon profil ».
const { chromium, devices } = require('playwright');
const fakeMeteo = require('./fake-meteo.cjs');
const [, , SITE, OUT, DEV] = process.argv;
const REF = 'vvegujltsjgwszeloyaz', ME = '11111111-1111-1111-1111-111111111111';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices[DEV || 'iPhone 13'], locale: 'fr-FR', acceptDownloads: true });
  const page = await ctx.newPage();
  await fakeMeteo(page);
  const errors = []; let loads = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(`https://${REF}.supabase.co/**`, (route) => {
    const u = new URL(route.request().url()); const t = u.pathname.replace('/rest/v1/', '');
    if (t === 'champi_spots') loads++;
    const obj = (route.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    const body = { champi_allowed_emails: [{ email: 'x', label: 'Enzo' }], champi_profiles: [{ id: ME, display_name: 'Enzo' }] }[t] ?? (u.pathname.startsWith('/functions/') ? { depts: {} } : []);
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj ? body[0] ?? null : body) });
  });
  await page.addInitScript(([ref, me]) => {
    localStorage.setItem('champi-view', JSON.stringify({ lat: 43.4, lon: 5.6, zoom: 10 }));
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 9999999, user: { id: me, email: 'x@y.fr' } }));
  }, [REF, ME]);
  await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])');
  await page.waitForSelector('#coach:not([hidden])', { timeout: 5000 });
  const steps = [];
  for (let i = 0; i < 13; i++) {
    await page.waitForTimeout(350);
    const info = await page.evaluate(() => {
      const bub = document.querySelector('#coach-bubble').getBoundingClientRect(), hole = document.querySelector('#coach-hole');
      const h = hole.hidden ? null : hole.getBoundingClientRect(), a = document.querySelector('#coach-arrow');
      const ar = a.hidden ? null : a.getBoundingClientRect();
      const inside = bub.left >= 0 && bub.right <= innerWidth && bub.top >= 0 && bub.bottom <= innerHeight;
      // la flèche touche-t-elle le trou (le bouton visé) ? écart en px entre la pointe et le bord du trou
      let gap = null;
      if (h && ar) { const ax = ar.left + ar.width / 2, ay = ar.top + ar.height / 2; const dx = Math.max(h.left - ax, 0, ax - h.right), dy = Math.max(h.top - ay, 0, ay - h.bottom); gap = Math.round(Math.hypot(dx, dy)); }
      return { titre: document.querySelector('#coach-text b').textContent, dans_ecran: inside, fleche_vers_bouton_px: gap, sens: a.className.replace('coach-arrow', '').trim() || '—' };
    });
    steps.push(info);
    if ([2, 3, 4].includes(i)) await page.screenshot({ path: `${OUT}/c${i + 1}.png` });
    await page.click('#coach-next');
  }
  console.log(steps.map((s, i) => `${i + 1}. ${s.titre} · bulle dans l'écran : ${s.dans_ecran} · flèche ${s.sens} à ${s.fleche_vers_bouton_px ?? '—'} px du bouton`).join('\n'));
  console.log('visite terminée :', await page.isHidden('#coach'), '| mémorisée :', await page.evaluate(() => localStorage.getItem('champi-tuto')));
  // Menu : 🔄 et plus d'exports
  await page.click('#menu-btn');
  console.log('menu · exports visibles :', await page.locator('#menu #export-gpx').count(), '| 🔄 présent :', await page.isVisible('#refresh-btn'));
  await page.screenshot({ path: `${OUT}/c-menu.png` });
  const before = loads; await page.click('#refresh-btn'); await page.waitForTimeout(1500);
  console.log('🔄 → données rechargées :', loads > before, '| message :', await page.textContent('#toast'));
  await page.click('#menu-btn').catch(() => {}); await page.click('#menu-btn').catch(() => {});
  if (await page.isHidden('#menu')) await page.click('#menu-btn');
  await page.click('#profile-btn'); await page.click('#dlg-profile details.more summary');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export-gpx')]);
  console.log('profil → export GPX :', dl.suggestedFilename());
  console.log('ERREURS :', errors.length ? errors : 'aucune');
  await b.close();
})();
