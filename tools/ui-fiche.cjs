// Parcours fiche détaillée : guide → toucher une espèce → fiche ; 📖 du bandeau → fiche ; « Voir ses forêts ».
const { chromium, devices } = require('playwright');
const fakeMeteo = require('./fake-meteo.cjs');
const [, , SITE, OUT] = process.argv;
const REF = 'vvegujltsjgwszeloyaz', ME = '11111111-1111-1111-1111-111111111111';
const S1 = 'aaaaaaaa-0000-0000-0000-000000000001';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  const page = await ctx.newPage();
  await fakeMeteo(page);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.route(`https://${REF}.supabase.co/**`, (route) => {
    const u = new URL(route.request().url()); const t = u.pathname.replace('/rest/v1/', '');
    const obj = (route.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    const body = { champi_allowed_emails: [{ email: 'x', label: 'Enzo' }], champi_profiles: [{ id: ME, display_name: 'Enzo' }],
      champi_spots: [{ id: S1, owner: ME, visibility: 'private', name: 'Châtaigneraie', lat: 43.24, lon: 6.31, species: ['cepe'], trees: ['chataignier'], created_at: '2026-01-01', author: {} }],
      champi_finds: [{ id: 'f1', spot_id: S1, user_id: ME, found_on: '2025-10-14', species: ['cepe'], created_at: '2025-10-14T10:00:00Z', author: {} }, { id: 'f2', spot_id: S1, user_id: ME, found_on: '2025-11-03', species: ['cepe'], created_at: '2025-11-03T10:00:00Z', author: {} }] }[t] ?? (u.pathname.startsWith('/functions/') ? { depts: {} } : []);
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj ? body[0] ?? null : body) });
  });
  await page.addInitScript(([ref, me]) => {
    localStorage.setItem('champi-tuto', '1'); localStorage.setItem('champi-view', JSON.stringify({ lat: 43.3, lon: 6.2, zoom: 10 }));
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 9999999, user: { id: me, email: 'x@y.fr' } }));
  }, [REF, ME]);
  await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])'); await page.waitForTimeout(1200);
  await page.click('#menu-btn'); await page.click('#guide-btn');
  console.log('guide : boutons « En savoir plus » :', await page.locator('.guide-more').count(), '| mois « si doux » marqués :', await page.locator('#guide-body .months span.late').count());
  await page.screenshot({ path: `${OUT}/g1-guide.png` });
  await page.click('#guide-cepe');
  await page.waitForSelector('#dlg-fiche[open]');
  console.log('fiche :', await page.textContent('#fiche-title'), '| rubriques :', (await page.locator('#fiche-body h3').allTextContents()).join(' · '));
  console.log('saison :', (await page.textContent('#fiche-body > p.small')).trim());
  console.log('sosies :', (await page.locator('.fiche-looks li b').allTextContents()).join(' | '));
  console.log('famille :', (await page.locator('#fiche-body h3:has-text("famille") + p').textContent()).trim());
  await page.screenshot({ path: `${OUT}/g2-fiche.png`, fullPage: false });
  await page.locator('#fiche-body').evaluate((el) => el.closest('dialog').scrollTo(0, 99999));
  await page.screenshot({ path: `${OUT}/g3-fiche-bas.png` });
  await page.click('[data-fiche-map]'); await page.waitForTimeout(800);
  console.log('Voir ses forêts → pastille :', (await page.textContent('.sp-chip.on')).trim(), '| fenêtres fermées :', await page.evaluate(() => !document.querySelector('dialog[open]')));
  await page.click('#species-banner [data-banner=guide]'); await page.waitForSelector('#dlg-fiche[open]');
  console.log('📖 du bandeau → fiche :', await page.textContent('#fiche-title'));
  console.log('ERREURS :', errors.length ? errors : 'aucune');
  await b.close();
})();
