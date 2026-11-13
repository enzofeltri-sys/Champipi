// Parcours « Journal de la famille » : compteur de nouveautés, liste (trouvailles + alertes), filtre,
// lien d'une notification (#journal=f:<id>) qui ouvre le journal sur la bonne ligne, ouverture du coin.
const { chromium, devices } = require('playwright');
const fakeMeteo = require('./fake-meteo.cjs');
const [, , SITE, OUT] = process.argv;
const REF = 'vvegujltsjgwszeloyaz';
const ME = '11111111-1111-1111-1111-111111111111', TATA = '22222222-2222-2222-2222-222222222222';
const S1 = 'aaaaaaaa-0000-0000-0000-000000000001', S2 = 'aaaaaaaa-0000-0000-0000-000000000002';
const now = Date.now(), iso = (ms) => new Date(ms).toISOString(), day = (ms) => iso(ms).slice(0, 10);
const db = {
  profiles: [{ id: ME, display_name: 'Enzo', avatar_emoji: '🦉', avatar_color: '#2f6db5' }, { id: TATA, display_name: 'Tata', avatar_emoji: '🦊', avatar_color: '#c0392b' }],
  spots: [{ id: S1, owner: ME, visibility: 'family', name: 'Pinède du Vallon', lat: 43.32, lon: 5.6, species: ['lactaire-sanguin'], trees: [], created_at: '2026-09-01T00:00:00Z' },
    { id: S2, owner: TATA, visibility: 'family', name: 'Châtaigneraie de Tata', lat: 43.34, lon: 5.66, species: ['cepe'], trees: [], created_at: '2026-09-02T00:00:00Z' }],
  finds: [
    { id: 'f-new', spot_id: S2, user_id: TATA, found_on: day(now), species: ['cepe', 'girolle'], quantity: 'panier', note: 'Sous les châtaigniers, après la barrière', ai_comment: 'Pousse cohérente avec la grosse pluie de 98 mm tombée 17 jours avant ; celle de 50 mm d’il y a 2 jours n’a pas encore agi.', created_at: iso(now - 3600e3) },
    { id: 'f-mine', spot_id: S1, user_id: ME, found_on: day(now - 86400e3), species: ['lactaire-sanguin'], created_at: iso(now - 86400e3) },
    { id: 'f-old', spot_id: S2, user_id: TATA, found_on: '2026-10-12', species: ['cepe'], created_at: '2026-10-12T10:00:00Z' },
  ],
  alerts: [{ spot_id: S1, sent_on: day(now) }],
};
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  const page = await ctx.newPage();
  await fakeMeteo(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(`https://${REF}.supabase.co/**`, (route) => {
    const req = route.request(); const u = new URL(req.url()); const t = u.pathname.replace('/rest/v1/', '');
    const obj = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const send = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj && Array.isArray(body) ? body[0] ?? null : body) });
    if (t === 'champi_profiles') { const id = u.searchParams.get('id')?.slice(3); return send(id ? db.profiles.filter((x) => x.id === id) : db.profiles); }
    const body = { champi_allowed_emails: [{ email: 'x', label: 'Enzo' }], champi_profiles: db.profiles, champi_alert_log: db.alerts,
      champi_spots: db.spots.map((s) => ({ ...s, author: {} })), champi_finds: db.finds.map((f) => ({ ...f, author: {} })) }[t] ?? (u.pathname.startsWith('/functions/') ? { depts: {} } : []);
    send(body);
  });
  await page.addInitScript(([ref, me, seen]) => {
    localStorage.setItem('champi-tuto', '3');
    if (!sessionStorage.getItem('init')) { localStorage.setItem('champi-journal-vu', seen); sessionStorage.setItem('init', '1'); }   // dernière visite : il y a 2 h
    localStorage.setItem('champi-view', JSON.stringify({ lat: 43.33, lon: 5.63, zoom: 12 }));
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 9999999, user: { id: me, email: 'x@y.fr' } }));
  }, [REF, ME, iso(now - 2 * 3600e3)]);
  await page.goto(SITE); await page.waitForSelector('#screen-app:not([hidden])'); await page.waitForTimeout(1200);
  console.log('point sur ☰ :', await page.isVisible('#menu-dot'));
  await page.click('#menu-btn');
  console.log('menu :', (await page.textContent('#journal-btn')).replace(/\s+/g, ' ').trim());
  await page.click('#journal-btn');
  const rows = await page.$$eval('#journal-list > *', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  console.log('journal :\n  ' + rows.join('\n  '));
  await page.screenshot({ path: `${OUT}/j1-journal.png` });
  await page.click('#journal-seg [data-kind=alerts]');
  console.log('filtre alertes :', await page.locator('#journal-list .j-item').count(), 'ligne(s)');
  await page.click('#journal-seg [data-kind=all]');
  await page.click('#dlg-journal .js-close'); await page.waitForTimeout(300);
  console.log('après lecture · point sur ☰ :', await page.isVisible('#menu-dot'), '| compteur :', await page.isVisible('#journal-count'));
  // Lien d'une notification
  await page.goto(SITE + '#journal=f:f-old'); await page.waitForSelector('#dlg-journal[open]', { timeout: 15000 });
  console.log('notification → journal ouvert, ligne surlignée :', (await page.textContent('#journal-list .j-item.focus')).replace(/\s+/g, ' ').trim().slice(0, 80));
  await page.click('#journal-list .j-item.focus');
  await page.waitForSelector('#dlg-spot[open]');
  console.log('toucher la ligne → coin :', await page.textContent('#spot-name'));
  await page.screenshot({ path: `${OUT}/j2-coin.png` });
  console.log('ERREURS :', errors.length ? errors : 'aucune');
  await b.close();
})();
