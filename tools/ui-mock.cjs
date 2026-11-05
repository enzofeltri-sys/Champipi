// Parcours de l'interface dans Chromium avec une fausse API Supabase en mémoire.
// Usage : node tools/ui-mock.cjs <url du site> <dossier des captures>
const { chromium, devices } = require('playwright');
const { closeDialogs, openList, openSpot, setScope, pickSpecies, addAtCenter } = require('./ui-helpers.cjs');
const fakeMeteo = require('./fake-meteo.cjs');
const [, , SITE, OUT] = process.argv;
const REF = 'vvegujltsjgwszeloyaz';
const ME = '11111111-1111-1111-1111-111111111111';
const TATA = '22222222-2222-2222-2222-222222222222';

function db() {
  return {
    allowed: true,
    profiles: [{ id: ME, display_name: 'Enzo' }, { id: TATA, display_name: 'Tata Mireille' }],
    spots: [{ id: 's-fam', owner: TATA, visibility: 'family', name: 'Vallon des pins', lat: 43.36, lon: 5.55, species: ['lactaire-sanguin'], note: 'Après la barrière DFCI.', created_at: '2026-10-01T10:00:00Z' },
      { id: 's-old', owner: ME, visibility: 'private', name: 'Clairière du haut', lat: 43.52, lon: 5.62, species: ['morille'], note: null, created_at: '2026-04-01T10:00:00Z' }],
    finds: [{ id: 'f1', spot_id: 's-fam', user_id: TATA, found_on: '2026-10-28', species: ['lactaire-sanguin'], note: 'Un panier !', created_at: '2026-10-28T10:00:00Z' }],
  };
}

async function setup(page, data, { session = true } = {}) {
  const author = (id) => ({ display_name: data.profiles.find((p) => p.id === id)?.display_name });
  await page.route(`https://${REF}.supabase.co/**`, async (route) => {
    const req = route.request(); const url = new URL(req.url()); const m = req.method();
    const table = url.pathname.replace('/rest/v1/', '');
    const obj = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj && Array.isArray(body) ? body[0] ?? null : body) });
    if (url.pathname.startsWith('/auth/')) return send({});
    if (table === 'champi_spot_shares') return send([]);
    if (table === 'champi_admins' || table === 'champi_access_requests') return send([]);
    if (table === 'champi_allowed_emails') return send(data.allowed ? [{ email: 'enzo@test.fr' }] : []);
    if (table === 'champi_profiles') return send(data.profiles.filter((p) => p.id === ME));
    if (table === 'champi_spots') {
      if (m === 'GET') return send(data.spots.map((s) => ({ ...s, author: author(s.owner) })));
      if (m === 'POST') { const r = { id: 's' + Date.now(), owner: ME, created_at: new Date().toISOString(), ...JSON.parse(req.postData()) }; data.spots.push(r); return send([r], 201); }
      if (m === 'PATCH') { const id = url.searchParams.get('id').slice(3); const s = data.spots.find((x) => x.id === id); Object.assign(s, JSON.parse(req.postData())); return send([s]); }
      if (m === 'DELETE') { const id = url.searchParams.get('id').slice(3); data.spots = data.spots.filter((x) => x.id !== id); return send([], 204); }
    }
    if (table === 'champi_photos' || table === 'champi_rain_stations' || table === 'champi_rain_daily' || table === 'champi_alert_log' || table === 'champi_meteo_grid') return send([]);
    if (table === 'champi_finds') {
      if (m === 'GET') return send(data.finds.map((f) => ({ ...f, author: author(f.user_id) })).sort((a, b) => (a.found_on < b.found_on ? 1 : -1)));
      if (m === 'POST') { const r = { id: 'f' + Date.now(), user_id: ME, created_at: new Date().toISOString(), ...JSON.parse(req.postData()) }; data.finds.push(r); return send([r], 201); }
    }
    return send({ message: 'non simulé ' + m + ' ' + table }, 500);
  });
  if (session) {
    await page.addInitScript(([ref, me]) => {
      const now = Math.floor(Date.now() / 1000);
      localStorage.setItem('champi-tuto', '3'); localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
        access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: now + 360000,
        user: { id: me, email: 'enzo@test.fr', aud: 'authenticated', role: 'authenticated' },
      }));
    }, [REF, ME]);
  }
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const mk = async (opts = {}) => {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR', geolocation: { latitude: 43.5297, longitude: 5.4474, accuracy: 12 }, permissions: ['geolocation'], ...opts });
    const page = await ctx.newPage();
  await fakeMeteo(page);
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('response', (r) => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url().slice(0, 110)); });
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });
    return page;
  };
  const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });

  // 1. Écran de connexion
  let page = await mk(); await setup(page, db(), { session: false });
  await page.goto(SITE); await page.waitForSelector('#screen-login:not([hidden])');
  await shot(page, '01-connexion');

  // 2. Hors liste
  page = await mk(); const d0 = db(); d0.allowed = false; await setup(page, d0);
  await page.goto(SITE); await page.waitForSelector('#screen-denied:not([hidden])');
  await shot(page, '02-hors-liste');

  // 3. Appli
  const data = db();
  page = await mk(); await setup(page, data);
  await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])');
  await page.waitForTimeout(2500);
  await shot(page, '03-carte');
  const pins = await page.locator('.leaflet-marker-icon').count();
  console.log('épingles affichées :', pins);

  // 4. Toucher la carte → épingle provisoire déplaçable → fiche
  await page.click('#btn-add');
  await shot(page, '04-epingle');
  await page.click('#add-here');
  await page.waitForSelector('#dlg-edit[open]');
  console.log('épingle déplaçable :', await page.locator('.leaflet-marker-draggable').count());
  await page.fill('#edit-name', 'Pinède test <b>gras</b>');
  await page.click('#edit-vis [data-vis=family]');
  await page.click('#nf-species [data-sp=cepe]');
  await page.click('#nf-species [data-sp=lactaire-sanguin]');
  await page.fill('#edit-note', 'Sous les pins d\'Alep.');
  await shot(page, '05-fiche');
  await page.click('#edit-save');
  await page.waitForSelector('#dlg-spot[open]');
  console.log('enregistré :', JSON.stringify(data.spots.at(-1)));
  await shot(page, '06-detail');

  // 5. Trouvaille
  await page.click('#find-add summary');
  await page.click('#find-species [data-sp=cepe]');
  await page.fill('#find-note', '12 cèpes');
  await page.click('#find-form button[type=submit]');
  await page.waitForFunction(() => document.querySelectorAll('#find-list li .head').length === 1);
  await shot(page, '07-journal');
  console.log('trouvaille :', JSON.stringify(data.finds.at(-1)));
  await page.click('#dlg-spot .js-close');

  // 6. Liste et filtres
  await openList(page); await page.waitForTimeout(300);
  await shot(page, '08-liste');
  const order = await page.locator('.spot-item .title').allTextContents();
  console.log('ordre de la liste :', order);
  await setScope(page, 'mine');
  console.log('Mes coins :', await page.locator('.spot-item .title').allTextContents());
  await setScope(page, 'family');
  console.log('Famille :', await page.locator('.spot-item .title').allTextContents());
  await setScope(page, 'all');
  await pickSpecies(page, 'Morille');
  await openList(page);
  console.log('Morille :', await page.locator('.spot-item .title').allTextContents(), '| épingles :', await page.locator('.leaflet-marker-icon').count());
  await pickSpecies(page, 'Tous');

  // 7. Je suis ici
  await page.click('#btn-add'); await page.click('#add-locate'); await page.waitForTimeout(800); await page.click('#add-here');
  await page.waitForSelector('#dlg-edit[open]');
  console.log('coords géoloc :', await page.textContent('#edit-coords'));
  await page.click('#edit-form [value=cancel] >> nth=1');

  // 8. Bouton « 📷 Photo » à la place de « Coordonnées »
  await page.click('#btn-add');
  console.log('barre d\'ajout :', (await page.textContent('#add-bar .bar-grid')).replace(/\s+/g, ' ').trim());
  await page.click('#add-cancel');

  // 9. Menu, massifs, thème sombre, fond photo
  await page.click('#menu-btn'); await page.click('#menu details.more summary'); await page.check('#toggle-massifs');
  await page.click('#theme-seg [data-theme=dark]'); await page.click('#menu-btn');
  await page.click('#menu-btn'); await page.click('#base-seg [data-base=ortho]'); await page.click('#menu-btn');
  await page.waitForTimeout(2500);
  await shot(page, '09-sombre-massifs-photos');
  await openList(page); await page.waitForTimeout(300);
  await shot(page, '10-liste-sombre');

  // 10. Modifier puis supprimer mon coin
  await openSpot(page, 'Pinède');
  await page.click('#spot-edit'); await page.fill('#edit-name', 'Pinède renommée');
  await page.click('#edit-save'); await page.waitForSelector('#dlg-spot[open]');
  console.log('renommé :', await page.textContent('#spot-name'));
  console.log('Modifier visible sur coin de Tata ?', await (async () => { await openSpot(page, 'Vallon'); return page.$eval('#spot-edit', (el) => !el.hidden); })());

  console.log('ERREURS :', errors.length ? errors : 'aucune');
  await browser.close();
})();
