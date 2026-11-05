// Parcours alertes : écran, abonnement (selon le navigateur), réception d'une notification simulée, lien direct.
const { chromium, devices } = require('playwright');
const fakeMeteo = require('./fake-meteo.cjs');
const [, , SITE, OUT] = process.argv;
const REF = 'vvegujltsjgwszeloyaz';
const ME = '11111111-1111-1111-1111-111111111111';
const SPOT = 'aaaaaaaa-1111-2222-3333-444444444444';
(async () => {
  const b = await chromium.launch({ channel: 'chromium' });   // navigateur complet sans écran : gère les notifications
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'fr-FR', permissions: ['notifications'] });
  const page = await ctx.newPage();
  await fakeMeteo(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(`https://${REF}.supabase.co/**`, (route) => {
    const u = new URL(route.request().url()); const t = u.pathname.replace('/rest/v1/', '');
    const obj = (route.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    if (u.pathname === '/functions/v1/champi-alertes') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ publicKey: 'BEE2ig14wWr32QCaPD66HFTt0fcWukW2tKs8feTaYXuCalQxAIftiT12l5k3O4n1f7dIihuz9WA2YLw3NMxaIl0' }) });
    const body = { champi_allowed_emails: [{ email: 'x', label: 'Enzo' }], champi_profiles: [{ id: ME, display_name: 'Enzo' }],
      champi_spots: [{ id: SPOT, owner: ME, visibility: 'private', name: 'Pinède alertée', lat: 43.3, lon: 5.5, species: ['cepe'], trees: [], note: null, created_at: '2026-09-01T00:00:00Z', author: { display_name: 'Enzo' } }] }[t] ?? (u.pathname.startsWith('/functions/') ? { depts: {} } : []);
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj && Array.isArray(body) ? body[0] ?? null : body) });
  });
  await page.addInitScript(([ref, me]) => {
    localStorage.setItem('champi-tuto', '2');
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 9999999, user: { id: me, email: 'x@y.fr' } }));
  }, [REF, ME]);
  await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])');
  await page.evaluate(() => navigator.serviceWorker.ready);

  // 1. Écran des alertes + tentative d'abonnement
  await page.click('#menu-btn'); await page.click('#alerts-btn');
  console.log('état :', await page.textContent('#alerts-status'));
  await page.click('#alerts-on');
  await page.waitForFunction(() => document.querySelector('#alerts-msg').textContent.length > 0, null, { timeout: 20000 });
  console.log('activation :', await page.textContent('#alerts-msg'));
  await page.screenshot({ path: `${OUT}/96-alertes.png` });
  await page.click('#dlg-alerts .js-close');

  // 2. Notification simulée reçue par le service worker (protocole de débogage)
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('ServiceWorker.enable');
  const regId = await new Promise((ok) => { cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => { const r = e.registrations?.find((x) => x.scopeURL.startsWith(new URL(SITE).origin)); if (r) ok(r.registrationId); }); });
  await cdp.send('ServiceWorker.deliverPushMessage', { origin: new URL(SITE).origin, registrationId: regId, data: JSON.stringify({ title: '🍄 Conditions favorables', body: 'Pinède alertée : Cèpe — Grosse pluie il y a 7 j', url: `${SITE}#spot=${SPOT}`, tag: 'champi-pousse' }) });
  await page.waitForTimeout(1000);
  const notes = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({ title: n.title, body: n.body, url: n.data?.url })));
  console.log('notification affichée :', JSON.stringify(notes));

  // 3. Lien direct (ce que fait le clic sur la notification)
  await page.goto(`${SITE}#spot=${SPOT}`); await page.waitForSelector('#dlg-spot[open]', { timeout: 10000 });
  console.log('coin ouvert par le lien :', await page.textContent('#spot-name'), '| adresse nettoyée :', !page.url().includes('#spot'));
  console.log('ERREURS :', errors.length ? errors : 'aucune');
  await b.close();
})();
