// Parcours photos + détails dans Chromium, avec faux Supabase (base + stockage) en mémoire.
// Usage : node tools/ui-photos.cjs <url du site> <dossier captures> <photo jpeg avec GPS>
const { chromium, devices } = require('playwright');
const fs = require('fs');
const [, , SITE, OUT, PHOTO] = process.argv;
const REF = 'vvegujltsjgwszeloyaz';
const ME = '11111111-1111-1111-1111-111111111111';

(async () => {
  const { exifGps } = await import('../site/js/logic.js');
  const data = { spots: [], finds: [], photos: [], files: new Map(), removed: [] };
  const prof = { display_name: 'Enzo' };
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.route(`https://${REF}.supabase.co/**`, async (route) => {
    const req = route.request(); const url = new URL(req.url()); const m = req.method(); const path = url.pathname;
    const obj = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj && Array.isArray(body) ? body[0] ?? null : body) });
    if (path.startsWith('/storage/v1/object/sign/champi-photos/')) {
      const key = decodeURIComponent(path.replace('/storage/v1/object/sign/champi-photos/', ''));
      const f = data.files.get(key);
      return f ? route.fulfill({ status: 200, contentType: 'image/jpeg', body: f }) : route.fulfill({ status: 404 });
    }
    if (path === '/storage/v1/object/sign/champi-photos' && m === 'POST') {
      const { paths } = JSON.parse(req.postData());
      return send(paths.map((p) => ({ path: p, signedURL: `/object/sign/champi-photos/${p}?token=t`, error: null })));
    }
    if (path.startsWith('/storage/v1/object/champi-photos/') && m === 'POST') {
      const key = decodeURIComponent(path.replace('/storage/v1/object/champi-photos/', ''));
      let body = req.postDataBuffer();
      const ct = req.headers()['content-type'] || '';
      const bm = ct.match(/boundary=(.+)$/);
      if (bm) {   // multipart : on garde la partie qui contient le fichier
        const sep = Buffer.from('--' + bm[1]);
        let i = body.indexOf(sep), file = null;
        while (i !== -1) {
          const j = body.indexOf(sep, i + sep.length); if (j === -1) break;
          const part = body.subarray(i + sep.length, j);
          const h = part.indexOf('\r\n\r\n');
          if (/filename=|image\/jpeg/i.test(part.subarray(0, h).toString())) file = part.subarray(h + 4, part.length - 2);
          i = j;
        }
        if (file) body = Buffer.from(file);
      }
      data.files.set(key, body);
      return send({ Key: 'champi-photos/' + key });
    }
    if (path === '/storage/v1/object/champi-photos' && m === 'DELETE') {
      const { prefixes } = JSON.parse(req.postData());
      for (const p of prefixes) { data.files.delete(p); data.removed.push(p); }
      return send(prefixes.map((n) => ({ name: n })));
    }
    if (path.startsWith('/auth/')) return send({});
    const table = path.replace('/rest/v1/', '');
    const idEq = () => url.searchParams.get('id')?.slice(3);
    if (table === 'champi_allowed_emails') return send([{ email: 'x' }]);
    if (table === 'champi_profiles') return send([{ id: ME, ...prof }]);
    const T = { champi_spots: 'spots', champi_finds: 'finds', champi_photos: 'photos' }[table];
    if (T) {
      if (m === 'GET') return send(data[T].map((r) => ({ ...r, author: prof })));
      if (m === 'POST') { const r = { id: T + Date.now() + Math.random().toString(16).slice(2, 6), owner: ME, user_id: ME, created_at: new Date().toISOString(), ...JSON.parse(req.postData()) }; data[T].push(r); return send([r], 201); }
      if (m === 'PATCH') { const r = data[T].find((x) => x.id === idEq()); Object.assign(r, JSON.parse(req.postData())); return send([r]); }
      if (m === 'DELETE') {
        const id = idEq(); data[T] = data[T].filter((x) => x.id !== id);
        if (T === 'spots') { data.finds = data.finds.filter((f) => f.spot_id !== id); data.photos = data.photos.filter((p) => p.spot_id !== id); }
        if (T === 'finds') data.photos = data.photos.filter((p) => p.find_id !== id);
        return send([], 204);
      }
    }
    return send({ message: 'non simulé ' + m + ' ' + path }, 500);
  });
  await page.addInitScript(([ref, me]) => {
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 99999, user: { id: me, email: 'enzo@test.fr' } }));
    localStorage.setItem('champi-view', JSON.stringify({ lat: 43.53, lon: 5.585, zoom: 13 }));
  }, [REF, ME]);

  await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])'); await page.waitForTimeout(1500);

  // 1. Coin depuis la position d'une photo
  await page.click('#btn-coords');
  await page.setInputFiles('#coords-photo', PHOTO);
  await page.waitForSelector('#adjust-bar:not([hidden])');
  await page.click('#adjust-done');
  console.log('coords lues dans la photo :', await page.textContent('#edit-coords'));
  console.log('photo en attente visible :', await page.isVisible('#edit-photo'));
  await page.fill('#edit-name', 'Croix de Provence');
  await page.click('#edit-more summary');
  await page.waitForFunction(() => document.querySelector('#edit-altitude').value !== '', null, { timeout: 10000 }).catch(() => {});
  console.log('altitude auto :', await page.inputValue('#edit-altitude'), await page.textContent('#edit-alt-src'));
  await page.click('#edit-trees [data-sp=chene-vert]'); await page.click('#edit-trees [data-sp=pin-alep]');
  await page.selectOption('#edit-soil', 'calcaire'); await page.selectOption('#edit-exposure', 'N');
  await page.fill('#edit-access', 'Parking des Cabassols');
  await page.screenshot({ path: `${OUT}/20-details.png` });
  await page.click('#edit-save');
  await page.waitForSelector('#dlg-spot[open]');
  await page.waitForFunction(() => document.querySelectorAll('#spot-photos img').length === 0 || true);
  await page.waitForTimeout(500);
  const spot = data.spots[0];
  console.log('coin enregistré :', JSON.stringify({ trees: spot.trees, soil: spot.soil, exposure: spot.exposure, altitude: spot.altitude, access: spot.access }));
  console.log('photo du coin envoyée :', data.photos.length, [...data.files.keys()]);

  // 2. Trouvaille avec 2 photos
  await page.click('#find-add summary');
  await page.click('#find-species [data-sp=lactaire-sanguin]');
  await page.selectOption('#find-quantity', 'panier'); await page.selectOption('#find-condition', 'a-point');
  await page.fill('#find-weather', 'Pluie il y a 10 jours');
  await page.setInputFiles('#find-photos', [PHOTO, PHOTO]);
  console.log('aperçus :', await page.locator('#find-previews img').count());
  await page.screenshot({ path: `${OUT}/21-trouvaille-form.png` });
  await page.click('#find-form button[type=submit]');
  await page.waitForFunction(() => document.querySelectorAll('#find-list .photos img').length === 2, null, { timeout: 15000 });
  await page.waitForTimeout(3000);
  console.log('fetch :', await page.evaluate(async () => { const i = document.querySelector('#dlg-spot img[data-path]'); const r = await fetch(i.src); return r.status + ' ' + r.headers.get('content-type') + ' ' + (await r.arrayBuffer()).byteLength + ' ' + i.src.slice(-80); }));
  console.log('imgs :', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#dlg-spot img[data-path]')].map((i) => [i.dataset.path.slice(-12), (i.src || '').slice(0, 90), i.naturalWidth]))));
  await page.screenshot({ path: `${OUT}/22-journal-photos.png` });
  console.log('lignes photos :', data.photos.length, 'dont trouvaille :', data.photos.filter((p) => p.find_id).length);
  console.log('trouvaille :', JSON.stringify((({ quantity, condition, weather, species }) => ({ quantity, condition, weather, species }))(data.finds[0])));

  // Vérifie les fichiers envoyés : taille, dimensions, absence de GPS
  for (const [k, buf] of data.files) {
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const dim = await page.evaluate(async (b64) => { const i = new Image(); i.src = 'data:image/jpeg;base64,' + b64; await i.decode(); return `${i.naturalWidth}x${i.naturalHeight}`; }, buf.toString('base64'));
    console.log(`  ${k.split('/')[1]} : ${(buf.length / 1024).toFixed(0)} Ko, ${dim}, GPS=${JSON.stringify(exifGps(ab))}`);
  }
  console.log('photo originale :', (fs.statSync(PHOTO).size / 1024).toFixed(0), 'Ko, GPS=', JSON.stringify(exifGps(fs.readFileSync(PHOTO).buffer)));

  // 3. Visionneuse + suppression d'une photo
  await page.locator('#find-list .photos .thumb').first().click();
  await page.waitForFunction(() => document.querySelector('#photo-full').naturalWidth > 0, null, { timeout: 10000 });
  await page.screenshot({ path: `${OUT}/23-visionneuse.png` });
  page.once('dialog', (d) => d.accept());
  await page.click('#photo-delete');
  await page.waitForFunction(() => document.querySelectorAll('#find-list .photos img').length === 1, null, { timeout: 10000 });
  console.log('après suppression : lignes', data.photos.length, 'fichiers', data.files.size, 'retirés', data.removed.length);

  // 4. Supprimer le coin → fichiers supprimés
  await page.click('#spot-edit');
  page.once('dialog', (d) => d.accept());
  await page.click('#edit-delete');
  await page.waitForTimeout(800);
  console.log('après suppression du coin : coins', data.spots.length, 'fichiers restants', data.files.size);
  console.log('ERREURS :', errors.length ? errors : 'aucune');
  await b.close();
})();
