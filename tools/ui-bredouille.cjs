// Parcours « 🚶 Passé, rien trouvé » : un toucher dans la fiche → visite vide envoyée, affichée dans la liste et le journal, avis plus prudent.
const { chromium, devices } = require('playwright');
const fakeMeteo = require('./fake-meteo.cjs');
const [, , SITE, OUT] = process.argv;
const REF = 'vvegujltsjgwszeloyaz', ME = '11111111-1111-1111-1111-111111111111', MAME = '22222222-2222-2222-2222-222222222222';
const sp = (id, owner, name, lat, lon, extra = {}) => ({ id, owner, visibility: 'family', name, lat, lon, species: [], trees: [], created_at: '2026-01-01T00:00:00Z', ...extra });
const posts = [];
const db = {
  spots: [
    sp('aaaaaaaa-0000-0000-0000-000000000001', ME, 'Pinède du Vallon', 43.40, 5.60, { note: 'Parking après le pont', species: ['petit-gris'] }),
    sp('aaaaaaaa-0000-0000-0000-000000000002', MAME, 'Janas', 43.08, 5.88),
    sp('aaaaaaaa-0000-0000-0000-000000000003', ME, 'Foret Magique', 43.30, 6.30),
  ],
  finds: [{ id: 'ffffffff-0000-0000-0000-000000000001', spot_id: 'aaaaaaaa-0000-0000-0000-000000000002', user_id: MAME, found_on: '2026-11-06', species: ['cepe'], note: 'sous le gros chêne', created_at: '2026-11-06T11:00:00Z' }],
};
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  const page = await ctx.newPage(); await fakeMeteo(page);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.route(`https://${REF}.supabase.co/**`, (route) => {
    const req = route.request(); const u = new URL(req.url()); const t = u.pathname.replace('/rest/v1/', '');
    const obj = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const send = (body, st = 200) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(obj && Array.isArray(body) ? body[0] ?? null : body) });
    if (req.method() === 'POST' && t === 'champi_finds') { const row = JSON.parse(req.postData()); posts.push(row); db.finds.push({ ...row, user_id: ME, created_at: new Date().toISOString() }); return send([{ id: row.id }], 201); }
    if (t === 'champi_profiles') { const all = [{ id: ME, display_name: 'Enzo' }, { id: MAME, display_name: 'Mame' }]; const id = (u.searchParams.get('id') || '').replace('eq.', ''); return send(id ? all.filter((x) => x.id === id) : all); }
    const body = { champi_allowed_emails: [{ email: 'x', label: 'Enzo' }], champi_spots: db.spots.map((s) => ({ ...s, author: {} })), champi_finds: db.finds.map((f) => ({ ...f, author: {} })) }[t] ?? (u.pathname.startsWith('/functions/') ? { depts: {} } : []);
    send(body);
  });
  await page.addInitScript(([ref, me]) => {
    localStorage.setItem('champi-tuto', '3'); localStorage.setItem('champi-view', JSON.stringify({ lat: 43.45, lon: 5.65, zoom: 12 }));
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 9999999, user: { id: me, email: 'x@y.fr' } }));
  }, [REF, ME]);
  await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])'); await page.waitForTimeout(1200);
  await page.click('#rail-search'); await page.fill('#qs-input', 'vallon'); await page.press('#qs-input', 'Enter');
  await page.waitForSelector('#dlg-spot[open]'); await page.waitForTimeout(800);
  const avis = async () => (await page.textContent('#spot-meteo')).replace(/\s+/g, ' ');
  console.log('bouton visible :', await page.isVisible('#visit-empty'), '| avis avant :', (await avis()).match(/(Bon|Moyen|Faible|Conditions[^·|]*)/)?.[0] ?? '?');
  await page.click('#visit-empty'); await page.waitForTimeout(1500);
  console.log('envoyé :', JSON.stringify(posts.at(-1) && (({ species, empty, found_on }) => ({ species, empty, found_on }))(posts.at(-1))));
  console.log('message :', await page.textContent('#toast'));
  console.log('liste :', (await page.locator('#find-list > li').first().textContent()).replace(/\s+/g, ' ').trim().slice(0, 80));
  await page.screenshot({ path: `${OUT}/b1-fiche.png` });
  console.log('avis après : contient « Passé aujourd\'hui » :', (await avis()).includes("Passé aujourd'hui sans rien trouver"));
  await page.click('#dlg-spot .js-close');
  await page.click('#menu-btn'); await page.click('#journal-btn'); await page.waitForTimeout(400);
  console.log('journal :', (await page.locator('#journal-list .j-item').first().textContent()).replace(/\s+/g, ' ').trim().slice(0, 80));
  console.log('ERREURS :', errors.length ? errors : 'aucune');
  await b.close();
})();
