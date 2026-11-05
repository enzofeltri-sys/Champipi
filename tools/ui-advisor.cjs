// Parcours conseiller / météo / forêts / guide, avec l'API IGN réelle et une météo simulée (Supabase simulé).
// REAL_METEO=1 : vraie API Open-Meteo (attention, elle limite vite le nombre d'appels : erreur 429).
const { chromium, devices } = require('playwright');
const fakeMeteo = require('./fake-meteo.cjs');
const { closeDialogs, openList, openSpot, setScope, pickSpecies, addAtCenter } = require('./ui-helpers.cjs');
const [, , SITE, OUT] = process.argv;
const REF = 'vvegujltsjgwszeloyaz';
const ME = '11111111-1111-1111-1111-111111111111';
const spots = [
  { id: 's1', owner: ME, visibility: 'private', name: 'Pinède de Luminy', lat: 43.235, lon: 5.44, species: ['lactaire-sanguin', 'petit-gris'], trees: ['pin-alep'], note: null, created_at: '2026-09-01T00:00:00Z', altitude: 200 },
  { id: 's2', owner: ME, visibility: 'family', name: 'Châtaigneraie de Collobrières', lat: 43.24, lon: 6.31, species: ['cepe', 'girolle'], trees: ['chataignier'], note: null, created_at: '2026-09-02T00:00:00Z' },
  { id: 's3', owner: ME, visibility: 'private', name: 'Ripisylve à morilles', lat: 43.70, lon: 5.80, species: ['morille'], trees: [], note: null, created_at: '2026-09-03T00:00:00Z' },
];
const finds = [{ id: 'f1', spot_id: 's1', user_id: ME, found_on: '2025-11-15', species: ['lactaire-sanguin'], created_at: '2025-11-15T00:00:00Z' }];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  const page = await ctx.newPage();
  if (!process.env.REAL_METEO) await fakeMeteo(page);
  const errors = []; const net = {};
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { const h = new URL(r.url()).host; if (/open-meteo|geopf/.test(h)) { const k = h + (r.url().includes('GetFeatureInfo') ? ' (forêt)' : r.url().includes('FORESTINVENTORY') ? ' (tuiles forêt)' : ''); net[k] = net[k] || {}; net[k][r.status()] = (net[k][r.status()] || 0) + 1; } });
  await page.route(`https://${REF}.supabase.co/**`, (route) => {
    const u = new URL(route.request().url()); const t = u.pathname.replace('/rest/v1/', '');
    const obj = (route.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    const body = { champi_allowed_emails: [{ email: 'x', label: 'Enzo' }], champi_profiles: [{ id: ME, display_name: 'Enzo' }], champi_spots: spots.map((s) => ({ ...s, author: { display_name: 'Enzo' } })), champi_finds: finds.map((f) => ({ ...f, author: { display_name: 'Enzo' } })) }[t] ?? [];
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj ? body[0] ?? null : body) });
  });
  await page.addInitScript(([ref, me]) => {
    localStorage.setItem('champi-tuto', '2'); localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 99999, user: { id: me, email: 'x@y.fr' } }));
  }, [REF, ME]);
  await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])'); await page.waitForTimeout(1200);

  // 1. Fiche : météo + avis
  await openSpot(page, 'Luminy');
  await page.waitForSelector('#spot-meteo .rainbars', { timeout: 20000 }).catch(async (e) => { console.log('météo Luminy :', (await page.textContent('#spot-meteo')).trim().slice(0, 200)); throw e; });
  console.log('avis Luminy :', await page.textContent('#spot-meteo .verdict'));
  console.log('raisons :', await page.locator('#spot-meteo .reasons li').allTextContents());
  console.log('barres :', await page.locator('#spot-meteo .rainbars .d').count());
  await page.locator('#spot-meteo').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/50-meteo-coin.png` });

  // 2. Modifier : forêt IGN lue sous l'épingle (Collobrières)
  await page.click('#dlg-spot .js-close');
  await openSpot(page, 'Collobrières');
  await page.waitForSelector('#spot-meteo .rainbars', { timeout: 20000 }).catch(async (e) => { console.log('météo Collobrières :', (await page.textContent('#spot-meteo')).trim()); throw e; });
  console.log('avis Collobrières :', await page.textContent('#spot-meteo .verdict'));
  await page.click('#spot-edit');
  await page.click('#edit-more summary').catch(() => {});
  await page.waitForFunction(() => !document.querySelector('#edit-forest').hidden && !document.querySelector('#edit-forest').textContent.includes('Lecture'), null, { timeout: 15000 });
  console.log('forêt IGN :', (await page.textContent('#edit-forest')).trim());
  await page.click('#edit-form [value=cancel] >> nth=1');

  // 3. Conseiller
  await closeDialogs(page); await page.click('#menu-btn'); await page.click('#advisor-btn2');
  await page.waitForSelector('#advisor-body .rank, #advisor-body .error', { timeout: 25000 });
  console.log('conseiller :', (await page.textContent('#advisor-body')).replace(/\s+/g, ' ').slice(0, 600));
  await page.screenshot({ path: `${OUT}/51-conseiller.png` });

  // 4. Carte des pluies
  await page.click('#advisor-rain');
  await page.waitForFunction(() => document.querySelectorAll('.leaflet-interactive').length > 50, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  console.log('points de pluie :', await page.locator('path.leaflet-interactive').count());
  await page.screenshot({ path: `${OUT}/52-pluie-paca.png` });
  await page.click('#rail-rain'); await page.waitForTimeout(300);   // bouton rond « 🌧️ Pluie » : on éteint
  console.log('pluie éteinte :', await page.getAttribute('#rail-rain', 'aria-pressed') === 'false');

  // 5. Guide + forêts
  await page.click('#menu-btn'); await page.click('#guide-btn');
  console.log('fiches du guide :', await page.locator('.guide-card').count(), '| sosies en rouge :', await page.locator('.guide-card .warn').count());
  await page.screenshot({ path: `${OUT}/53-guide.png` });
  await page.click('#guide-forest');
  await page.evaluate(() => {}); await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/54-forets.png` });
  console.log('réseau :', JSON.stringify(net));
  console.log('ERREURS :', errors.length ? errors : 'aucune');
  await b.close();
})();
