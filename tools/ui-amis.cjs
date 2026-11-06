// Parcours « groupe amis » : un ami ne peut pas choisir 👪 Famille ; badges 👥 Amis ; l'admin choisit le groupe.
const { chromium, devices } = require('playwright');
const fakeMeteo = require('./fake-meteo.cjs');
const [, , SITE, OUT] = process.argv;
const REF = 'vvegujltsjgwszeloyaz', ME = '11111111-1111-1111-1111-111111111111', MAME = '22222222-2222-2222-2222-222222222222';
const sp = (id, owner, name, vis, lat, lon) => ({ id, owner, visibility: vis, name, lat, lon, species: [], trees: [], created_at: '2026-01-01T00:00:00Z' });

async function run(grp, admin) {
  const db = {
    spots: [sp('aaaaaaaa-0000-0000-0000-000000000001', MAME, 'Coin des amis', 'friends', 43.40, 5.60), sp('aaaaaaaa-0000-0000-0000-000000000002', ME, 'Mon coin', 'private', 43.41, 5.62)],
    members: [{ email: 'enzo@test.fr', label: 'Enzo', grp: 'famille', added_at: '2026-01-01T00:00:00Z' }, { email: 'paul@test.fr', label: 'Paul', grp: 'ami', added_at: '2026-02-01T00:00:00Z' }],
    requests: [{ email: 'lea@test.fr', display_name: 'Léa', message: 'Coucou', created_at: '2026-11-01T00:00:00Z' }],
    posts: [], patches: [],
  };
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  const page = await ctx.newPage(); await fakeMeteo(page);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.route(`https://${REF}.supabase.co/**`, (route) => {
    const req = route.request(); const u = new URL(req.url()); const t = u.pathname.replace('/rest/v1/', '');
    const obj = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const send = (body, st = 200) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(obj && Array.isArray(body) ? body[0] ?? null : body) });
    const m = req.method();
    if (m === 'POST' && t === 'champi_allowed_emails') { const row = JSON.parse(req.postData()); db.posts.push(row); db.members.push({ ...row, added_at: new Date().toISOString() }); return send([], 201); }
    if (m === 'PATCH' && t === 'champi_allowed_emails') { const row = JSON.parse(req.postData()); const em = (u.searchParams.get('email') || '').replace('eq.', ''); db.patches.push([em, row]); const x = db.members.find((y) => y.email === em); if (x) Object.assign(x, row); return send([]); }
    if (m === 'DELETE' && t === 'champi_access_requests') { db.requests = []; return send([]); }
    if (t === 'champi_profiles') { const all = [{ id: ME, display_name: 'Enzo' }, { id: MAME, display_name: 'Mame' }]; const id = (u.searchParams.get('id') || '').replace('eq.', ''); return send(id ? all.filter((x) => x.id === id) : all); }
    if (t === 'champi_allowed_emails') return send(u.searchParams.get('email') ? [{ email: 'enzo@test.fr', label: 'Enzo', grp }] : db.members);
    if (t === 'champi_admins') return send(admin ? [{ email: 'enzo@test.fr' }] : []);
    if (t === 'champi_access_requests') return send(admin && !obj ? db.requests : obj ? null : []);
    const body = { champi_spots: db.spots.map((s) => ({ ...s, author: {} })), champi_finds: [] }[t] ?? (u.pathname.startsWith('/functions/') ? { depts: {} } : []);
    send(body);
  });
  await page.addInitScript(([ref, me]) => {
    localStorage.setItem('champi-tuto', '3'); localStorage.setItem('champi-view', JSON.stringify({ lat: 43.405, lon: 5.61, zoom: 13 }));
    localStorage.setItem('champi-last-vis', 'family');
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 9999999, user: { id: me, email: 'enzo@test.fr' } }));
  }, [REF, ME]);
  await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])'); await page.waitForTimeout(1000);
  return { b, page, db, errors };
}

(async () => {
  // 1. Un ami
  let { b, page, errors } = await run('ami', false);
  await page.click('#btn-add'); await page.click('#add-here');
  await page.waitForSelector('#dlg-edit[open], #dlg-near[open]'); if (await page.isVisible('#dlg-near')) await page.click('#near-no');
  await page.waitForSelector('#dlg-edit[open]');
  const vis = async () => (await page.locator('#edit-vis button:visible').allTextContents()).map((x) => x.trim()).join(' / ') + ' · choisi : ' + (await page.textContent('#edit-vis button.on')).trim();
  console.log('AMI · choix « Qui le voit ? » :', await vis());
  await page.screenshot({ path: `${OUT}/m1-ami-formulaire.png` });
  await page.click('#edit-form [value=cancel] >> nth=1').catch(() => page.keyboard.press('Escape'));
  await page.click('#menu-btn'); await page.click('#list-btn');
  console.log('AMI · liste :', (await page.locator('.spot-item').allTextContents()).map((x) => x.replace(/\s+/g, ' ').trim().slice(0, 60)));
  await page.click('#scope-seg [data-scope=family]'); await page.waitForTimeout(200);
  console.log('AMI · onglet', (await page.textContent('#scope-seg [data-scope=family]')).trim(), ':', await page.locator('.spot-item .title').allTextContents());
  await page.screenshot({ path: `${OUT}/m2-ami-liste.png` });
  console.log('AMI · ERREURS :', errors.length ? errors : 'aucune');
  await b.close();

  // 1 bis. Un membre de la famille (pas admin)
  ({ b, page, errors } = await run('famille', false));
  await page.click('#btn-add'); await page.click('#add-here');
  await page.waitForSelector('#dlg-edit[open], #dlg-near[open]'); if (await page.isVisible('#dlg-near')) await page.click('#near-no');
  await page.waitForSelector('#dlg-edit[open]');
  console.log('FAMILLE (pas admin) · choix :', await vis());
  console.log('FAMILLE (pas admin) · ERREURS :', errors.length ? errors : 'aucune');
  await b.close();

  // 2. La famille (admin)
  const r2 = await run('famille', true); ({ b, page, errors } = r2);
  const db = r2.db;
  await page.click('#btn-add'); await page.click('#add-here');
  await page.waitForSelector('#dlg-edit[open], #dlg-near[open]'); if (await page.isVisible('#dlg-near')) await page.click('#near-no');
  await page.waitForSelector('#dlg-edit[open]');
  console.log('ADMIN · choix :', await vis());
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.click('#menu-btn'); await page.click('#admin-btn'); await page.waitForSelector('#dlg-admin[open]'); await page.waitForTimeout(400);
  console.log('ADMIN · membres :', await page.textContent('#member-count'), (await page.locator('#member-list li .head').allTextContents()).map((x) => x.replace(/\s+/g, ' ').trim()));
  console.log('ADMIN · demande :', (await page.locator('#req-list .req-actions').first().textContent()).replace(/\s+/g, ' ').trim());
  await page.screenshot({ path: `${OUT}/m3-admin.png`, fullPage: false });
  await page.click('#req-list [data-grp=ami]'); await page.waitForTimeout(500);
  console.log('ADMIN · Léa acceptée en ami → envoyé :', JSON.stringify(db.posts.at(-1)));
  await page.click('#add-grp [data-grp=ami]');
  await page.fill('#add-email', 'jules@test.fr'); await page.fill('#add-label', 'Jules');
  await page.click('#add-form button[type=submit]'); await page.waitForTimeout(600);
  console.log('ADMIN · ajout Jules → envoyé :', JSON.stringify(db.posts.at(-1)));
  await page.locator('#member-list [data-grp-set]').first().click(); await page.waitForTimeout(500);
  console.log('ADMIN · changement de groupe → envoyé :', JSON.stringify(db.patches.at(-1)));
  await page.screenshot({ path: `${OUT}/m4-admin-apres.png` });
  console.log('FAMILLE · ERREURS :', errors.length ? errors : 'aucune');
  await b.close();
})();
