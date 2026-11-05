import { SUPABASE_URL, SUPABASE_KEY, START } from './config.js';
import {
  SPECIES, speciesLabel, inSeason, seasonText, parseCoords, formatCoords, directionsUrl,
  sortSpots, filterSpots, spotSpecies, lastFinds, formatDate, todayIso, escapeHtml as esc, MONTHS,
  round6, MASSIFS, FORBIDDEN, TREES, SOILS, EXPOSURES, QUANTITIES, CONDITIONS, labelOf, exifGps,
  distanceM, bearingDeg, cardinal, formatDistance, exifDate, searchSpots, toGpx, toCsv,
} from './logic.js';
import { createPhotoStore, thumbPath } from './photos.js';
import { GUIDE, LEVELS, summarizeWeather, assess, forestToTrees, pacaGrid, rainColor, nearestTown } from './advisor.js';
import { dailyFor, forestAt, historyFor } from './weather.js';
import { historyRange, findConditions, spotProfile, personalAdvice, profileSummary } from './learn.js';
import { massifAt, accessFor, inFireSeason, DEPT_PAGES, ACCESS_ICON } from './access.js';
import { tilesFor, bestMaxZoom, PLAN_IGN, TILE_CACHE, TILE_LIMIT, isNetworkError, queue, mergePending, sendOrder } from './offline.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* privé */ } },
};

// Erreur éventuelle renvoyée dans l'URL par un lien magique expiré (lue avant que la lib ne nettoie l'URL).
const hashParams = new URLSearchParams(location.hash.slice(1));
const linkError = hashParams.get('error_code') || hashParams.get('error');

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const photos = createPhotoStore(sb);

const state = {
  user: null, profile: null,
  spots: [], finds: [], photos: [], shares: [], people: [],
  isAdmin: false, request: null,
  scope: store.get('champi-scope') || 'all',
  species: '',
  query: '',
  draft: null,          // { lat, lon, id?: string } pendant la création / modification
  openSpotId: null,
};

// ---------------------------------------------------------------------------
// Écrans

function show(screen) {
  for (const id of ['loading', 'login', 'denied', 'name', 'app']) $(`#screen-${id}`).hidden = id !== screen;
  if (screen === 'app') { initMap(); setTimeout(() => map.invalidateSize(), 50); }
}

let routing = Promise.resolve();
function route(session) { routing = routing.then(() => doRoute(session)).catch(fatal); return routing; }

async function doRoute(session) {
  state.user = session?.user ?? null;
  if (!state.user) { showLogin(); return; }

  const email = (state.user.email || '').toLowerCase();
  const snap = readSnapshot();
  if (snap && (!navigator.onLine)) { openFromSnapshot(snap); return; }
  const [allowed, admin, request] = await Promise.all([
    sb.from('champi_allowed_emails').select('email, label').eq('email', email),
    sb.from('champi_admins').select('email').eq('email', email),
    sb.from('champi_access_requests').select('display_name, message').eq('email', email).maybeSingle(),
  ]);
  for (const r of [allowed, admin, request]) {
    if (r.error && isNetworkError(r.error) && snap) { openFromSnapshot(snap); return; }
    if (r.error) throw r.error;
  }
  state.isAdmin = admin.data.length > 0;
  state.request = request.data;
  if (!allowed.data.length) { showDenied(); return; }
  const { data: profile, error: e2 } = await sb.from('champi_profiles')
    .select('id, display_name').eq('id', state.user.id).maybeSingle();
  if (e2) throw e2;
  if (!profile) {
    // Prénom déjà donné dans la demande d'accès : on crée le profil directement.
    const known = state.request?.display_name || allowed.data[0].label;
    if (known) {
      const { error } = await sb.from('champi_profiles').insert({ display_name: known });
      if (!error) {
        await sb.from('champi_access_requests').delete().eq('email', email);
        return doRoute(session);
      }
    }
    show('name'); $('#name-input').focus(); return;
  }
  state.profile = profile;
  $('#me-name').textContent = profile.display_name;
  show('app');
  $('#admin-btn').hidden = !state.isAdmin;
  await loadData();
  if (state.isAdmin) refreshAdminBadge().catch(fatal);
  if (!store.get('champi-tuto')) setTimeout(openTuto, 400);
}

function showDenied() {
  $('#denied-email').textContent = state.user.email;
  $('#request-form').hidden = !!state.request;
  $('#request-pending').hidden = !state.request;
  showError('#request-error');
  show('denied');
  if (!state.request) $('#request-name').focus();
}

function showLogin() {
  show('login');
  $('#login-form').hidden = false;
  $('#login-sent').hidden = true;
  const last = store.get('champi-email');
  if (last) $('#login-email').value = last;
  if (linkError && !showLogin.done) {
    showLogin.done = true;
    showError('#login-error', linkError === 'otp_expired'
      ? 'Ce lien a expiré ou a déjà servi. Demande un nouveau lien.'
      : 'Le lien de connexion n\'a pas fonctionné. Demande un nouveau lien.');
  }
}

function fatal(err) {
  console.error(err);
  toast(`Erreur : ${frError(err)}`, 6000);
}

function frError(err) {
  const msg = err?.message || String(err);
  if (err?.code === '42501' || /row-level security/i.test(msg)) return 'action non autorisée.';
  if (/email rate limit|over_email_send_rate_limit/i.test(msg + (err?.code ?? ''))) return 'trop d\'e-mails envoyés (limite de Supabase). Réessaie dans une heure, ou utilise le dernier code reçu.';
  if (err?.status === 429 || /rate limit|too many/i.test(msg)) return 'trop de tentatives, attends une minute.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'pas de réseau ?';
  if (/expired|invalid/i.test(msg) && /token|otp/i.test(msg)) return 'code invalide ou expiré.';
  return msg;
}

function showError(sel, text) { const el = $(sel); el.textContent = text || ''; el.hidden = !text; }

let toastTimer;
function toast(text, ms = 3000) {
  const t = $('#toast'); t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

function busy(btn, on) { if (btn) btn.disabled = on; }

// ---------------------------------------------------------------------------
// Connexion

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#login-email').value.trim().toLowerCase();
  const btn = e.submitter; busy(btn, true); showError('#login-error');
  const { error } = await sb.auth.signInWithOtp({
    email, options: { emailRedirectTo: new URL('./', location.href).href.split('#')[0].split('?')[0], shouldCreateUser: true },
  });
  busy(btn, false);
  if (error) { showError('#login-error', `Envoi impossible : ${frError(error)}`); return; }
  store.set('champi-email', email);
  $('#login-sent-to').textContent = email;
  $('#login-form').hidden = true;
  $('#login-sent').hidden = false;
  setTimeout(() => $('#login-code').focus(), 50);
});

$('#code-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = $('#login-code').value.trim();
  const email = store.get('champi-email') || $('#login-email').value.trim().toLowerCase();
  if (!/^\d{6,8}$/.test(token)) { showError('#login-error', 'Le code fait 6 chiffres.'); return; }
  const btn = e.submitter; busy(btn, true); showError('#login-error');
  const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
  busy(btn, false);
  if (error) showError('#login-error', `Connexion impossible : ${frError(error)}`);
});

$('#login-again').addEventListener('click', () => { $('#login-form').hidden = false; $('#login-sent').hidden = true; });
$$('.js-logout').forEach((b) => b.addEventListener('click', async () => {
  $('#menu').hidden = true;
  await sb.auth.signOut();
}));
$('#denied-retry').addEventListener('click', async () => {
  const { data } = await sb.auth.getSession();
  await route(data.session);
  if (!$('#screen-denied').hidden) toast('Pas encore acceptée. Réessaie un peu plus tard.');
});
$('#request-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const row = { display_name: $('#request-name').value.trim(), message: $('#request-msg').value.trim() || null };
  if (!row.display_name) return;
  const btn = e.submitter; busy(btn, true);
  const { error } = await sb.from('champi_access_requests').insert(row);
  busy(btn, false);
  if (error && error.code !== '23505') { showError('#request-error', `Envoi impossible : ${frError(error)}`); return; }
  state.request = row;
  showDenied();
});
$('#request-cancel').addEventListener('click', async () => {
  const { error } = await sb.from('champi_access_requests').delete().eq('email', state.user.email.toLowerCase());
  if (error) { showError('#request-error', frError(error)); return; }
  state.request = null;
  showDenied();
});

$('#name-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const display_name = $('#name-input').value.trim();
  if (!display_name) return;
  const btn = e.submitter; busy(btn, true);
  const { error } = await sb.from('champi_profiles').insert({ display_name });
  busy(btn, false);
  if (error) { showError('#name-error', frError(error)); return; }
  const { data } = await sb.auth.getSession();
  route(data.session);
});

// ---------------------------------------------------------------------------
// Carte

let map, bases, markersLayer, massifsLayer, draftMarker, accuracyCircle;
const IGN_ATTR = '© <a href="https://www.ign.fr/" target="_blank" rel="noopener">IGN</a> – Géoplateforme';

function ignLayer(layer, format) {
  return L.tileLayer(
    `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=${format}`,
    { maxZoom: 19, maxNativeZoom: 19, attribution: IGN_ATTR },
  );
}

function initMap() {
  if (map) return;
  bases = {
    plan: ignLayer('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png'),
    ortho: ignLayer('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg'),
    otm: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      subdomains: 'abc', maxZoom: 19, maxNativeZoom: 17,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, SRTM | style © <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)',
    }),
  };
  const view = JSON.parse(store.get('champi-view') || 'null') || START;
  map = L.map('map', { zoomControl: false, attributionControl: true })
    .setView([view.lat, view.lon], view.zoom);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  setBase(bases[store.get('champi-base')] ? store.get('champi-base') : 'plan', false);

  massifsLayer = buildMassifs();
  L.control.zoom({ position: 'topright', zoomInTitle: 'Zoomer', zoomOutTitle: 'Dézoomer' }).addTo(map);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
  const legend = L.control({ position: 'topleft' });
  legend.onAdd = () => {
    const d = L.DomUtil.create('div', 'legend');
    d.innerHTML = '<div><i style="background:var(--private)"></i>Moi seul</div><div><i style="background:var(--family)"></i>Famille</div><div><i style="background:var(--shared)"></i>Partagé</div><div><i style="background:var(--season)"></i>En saison</div>';
    return d;
  };
  legend.addTo(map);
  if (store.get('champi-massifs') === '1') massifsLayer.addTo(map);
  $('#toggle-massifs').checked = map.hasLayer(massifsLayer);
  setTimeout(() => { if (store.get('champi-forest') === '1') showForests(true); if (store.get('champi-rain') === '1') showRain(true); }, 0);

  map.on('moveend', () => {
    const c = map.getCenter();
    store.set('champi-view', JSON.stringify({ lat: round6(c.lat), lon: round6(c.lng), zoom: map.getZoom() }));
  });
  map.on('click', (e) => {
    $('#menu').hidden = true;
    if (state.draft) { moveDraft(e.latlng.lat, e.latlng.lng); return; }
    startDraft(e.latlng.lat, e.latlng.lng);
  });

  // Secours automatique : si un fond IGN n'envoie aucune tuile, on bascule sur OpenTopoMap.
  for (const name of ['plan', 'ortho']) {
    let ok = 0, ko = 0;
    bases[name].on('tileload', () => { ok++; });
    bases[name].on('tileerror', () => {
      ko++;
      if (ko >= 6 && ok === 0 && map.hasLayer(bases[name])) {
        setBase('otm', false);
        toast('Fond IGN indisponible : passage sur OpenTopoMap.', 5000);
      }
    });
  }
  markersLayer = L.layerGroup().addTo(map);
}

function setBase(name, remember = true) {
  for (const [k, layer] of Object.entries(bases)) if (k !== name && map.hasLayer(layer)) layer.remove();
  bases[name].addTo(map);
  if (remember) store.set('champi-base', name);
  for (const b of $$('#base-seg button')) b.classList.toggle('on', b.dataset.base === name);
}
for (const b of $$('#base-seg button')) b.addEventListener('click', () => setBase(b.dataset.base));

function buildMassifs() {
  const g = L.layerGroup();
  for (const m of MASSIFS) {
    L.circle([m.lat, m.lon], { radius: m.r, color: '#2f6b3a', weight: 2, dashArray: '6 6', fillOpacity: 0.06, interactive: false })
      .bindTooltip(m.name, { permanent: true, direction: 'center', className: 'massif-label' }).addTo(g);
  }
  for (const f of FORBIDDEN) {
    L.circle([f.lat, f.lon], { radius: f.r, color: '#c0001a', weight: 2, fillColor: '#e0001f', fillOpacity: 0.35 })
      .bindTooltip('⛔ Forêt relique : interdit', { permanent: true, direction: 'bottom', offset: [0, 8], className: 'massif-label forbidden-label' })
      .bindPopup('<b>Forêt relique de la Sainte-Baume</b><br>Cueillette interdite.').addTo(g);
  }
  return g;
}

function pinIcon(kind, seasonal = false, draft = false) {
  const color = kind === 'family' ? 'var(--family)' : kind === 'shared' ? 'var(--shared)' : kind === 'draft' ? 'var(--primary)' : 'var(--private)';
  return L.divIcon({
    className: '',
    iconSize: [30, 40], iconAnchor: [15, 40], popupAnchor: [0, -36],
    html: `<div class="pin${draft ? ' draft' : ''}"><svg viewBox="0 0 30 40" aria-hidden="true">
      <path d="M15 1C7.3 1 1 7.2 1 14.9 1 25.3 15 39 15 39s14-13.7 14-24.1C29 7.2 22.7 1 15 1z" style="fill:${color}" stroke="#fff" stroke-width="2"/>
      <path d="M8 15.5c0-4 3.2-6.6 7-6.6s7 2.6 7 6.6z" fill="#fff"/><rect x="13" y="15.5" width="4" height="5.5" rx="1.5" fill="#fff"/>
    </svg>${seasonal ? '<span class="dot"></span>' : ''}</div>`,
  });
}

// ---------------------------------------------------------------------------
// Données

async function loadData() {
  // Affichage immédiat de la copie locale (ouverture rapide, réseau faible en forêt), puis mise à jour.
  const snap0 = readSnapshot();
  if (snap0 && !state.loadedOnce) {
    Object.assign(state, { spots: snap0.spots, finds: snap0.finds, photos: snap0.photos, shares: snap0.shares ?? [], people: snap0.people ?? [] });
    state.loadedOnce = true;
    await applyPending(); render();
  }
  if (!navigator.onLine && snap0) {
    Object.assign(state, { spots: snap0.spots, finds: snap0.finds, photos: snap0.photos, shares: snap0.shares ?? [], people: snap0.people ?? [], offlineSince: snap0.at });
    await applyPending(); render(); updateOfflineBar();
    return;
  }
  const [spots, finds, shares, people, pics] = await Promise.all([
    sb.from('champi_spots').select('id, owner, visibility, name, lat, lon, species, note, trees, soil, exposure, access, altitude, forest_type, created_at, updated_at, author:champi_profiles(display_name)'),
    sb.from('champi_finds').select('id, spot_id, user_id, found_on, species, note, quantity, condition, weather, created_at, author:champi_profiles(display_name)')
      .order('found_on', { ascending: false }).order('created_at', { ascending: false }),
    sb.from('champi_spot_shares').select('spot_id, user_id'),
    sb.from('champi_profiles').select('id, display_name').order('display_name'),
    sb.from('champi_photos').select('id, spot_id, find_id, user_id, path, created_at, author:champi_profiles(display_name)')
      .order('created_at', { ascending: true }),
  ]);
  const failed = [spots, finds, pics].find((r) => r.error);
  if (failed) {
    const snap = isNetworkError(failed.error) ? readSnapshot() : null;
    if (!snap) throw failed.error;
    Object.assign(state, { spots: snap.spots, finds: snap.finds, photos: snap.photos, shares: snap.shares ?? [], people: snap.people ?? [], offlineSince: snap.at });
  } else {
    state.spots = spots.data;
    state.finds = finds.data;
    state.photos = pics.data;
    state.shares = shares.data ?? [];
    state.people = people.data ?? [];
    state.offlineSince = null;
    writeSnapshot();
  }
  await applyPending();
  render();
  updateOfflineBar();
  openSpotFromHash();
  if (state.openSpotId && $('#dlg-spot').open) renderSpot(state.openSpotId);
}

const month = () => new Date().getMonth() + 1;

function render() {
  decorateShares();
  const me = state.user?.id;
  const visible = searchSpots(filterSpots(state.spots, state.finds, { scope: state.scope, species: state.species, me }), state.finds, state.query);
  const sorted = sortSpots(visible, state.finds);
  const last = lastFinds(state.finds);

  markersLayer.clearLayers();
  for (const s of sorted) {
    if (state.draft?.id === s.id) continue;
    const seasonal = inSeason(spotSpecies(s, state.finds), month()).length > 0;
    L.marker([s.lat, s.lon], { icon: pinIcon(s.sharedWithMe ? 'shared' : s.visibility, seasonal), title: s.name, keyboard: true })
      .on('click', () => openSpot(s.id)).addTo(markersLayer);
  }

  const n = sorted.length;
  $('#peek-count').textContent = `${n} coin${n > 1 ? 's' : ''}`;
  $('#list-empty').hidden = n > 0;
  $('#spot-list').innerHTML = sorted.map((s) => {
    const sp = spotSpecies(s, state.finds);
    const season = inSeason(sp, month());
    const lf = last.get(s.id);
    const author = s.visibility === 'family' && s.owner !== me ? ` · par ${esc(s.author?.display_name ?? '?')}` : '';
    return `<li><button class="spot-item ${s.sharedWithMe ? 'shared' : s.visibility}" data-id="${s.id}" type="button">
      <span class="grow">
        <span class="title">${esc(s.name)}${s.pending ? ' <span class="pending-tag">⏳ en attente d\'envoi</span>' : ''}</span>
        <span class="badges">${badgesHtml(s, season)}</span>
        <span class="meta">${sp.length ? esc(sp.map(speciesLabel).join(', ')) : 'Aucune espèce notée'}</span>
        <span class="meta">${lf ? `Dernière trouvaille : ${formatDate(lf)}` : 'Pas encore de trouvaille'}${author}</span>
      </span></button></li>`;
  }).join('');
  $('#hint').hidden = !!state.draft || state.spots.length > 0;
}

function badgesHtml(s, season) {
  const names = (ids) => ids.map((id) => state.people.find((p) => p.id === id)?.display_name ?? '?').join(', ');
  const vis = s.sharedWithMe ? `<span class="badge shared">🤝 Partagé par ${esc(s.author?.display_name ?? '?')}</span>`
    : s.visibility === 'family' ? '<span class="badge family">👪 Famille</span>'
    : '<span class="badge private">🔒 Moi seul</span>' + (s.sharedWith?.length ? `<span class="badge shared">🤝 ${esc(names(s.sharedWith))}</span>` : '');
  const peak = season.some((x) => x.peak);
  const seasonBadge = season.length
    ? `<span class="badge season" title="${esc(season.map((x) => x.label).join(', '))}">🍄 En saison${peak ? ' · pic' : ''}</span>` : '';
  return vis + seasonBadge;
}

$('#spot-list').addEventListener('click', (e) => {
  const b = e.target.closest('.spot-item'); if (!b) return;
  const s = state.spots.find((x) => x.id === b.dataset.id); if (!s) return;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  map.setView([s.lat, s.lon], Math.max(map.getZoom(), 15));
  openSpot(s.id);
});

// Filtres
for (const b of $$('.topbar .seg button')) {
  b.addEventListener('click', () => { state.scope = b.dataset.scope; store.set('champi-scope', state.scope); syncScope(); render(); });
}
function syncScope() {
  for (const b of $$('.topbar .seg button')) {
    const on = b.dataset.scope === state.scope; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on));
  }
}
$('#filter-species').innerHTML += SPECIES.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
$('#filter-species').addEventListener('change', (e) => { state.species = e.target.value; render(); });
syncScope();

// Menu
$('#menu-btn').addEventListener('click', () => { $('#menu').hidden = !$('#menu').hidden; });
$('#toggle-massifs').addEventListener('change', (e) => {
  if (e.target.checked) massifsLayer.addTo(map); else massifsLayer.remove();
  store.set('champi-massifs', e.target.checked ? '1' : '0');
});
function syncTheme() {
  const t = store.get('champi-theme') || '';
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  for (const b of $$('#theme-seg button')) b.classList.toggle('on', b.dataset.theme === t);
}
for (const b of $$('#theme-seg button')) b.addEventListener('click', () => { store.set('champi-theme', b.dataset.theme || null); syncTheme(); });
syncTheme();

$('#search').addEventListener('input', (e) => { state.query = e.target.value; render(); });
$('#peek').addEventListener('click', () => $('#list').scrollIntoView({ behavior: 'smooth' }));

// ---------------------------------------------------------------------------
// Création / modification d'un coin

function startDraft(lat, lon, existing = null) {
  cancelDraft();
  state.draft = { lat: round6(lat), lon: round6(lon), id: existing?.id ?? null, existing };
  draftMarker = L.marker([lat, lon], { icon: pinIcon('draft', false, true), draggable: true, autoPan: true, zIndexOffset: 1000 })
    .on('dragend', () => { const p = draftMarker.getLatLng(); moveDraft(p.lat, p.lng); })
    .addTo(map);
  if (existing) render();
  showAdjust();
}

function moveDraft(lat, lon) {
  if (!state.draft) return;
  state.draft.lat = round6(lat); state.draft.lon = round6(lon);
  draftMarker.setLatLng([lat, lon]);
}

function cancelDraft() {
  if (draftMarker) { draftMarker.remove(); draftMarker = null; }
  if (accuracyCircle) { accuracyCircle.remove(); accuracyCircle = null; }
  const had = state.draft?.id;
  state.draft = null;
  $('#adjust-bar').hidden = true;
  $('.fab-row').hidden = false;
  if (had) render();
}

function showAdjust() {
  $('#adjust-bar').hidden = false;
  $('.fab-row').hidden = true;
  $('#hint').hidden = true;
}

$('#adjust-cancel').addEventListener('click', cancelDraft);
$('#adjust-done').addEventListener('click', () => { $('#adjust-bar').hidden = true; openEdit(); });

const chipsHtml = (selected, withSeason = true) => SPECIES.map((s) => {
  const on = selected.includes(s.id);
  const inNow = withSeason && s.months.includes(month());
  return `<button type="button" class="chip${on ? ' on' : ''}" data-sp="${s.id}" aria-pressed="${on}" title="${esc(seasonText(s.id))}">${esc(s.label)}${inNow ? ' <span class="in">●</span>' : ''}</button>`;
}).join('');
function chipValues(sel) { return $$(`${sel} .chip.on`).map((c) => c.dataset.sp); }
const treeChips = (selected) => TREES.map((t) => {
  const on = selected.includes(t.id);
  return `<button type="button" class="chip${on ? ' on' : ''}" data-sp="${t.id}" aria-pressed="${on}">${esc(t.label)}</button>`;
}).join('');
const options = (list) => list.map((x) => (typeof x === 'string' ? `<option value="${x}">${x}</option>` : `<option value="${x.id}">${esc(x.label)}</option>`)).join('');
$('#edit-soil').innerHTML += options(SOILS);
$('#edit-exposure').innerHTML += options(EXPOSURES);
$('#find-quantity').innerHTML += options(QUANTITIES);
$('#find-condition').innerHTML += options(CONDITIONS);
for (const sel of ['#edit-species', '#find-species', '#edit-trees']) {
  $(sel).addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    c.classList.toggle('on'); c.setAttribute('aria-pressed', String(c.classList.contains('on')));
  });
}

let editVis = 'private';
for (const b of $$('#edit-vis button')) b.addEventListener('click', () => { editVis = b.dataset.vis; syncVis(); });
function syncVis() { for (const b of $$('#edit-vis button')) b.classList.toggle('on', b.dataset.vis === editVis); }

let editFormFilled = false;
function openEdit() {
  const d = state.draft; if (!d) return;
  if (!editFormFilled) {
    const s = d.existing;
    $('#edit-title').textContent = s ? 'Modifier le coin' : 'Nouveau coin';
    $('#edit-name').value = s?.name ?? '';
    $('#edit-note').value = s?.note ?? '';
    editVis = s?.visibility ?? (store.get('champi-last-vis') || 'private');
    $('#edit-species').innerHTML = chipsHtml(s?.species ?? []);
    $('#edit-trees').innerHTML = treeChips(s?.trees ?? []);
    $('#edit-soil').value = s?.soil ?? '';
    $('#edit-exposure').value = s?.exposure ?? '';
    $('#edit-access').value = s?.access ?? '';
    $('#edit-altitude').value = s?.altitude ?? '';
    $('#edit-altitude').dataset.auto = s?.altitude != null ? 'no' : 'yes';
    $('#edit-alt-src').textContent = '';
    $('#edit-more').open = !!(s && (s.trees?.length || s.soil || s.exposure || s.access || s.altitude != null));
    $('#edit-delete').hidden = !s;
    editFormFilled = true;
  }
  syncVis();
  $('#edit-coords').textContent = formatCoords(d.lat, d.lon);
  $('#edit-photo').hidden = !d.photo;
  if (d.photo) $('#edit-photo-img').src = URL.createObjectURL(d.photo);
  fillAltitude(d);
  fillForest(d);
  showError('#edit-error');
  $('#dlg-edit').showModal();
  if (!d.existing) setTimeout(() => $('#edit-name').focus(), 50);
}

// Altitude automatique (service IGN, sans clé) tant que l'utilisateur ne l'a pas saisie lui-même.
async function fetchAltitude(lat, lon) {
  try {
    const r = await fetch(`https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=${lon}&lat=${lat}&resource=ign_rge_alti_wld&zonly=true`);
    const z = (await r.json()).elevations?.[0];
    return typeof z === 'number' && z > -500 && z < 5000 ? Math.round(z) : null;
  } catch { return null; }
}
async function fillAltitude(d) {
  const input = $('#edit-altitude');
  const key = `${d.lat},${d.lon}`;
  if (input.dataset.auto !== 'yes' || input.dataset.for === key) return;
  input.dataset.for = key;
  const z = await fetchAltitude(d.lat, d.lon);
  if (z != null && input.dataset.auto === 'yes' && state.draft === d) {
    input.value = z; $('#edit-alt-src').textContent = '(IGN, automatique)';
  }
}
// Type de forêt IGN sous l'épingle, avec proposition de cocher les arbres correspondants.
async function fillForest(d) {
  const box = $('#edit-forest');
  const key = `${d.lat},${d.lon}`;
  if (box.dataset.for === key) return;
  box.dataset.for = key;
  if (d.existing?.forest_type && d.lat === d.existing.lat && d.lon === d.existing.lon) { d.forest = d.existing.forest_type; showForest(d); return; }
  box.hidden = false; box.textContent = '🌲 Lecture du type de forêt (IGN)…';
  try {
    const f = await forestAt(d.lat, d.lon);
    if (state.draft !== d) return;
    d.forest = f.tfv || 'Pas de forêt cartographiée ici';
  } catch { d.forest = null; box.hidden = true; return; }
  showForest(d);
}
function showForest(d) {
  const box = $('#edit-forest');
  const sugg = forestToTrees(d.forest).filter((t) => !chipValues('#edit-trees').includes(t));
  box.hidden = !d.forest;
  box.innerHTML = `🌲 <b>Forêt IGN</b> : ${esc(d.forest)}`
    + (sugg.length ? ` <button type="button" class="btn link" id="forest-apply">Cocher ${esc(sugg.map((t) => labelOf(TREES, t)).join(', '))}</button>` : '');
  $('#forest-apply')?.addEventListener('click', () => {
    for (const t of sugg) { const c = $(`#edit-trees [data-sp="${t}"]`); if (c) { c.classList.add('on'); c.setAttribute('aria-pressed', 'true'); } }
    showForest(d);
  });
}
$('#edit-altitude').addEventListener('input', () => { $('#edit-altitude').dataset.auto = 'no'; $('#edit-alt-src').textContent = ''; });
$('#edit-photo-drop').addEventListener('click', () => { if (state.draft) state.draft.photo = null; $('#edit-photo').hidden = true; });

function closeEdit(discard) {
  $('#dlg-edit').close();
  if (discard) { editFormFilled = false; cancelDraft(); }
}

$('#dlg-edit').addEventListener('cancel', (e) => { e.preventDefault(); closeEdit(true); });
$('#edit-move').addEventListener('click', () => { $('#dlg-edit').close(); showAdjust(); map.panTo([state.draft.lat, state.draft.lon]); });

$('#edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (e.submitter?.value === 'cancel') { closeEdit(true); return; }
  const d = state.draft; if (!d) return;
  const row = {
    name: $('#edit-name').value.trim(),
    visibility: editVis,
    species: chipValues('#edit-species'),
    note: $('#edit-note').value.trim() || null,
    lat: d.lat, lon: d.lon,
    trees: chipValues('#edit-trees'),
    soil: $('#edit-soil').value || null,
    exposure: $('#edit-exposure').value || null,
    access: $('#edit-access').value.trim() || null,
    altitude: $('#edit-altitude').value === '' ? null : Math.round(Number($('#edit-altitude').value)),
    forest_type: d.forest && !d.forest.startsWith('Pas de forêt') ? d.forest.slice(0, 150) : (d.forest ? null : d.existing?.forest_type ?? null),
  };
  if (!row.name) { showError('#edit-error', 'Donne un nom au coin.'); return; }
  const btn = $('#edit-save'); busy(btn, true);
  if (!d.id) row.id = crypto.randomUUID();      // identifiant choisi ici : permet de créer le coin hors ligne
  const q = d.id
    ? sb.from('champi_spots').update(row).eq('id', d.id).select('id').single()
    : sb.from('champi_spots').insert(row).select('id').single();
  const { data, error } = await q;
  busy(btn, false);
  if (error && !d.id && isNetworkError(error)) {
    await queue.add({ kind: 'spot', row, photo: d.photo ?? null });
    closeEdit(true);
    toast('📴 Pas de réseau : coin gardé sur le téléphone, envoi au retour du réseau.', 5000);
    await applyPending(); render(); updateOfflineBar();
    openSpot(row.id);
    return;
  }
  if (error) { showError('#edit-error', isNetworkError(error) ? 'Pas de réseau : la modification d\'un coin existant doit attendre le retour du réseau.' : `Enregistrement impossible : ${frError(error)}`); return; }
  store.set('champi-last-vis', row.visibility);
  const pending = d.photo;
  closeEdit(true);
  toast(d.id ? 'Coin modifié ✔' : 'Coin enregistré ✔');
  if (pending) {
    try { await photos.upload({ spotId: data.id, file: pending }); }
    catch (err) { toast(`Coin enregistré, mais photo non envoyée : ${frError(err)}`, 6000); }
  }
  await loadData();
  openSpot(data.id);
});

$('#edit-delete').addEventListener('click', async () => {
  const d = state.draft; if (!d?.id) return;
  if (!confirm(`Supprimer « ${d.existing.name} », tout son journal et ses photos ?`)) return;
  try { await photos.removeFiles(state.photos.filter((p) => p.spot_id === d.id)); }
  catch (err) { showError('#edit-error', `Photos non supprimées : ${frError(err)}`); return; }
  const { error } = await sb.from('champi_spots').delete().eq('id', d.id);
  if (error) { showError('#edit-error', frError(error)); return; }
  closeEdit(true);
  toast('Coin supprimé');
  await loadData();
});

// « Je suis ici »
$('#btn-here').addEventListener('click', () => {
  if (!navigator.geolocation) { toast('Géolocalisation indisponible sur cet appareil.'); return; }
  const btn = $('#btn-here'); busy(btn, true); toast('Recherche de ta position…', 15000);
  navigator.geolocation.getCurrentPosition((pos) => {
    busy(btn, false); $('#toast').hidden = true;
    const { latitude: lat, longitude: lon, accuracy } = pos.coords;
    map.setView([lat, lon], Math.max(map.getZoom(), 16));
    startDraft(lat, lon);
    accuracyCircle = L.circle([lat, lon], { radius: accuracy, color: '#2b7cd3', weight: 1, fillOpacity: 0.1, interactive: false }).addTo(map);
    if (accuracy > 50) toast(`Précision : ± ${Math.round(accuracy)} m. Ajuste l'épingle si besoin.`, 5000);
  }, (err) => {
    busy(btn, false);
    toast(err.code === 1 ? 'Autorise la localisation pour ce site dans les réglages du téléphone.' : 'Position introuvable. Réessaie à découvert.', 5000);
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
});

// Coller des coordonnées
$('#btn-coords').addEventListener('click', () => {
  $('#coords-input').value = ''; showError('#coords-error');
  $('#dlg-coords').showModal();
});
$('#coords-form').addEventListener('submit', (e) => {
  if (e.submitter?.value === 'cancel') return;
  const p = parseCoords($('#coords-input').value);
  if (!p) { e.preventDefault(); showError('#coords-error', 'Format non reconnu. Exemple : 43.5297, 5.4474'); return; }
  setTimeout(() => { map.setView([p.lat, p.lon], 16); startDraft(p.lat, p.lon); }, 0);
});
$('#coords-photo').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  const p = exifGps(await file.arrayBuffer());
  if (!p) { showError('#coords-error', 'Pas de position dans cette photo : le téléphone l\'a sans doute retirée. Place l\'épingle à la main.'); return; }
  $('#dlg-coords').close();
  map.setView([p.lat, p.lon], 16);
  startDraft(p.lat, p.lon);
  state.draft.photo = file;
  toast('Position lue dans la photo 📷');
});

// ---------------------------------------------------------------------------
// Détail d'un coin et journal

function openSpot(id) {
  state.openSpotId = id;
  renderSpot(id);
  if (!$('#dlg-spot').open) $('#dlg-spot').showModal();
}

function renderSpot(id) {
  const s = state.spots.find((x) => x.id === id);
  if (!s) { $('#dlg-spot').close(); return; }
  const me = state.user.id;
  const sp = spotSpecies(s, state.finds);
  const season = inSeason(sp, month());
  const mine = s.owner === me;
  $('#spot-name').textContent = s.name;
  $('#spot-badges').innerHTML = badgesHtml(s, season)
    + (s.visibility === 'family' ? `<span class="badge">par ${esc(mine ? 'moi' : s.author?.display_name ?? '?')}</span>` : '');
  $('#spot-species').innerHTML = sp.length
    ? sp.map((x) => {
      const inNow = season.find((y) => y.id === x);
      return `<span class="chip" title="${esc(seasonText(x))}">${esc(speciesLabel(x))}${inNow ? ` <span class="in">● ${inNow.peak ? 'pic' : 'en saison'}</span>` : ''}</span>`;
    }).join('')
    : '<span class="muted small">Aucune espèce notée</span>';
  $('#spot-note').textContent = s.note || '';
  $('#spot-note').hidden = !s.note;
  const det = [
    ['Arbres', (s.trees ?? []).map((t) => labelOf(TREES, t)).join(', ')],
    ['Terrain', s.soil ? labelOf(SOILS, s.soil) : ''],
    ['Exposition', s.exposure ?? ''],
    ['Altitude', s.altitude != null ? `${s.altitude} m` : ''],
    ['Forêt IGN', s.forest_type ?? ''],
    ['Accès', s.access ?? ''],
  ].filter(([, v]) => v);
  $('#spot-details').innerHTML = det.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  $('#spot-details').hidden = !det.length;
  $('#spot-coords').textContent = `📌 ${formatCoords(s.lat, s.lon)}`;
  $('#spot-photos').innerHTML = thumbs(state.photos.filter((p) => p.spot_id === id && !p.find_id));
  $('#spot-photo-add').hidden = !mine || !!s.pending;
  renderMeteo(s);
  renderAccess(s);
  renderBilan(s);
  $('#spot-route').href = directionsUrl(s.lat, s.lon);
  $('#spot-edit').hidden = !mine || !!s.pending;
  $('#spot-share').hidden = !mine || !!s.pending || s.visibility !== 'private';
  $('#spot-share').textContent = s.sharedWith?.length ? `🤝 Partagé (${s.sharedWith.length})` : '🤝 Partager…';
  $('#spot-unshare').hidden = !s.sharedWithMe;

  const finds = state.finds.filter((f) => f.spot_id === id);
  $('#find-list').innerHTML = finds.length ? finds.map((f) => `<li>
      <div class="head"><span>${formatDate(f.found_on)}${f.pending ? ` <span class="pending-tag">⏳ en attente d'envoi${f.pendingPhotos ? ` (${f.pendingPhotos} photo${f.pendingPhotos > 1 ? 's' : ''})` : ''}</span>` : ''}</span>
        ${f.user_id === me && !f.pending ? `<button class="del" type="button" data-find="${f.id}">Supprimer</button>` : ''}</div>
      <div class="small muted">par ${esc(f.user_id === me ? 'moi' : f.author?.display_name ?? '?')}${f.species?.length ? ' · ' + esc(f.species.map(speciesLabel).join(', ')) : ''}</div>
      ${findDetails(f)}
      ${f.note ? `<div class="note">${esc(f.note)}</div>` : ''}
      <div class="photos">${thumbs(state.photos.filter((p) => p.find_id === f.id))}</div>
    </li>`).join('') : '<li class="muted small">Pas encore de trouvaille notée.</li>';
  photos.hydrate($('#dlg-spot')).catch((err) => console.warn('photos', err));

  $('#find-add').open = false;
  $('#find-date').value = todayIso();
  $('#find-date').max = todayIso();
  $('#find-note').value = '';
  $('#find-species').innerHTML = chipsHtml([], true);
  $('#find-quantity').value = ''; $('#find-condition').value = ''; $('#find-weather').value = '';
  setFindFiles([]);
  showError('#find-error');
}

function thumbs(list) {
  return list.map((p) => `<button type="button" class="thumb" data-photo="${p.id}" aria-label="Voir la photo"><img data-path="${esc(thumbPath(p.path))}" alt=""></button>`).join('');
}
function findDetails(f) {
  const bits = [f.quantity && labelOf(QUANTITIES, f.quantity), f.condition && labelOf(CONDITIONS, f.condition), f.weather && `météo : ${f.weather}`].filter(Boolean);
  return bits.length ? `<div class="small">${esc(bits.join(' · '))}</div>` : '';
}

// Photos à joindre à une trouvaille (aperçus locaux avant envoi)
let findFiles = [];
function setFindFiles(files) {
  findFiles = files;
  $('#find-previews').innerHTML = files.map((f, i) => `<span class="thumb"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" class="x" data-drop="${i}" aria-label="Retirer">✕</button></span>`).join('');
}
$('#find-photos').addEventListener('change', async (e) => {
  const added = [...e.target.files]; e.target.value = '';
  const first = !findFiles.length;
  setFindFiles([...findFiles, ...added].slice(0, 6));
  // Date de prise de vue de la photo → date de la trouvaille (si l'utilisateur ne l'a pas changée).
  if (first && added[0] && $('#find-date').value === todayIso()) {
    const d = exifDate(await added[0].arrayBuffer());
    if (d && d <= todayIso() && d !== todayIso()) { $('#find-date').value = d; toast(`Date reprise de la photo : ${formatDate(d)}`); }
  }
});
$('#find-previews').addEventListener('click', (e) => {
  const b = e.target.closest('[data-drop]'); if (!b) return;
  setFindFiles(findFiles.filter((_, i) => i !== Number(b.dataset.drop)));
});

async function uploadAll(spotId, findId, files) {
  let failed = 0;
  for (let i = 0; i < files.length; i++) {
    toast(`Envoi des photos ${i + 1}/${files.length}…`, 60000);
    try { await photos.upload({ spotId, findId, file: files[i] }); } catch (err) { failed++; console.warn(err); }
  }
  $('#toast').hidden = true;
  if (failed) toast(`${failed} photo(s) non envoyée(s). Réessaie avec un meilleur réseau.`, 6000);
}

$('#spot-photo-input').addEventListener('change', async (e) => {
  const files = [...e.target.files].slice(0, 6); e.target.value = '';
  if (!files.length || !state.openSpotId) return;
  await uploadAll(state.openSpotId, null, files);
  await loadData();
});

// Visionneuse
let viewing = null;
$('#dlg-spot').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-photo]'); if (!b) return;
  const p = state.photos.find((x) => x.id === b.dataset.photo); if (!p) return;
  viewing = p;
  $('#photo-full').removeAttribute('src');
  $('#photo-meta').textContent = `par ${p.user_id === state.user.id ? 'moi' : p.author?.display_name ?? '?'} · ${formatDate(p.created_at)}`;
  $('#photo-delete').hidden = p.user_id !== state.user.id;
  $('#dlg-photo').showModal();
  try { $('#photo-full').src = (await photos.urls([p.path]))[p.path]; } catch (err) { toast(frError(err)); }
});
$('#dlg-photo .js-close').addEventListener('click', () => $('#dlg-photo').close());
$('#photo-delete').addEventListener('click', async () => {
  if (!viewing || !confirm('Supprimer cette photo ?')) return;
  try { await photos.remove(viewing); } catch (err) { toast(frError(err)); return; }
  $('#dlg-photo').close();
  await loadData();
});

$('#dlg-spot').addEventListener('close', () => { state.openSpotId = null; });
$('#spot-compass').addEventListener('click', () => {
  const s = state.spots.find((x) => x.id === state.openSpotId); if (s) openCompass(s);
});
$('#dlg-spot .js-close').addEventListener('click', () => $('#dlg-spot').close());
$('#dlg-spot').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
$('#spot-edit').addEventListener('click', () => {
  const s = state.spots.find((x) => x.id === state.openSpotId); if (!s) return;
  $('#dlg-spot').close();
  editFormFilled = false;
  startDraft(s.lat, s.lon, s);
  $('#adjust-bar').hidden = true;
  openEdit();
});

$('#find-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const row = {
    spot_id: state.openSpotId,
    found_on: $('#find-date').value,
    species: chipValues('#find-species'),
    note: $('#find-note').value.trim() || null,
    quantity: $('#find-quantity').value || null,
    condition: $('#find-condition').value || null,
    weather: $('#find-weather').value.trim() || null,
  };
  row.id = crypto.randomUUID();
  const btn = e.submitter; busy(btn, true);
  const spotPending = state.spots.find((s) => s.id === row.spot_id)?.pending;
  const { data, error } = spotPending ? { error: { message: 'Failed to fetch (coin pas encore envoyé)' } }
    : await sb.from('champi_finds').insert(row).select('id').single();
  if (error && isNetworkError(error)) {
    await queue.add({ kind: 'find', row, files: [...findFiles] });
    busy(btn, false);
    toast('📴 Pas de réseau : trouvaille gardée sur le téléphone, envoi au retour du réseau.', 5000);
    await applyPending(); render(); updateOfflineBar();
    renderSpot(row.spot_id);
    return;
  }
  if (error) { busy(btn, false); showError('#find-error', `Ajout impossible : ${frError(error)}`); return; }
  const files = findFiles;
  if (files.length) await uploadAll(row.spot_id, data.id, files);
  busy(btn, false);
  toast('Trouvaille notée ✔');
  await loadData();
});

$('#find-list').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-find]'); if (!b) return;
  if (!confirm('Supprimer cette trouvaille et ses photos ?')) return;
  try { await photos.removeFiles(state.photos.filter((p) => p.find_id === b.dataset.find)); }
  catch (err) { toast(frError(err)); return; }
  const { error } = await sb.from('champi_finds').delete().eq('id', b.dataset.find);
  if (error) { toast(frError(error)); return; }
  await loadData();
});

// ---------------------------------------------------------------------------
// Démarrage

sb.auth.onAuthStateChange((event, session) => {
  // Ne pas appeler Supabase directement dans ce rappel (recommandation de la lib).
  if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
    setTimeout(() => route(session), 0);
  }
});

// ---------------------------------------------------------------------------
// Boussole « Retrouver mon coin »

const compass = { target: null, pos: null, heading: null, watch: null, wake: null };
function compassRender() {
  const c = compass; if (!c.target) return;
  const box = $('.compass');
  if (!c.pos) { $('#compass-dist').textContent = '…'; $('#compass-dir').textContent = 'Recherche de ta position…'; return; }
  const d = distanceM(c.pos, c.target);
  const b = bearingDeg(c.pos, c.target);
  const here = d <= Math.max(15, c.pos.acc || 0);
  box.classList.toggle('here', here);
  box.classList.toggle('relative', c.heading != null);
  // Avec boussole : la flèche montre la direction à suivre. Sans : elle est orientée nord en haut.
  const rot = c.heading != null ? b - c.heading : b;
  $('#compass-arrow').style.transform = `rotate(${rot}deg)`;
  $('#compass-dist').textContent = here ? 'Tu y es ! 🍄' : formatDistance(d);
  $('#compass-dir').textContent = here ? '' : `vers le ${cardinal(b)} (${Math.round(b)}°)${c.heading == null ? ' · nord en haut' : ''}`;
  $('#compass-acc').textContent = c.pos.acc ? `Précision GPS : ± ${Math.round(c.pos.acc)} m` : '';
}
function onOrientation(e) {
  let h = null;
  if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;               // iPhone
  else if (e.absolute && typeof e.alpha === 'number') h = 360 - e.alpha;                    // Android
  if (h != null) {
    const angle = screen.orientation?.angle ?? 0;
    compass.heading = (h + angle + 360) % 360;
    $('#compass-enable').hidden = true;
    compassRender();
  }
}
async function enableOrientation() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') { toast('Boussole refusée : la flèche restera orientée nord en haut.'); return; }
    }
    window.addEventListener('deviceorientationabsolute', onOrientation);
    window.addEventListener('deviceorientation', onOrientation);
  } catch { /* pas de capteur */ }
}
async function openCompass(s) {
  compass.target = { lat: s.lat, lon: s.lon }; compass.pos = null; compass.heading = null;
  $('#compass-name').textContent = `🧭 ${s.name}`;
  $('#compass-enable').hidden = !(typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function');
  if ($('#compass-enable').hidden) enableOrientation();
  $('#dlg-compass').showModal();
  $('#dlg-compass').scrollTop = 0;
  $('#dlg-compass .js-close').focus();
  compassRender();
  if (!navigator.geolocation) { $('#compass-dir').textContent = 'Géolocalisation indisponible.'; return; }
  compass.watch = navigator.geolocation.watchPosition((p) => {
    compass.pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
    compassRender();
  }, (err) => { $('#compass-dir').textContent = err.code === 1 ? 'Autorise la localisation pour ce site.' : 'Position introuvable pour l\'instant…'; },
  { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 });
  try { compass.wake = await navigator.wakeLock?.request('screen'); } catch { /* écran : pas grave */ }
}
function closeCompass() {
  if (compass.watch != null) navigator.geolocation.clearWatch(compass.watch);
  window.removeEventListener('deviceorientationabsolute', onOrientation);
  window.removeEventListener('deviceorientation', onOrientation);
  compass.wake?.release?.().catch(() => {});
  Object.assign(compass, { target: null, watch: null, wake: null });
}
$('#compass-enable').addEventListener('click', enableOrientation);
$('#dlg-compass .js-close').addEventListener('click', () => $('#dlg-compass').close());
$('#dlg-compass').addEventListener('close', closeCompass);

// ---------------------------------------------------------------------------
// Exports (GPX pour OsmAnd / Garmin, CSV pour tableur)

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
$('#export-gpx').addEventListener('click', () => {
  $('#menu').hidden = true;
  download(`coins-champignons-${todayIso()}.gpx`, toGpx(state.spots), 'application/gpx+xml');
  toast(`${state.spots.length} coin(s) exporté(s)`);
});
$('#export-csv').addEventListener('click', () => {
  $('#menu').hidden = true;
  const byId = new Map(state.spots.map((s) => [s.id, s]));
  const rows = state.finds.map((f) => ({ f, s: byId.get(f.spot_id) }));
  download(`journal-champignons-${todayIso()}.csv`, toCsv(rows, [
    ['Date', (r) => r.f.found_on], ['Coin', (r) => r.s?.name], ['Latitude', (r) => r.s?.lat], ['Longitude', (r) => r.s?.lon],
    ['Espèces', (r) => (r.f.species ?? []).map(speciesLabel).join(', ')], ['Quantité', (r) => r.f.quantity && labelOf(QUANTITIES, r.f.quantity)],
    ['État', (r) => r.f.condition && labelOf(CONDITIONS, r.f.condition)], ['Météo', (r) => r.f.weather], ['Note', (r) => r.f.note],
    ['Par', (r) => r.f.author?.display_name],
  ]), 'text/csv;charset=utf-8');
  toast(`${rows.length} trouvaille(s) exportée(s)`);
});

// ---------------------------------------------------------------------------
// Petit tutoriel (première ouverture, puis menu « Aide »)

const TUTO = [
  ['🗺️', 'Marquer un coin', 'Touche la carte, ou « Je suis ici » sur place, ou « Coordonnées ». Fais glisser l\'épingle pour l\'ajuster, puis donne un nom.'],
  ['👪', 'Moi seul ou Famille', '<b style="color:var(--private)">Violet</b> : visible par toi seul. <b style="color:var(--family)">Orange</b> : partagé avec la famille. Tu choisis pour chaque coin.'],
  ['📷', 'Le journal', 'Touche un coin puis « Noter une trouvaille » : date, espèces, quantité, photos. Tes trouvailles rendent le conseiller plus juste.'],
  ['🧭', 'Sur le terrain', '« Retrouver » affiche une flèche et la distance jusqu\'au coin. « Itinéraire » ouvre Google Maps pour la route.'],
  ['🤖', 'Le conseiller', 'Il croise la pluie des 10 derniers jours, la saison et le milieu pour dire où ça peut pousser. Ce n\'est jamais une identification.'],
  ['⚠️', 'Sécurité', 'Fais contrôler <b>chaque récolte</b> par un pharmacien ou une association mycologique. Antipoison Marseille : <a class="tel" href="tel:+33491752525">04 91 75 25 25</a>.'],
];
let tutoI = 0;
function showTuto(i) {
  tutoI = i;
  const [e, t, txt] = TUTO[i];
  $('#tuto-body').innerHTML = `<div class="tuto-emoji">${e}</div><h2>${t}</h2><p>${txt}</p>`;
  $('#tuto-step').textContent = `${i + 1} / ${TUTO.length}`;
  $('#tuto-next').textContent = i === TUTO.length - 1 ? 'C\'est parti' : 'Suivant';
}
function openTuto() { $('#menu').hidden = true; showTuto(0); $('#dlg-tuto').showModal(); }
function endTuto() { store.set('champi-tuto', '1'); $('#dlg-tuto').close(); }
$('#tuto-next').addEventListener('click', () => (tutoI < TUTO.length - 1 ? showTuto(tutoI + 1) : endTuto()));
$('#tuto-skip').addEventListener('click', endTuto);
$('#help-btn').addEventListener('click', openTuto);

// ---------------------------------------------------------------------------
// Météo, conseiller, guide

const LEVEL_ORDER = { bon: 0, moyen: 1, faible: 2, 'hors-saison': 3 };
const shortDay = (iso) => String(Number(iso.slice(8, 10)));

function spotContext(s, w = null) {
  const prof = profiles.get(s.id)?.profile;
  return { month: month(), species: spotSpecies(s, state.finds), trees: s.trees ?? [], history: state.finds.filter((f) => f.spot_id === s.id),
    personal: w && prof ? personalAdvice(w, prof) : null };
}

// Profil appris de chaque coin (mémorisé tant que ses trouvailles ne changent pas).
const profiles = new Map(), profilesInFlight = new Map();
function spotProfileFor(s) {
  const finds = state.finds.filter((f) => f.spot_id === s.id && !f.pending);
  const key = finds.map((f) => f.id + f.found_on).sort().join('|');
  const hit = profiles.get(s.id);
  if (hit?.key === key) return Promise.resolve(hit.profile);
  const fk = s.id + key;
  if (!profilesInFlight.has(fk)) profilesInFlight.set(fk, computeProfile(s, finds, key).finally(() => profilesInFlight.delete(fk)));
  return profilesInFlight.get(fk);
}
async function computeProfile(s, finds, key) {
  let conditions = [];
  // Météo apprise sur les 12 trouvailles les plus récentes (une seule requête d'archive, de taille raisonnable).
  const recent = [...finds].sort((a, b) => (a.found_on < b.found_on ? 1 : -1)).slice(0, 12);
  const r = historyRange(recent);
  if (r) {
    try { conditions = findConditions(recent, await historyFor(s.lat, s.lon, r.start, r.end)); } catch { /* sans réseau : bilan sans météo */ }
  }
  const profile = spotProfile(finds, conditions);
  profiles.set(s.id, { key, profile });
  return profile;
}
async function renderBilan(s) {
  const box = $('#spot-bilan');
  const has = state.finds.some((f) => f.spot_id === s.id && !f.pending);
  if (!has) { box.innerHTML = ''; return; }
  box.innerHTML = '<h3>📊 Bilan du coin</h3><p class="small muted">Calcul…</p>';
  const p = await spotProfileFor(s);
  if (state.openSpotId !== s.id) return;
  const max = Math.max(...p.months);
  box.innerHTML = `<h3>📊 Bilan du coin</h3>
    <div class="months counts">${MONTHS.map((n, i) => `<span class="${p.months[i] ? (p.months[i] === max ? 'peak' : 'on') : ''}" title="${n}">${n[0].toUpperCase()}<b>${p.months[i] || ''}</b></span>`).join('')}</div>
    <p class="small">${esc(profileSummary(p))}</p>
    ${p.topSpecies.length ? `<p class="small muted">Espèces : ${esc(p.topSpecies.slice(0, 4).map((x) => `${x.label} (${x.k})`).join(', '))}</p>` : ''}`;
}

function meteoHtml(w, a) {
  const rows = [...w.days, ...(w.today ? [w.today] : []), ...w.future.slice(0, 2)];
  const max = Math.max(20, ...rows.map((r) => r.rain || 0));
  const today = todayIso();
  const lvl = a.level ? LEVELS[a.level] : null;
  return `<h3>Météo et conditions</h3>
    ${lvl ? `<div class="verdict lvl-${a.level}">${lvl.icon} ${lvl.label}</div>` : ''}
    <ul class="reasons">${a.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    ${a.perSpecies.length ? `<p class="small">${a.perSpecies.map((p) => `<b>${esc(p.label)}</b>${p.reasons.length ? ' : ' + esc(p.reasons.join(', ')) : ''}`).join('<br>')}</p>` : ''}
    <div class="rainbars" aria-label="Pluie jour par jour">${rows.map((r) => `<div class="d${r.date === today ? ' today' : ''}${r.date > today ? ' future' : ''}" title="${formatDate(r.date)} : ${r.rain} mm">
      <span class="mm">${r.rain >= 1 ? Math.round(r.rain) : ''}</span><span class="b" style="height:${Math.round(((r.rain || 0) / max) * 64)}px"></span><span>${r.date === today ? 'auj.' : shortDay(r.date)}</span></div>`).join('')}</div>
    <div class="temps">${rows.map((r) => `<span>${r.tmax != null ? Math.round(r.tmax) + '°' : ''}</span>`).join('')}</div>
    <p class="small muted">Pluie sur 10 jours : <b>${w.rain10} mm</b> · températures sur 7 jours : ${w.tmin7 ?? '?'}–${w.tmax7 ?? '?'} °C · hachuré = prévision. Données Open-Meteo, précision ~1–2 km.</p>`;
}

async function renderMeteo(s) {
  const box = $('#spot-meteo');
  box.innerHTML = '<h3>Météo et conditions</h3><p class="small muted">Chargement de la météo…</p>';
  try {
    const [daily] = await dailyFor([[s.lat, s.lon]]);
    if (state.openSpotId !== s.id) return;
    const w = summarizeWeather(daily, todayIso());
    await spotProfileFor(s).catch(() => null);
    if (state.openSpotId !== s.id) return;
    box.innerHTML = meteoHtml(w, assess(w, spotContext(s, w)));
  } catch (err) {
    if (state.openSpotId === s.id) box.innerHTML = `<h3>Météo et conditions</h3><p class="small muted">Météo indisponible (${esc(frError(err))}).</p>`;
  }
}

// Accès aux massifs (risque incendie, cartes du jour des préfectures)
let massifsData = null, levelsByDay = new Map();
function loadMassifs() {
  massifsData ??= fetch('data/massifs-acces.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return massifsData;
}
function loadLevels(date = todayIso()) {
  if (!levelsByDay.has(date)) {
    levelsByDay.set(date, sb.functions.invoke('champi-acces', { body: { date: date.replaceAll('-', '') } })
      .then(({ data, error }) => (error ? null : data)).catch(() => null));
  }
  return levelsByDay.get(date);
}
async function spotAccess(s) {
  const data = await loadMassifs();
  const massif = data ? massifAt(s.lat, s.lon, data) : null;
  const levels = massif && inFireSeason(month()) ? await loadLevels() : null;
  return { massif, ...accessFor(massif, levels, month()) };
}
async function renderAccess(s) {
  const box = $('#spot-access');
  box.hidden = true; box.className = 'access-line small';
  const a = await spotAccess(s);
  if (state.openSpotId !== s.id || !a.massif) return;
  const page = DEPT_PAGES[a.massif.dept];
  box.classList.toggle('closed', a.state === 'closed');
  box.classList.toggle('warn', a.state === 'warn');
  box.innerHTML = `${a.state ? ACCESS_ICON[a.state] : '🌲'} <b>Massif ${esc(a.massif.name)}</b> (${esc(page?.name ?? a.massif.dept)}) : ${esc(a.text)}`
    + (page ? ` · <a href="${page.url}" target="_blank" rel="noopener">carte officielle</a>` : '');
  box.hidden = false;
}

// Carte des pluies sur 10 jours (grille PACA)
let rainLayer = null, rainLegend = null;
async function showRain(on) {
  store.set('champi-rain', on ? '1' : '0');
  $('#toggle-rain').checked = on;
  if (!on) { rainLayer?.remove(); rainLegend?.remove(); return; }
  if (!rainLayer) {
    toast('Chargement de la pluie sur la région…', 10000);
    const grid = pacaGrid();
    try {
      const all = await dailyFor(grid);
      rainLayer = L.layerGroup();
      grid.forEach((p, i) => {
        const w = summarizeWeather(all[i], todayIso());
        L.circleMarker(p, { radius: 11, stroke: false, fillColor: rainColor(w.rain10), fillOpacity: 0.75, interactive: true })
          .bindTooltip(`Près de ${nearestTown(...p)} : <b>${w.rain10} mm</b> sur 10 j${w.lastRainAgo != null ? ` · dernière pluie il y a ${w.lastRainAgo} j` : ''}`)
          .addTo(rainLayer);
      });
      $('#toast').hidden = true;
    } catch (err) { toast(`Pluie indisponible : ${frError(err)}`); $('#toggle-rain').checked = false; return; }
    rainLegend = L.control({ position: 'topleft' });
    rainLegend.onAdd = () => {
      const d = L.DomUtil.create('div', 'rain-legend');
      d.innerHTML = '<b>Pluie 10 j</b><br>' + [[0, '< 2 mm'], [5, '2–10'], [15, '10–25'], [30, '25–50'], [60, '> 50 mm']].map(([v, t]) => `<i style="background:${rainColor(v)}"></i>${t}`).join('<br>');
      return d;
    };
  }
  if ($('#toggle-rain').checked) { rainLayer.addTo(map); rainLegend.addTo(map); }
}
$('#toggle-rain').addEventListener('change', (e) => showRain(e.target.checked));

// Forêts IGN (BD Forêt V2)
let forestLayer = null;
function showForests(on) {
  store.set('champi-forest', on ? '1' : '0');
  $('#toggle-forest').checked = on;
  if (!forestLayer) {
    forestLayer = L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=LANDCOVER.FORESTINVENTORY.V2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png',
      { minZoom: 6, maxNativeZoom: 16, maxZoom: 19, opacity: 0.55, attribution: 'BD Forêt® V2 © IGN' });
  }
  if (on) forestLayer.addTo(map); else forestLayer.remove();
}
$('#toggle-forest').addEventListener('change', (e) => showForests(e.target.checked));

// Conseiller
async function openAdvisor() {
  $('#menu').hidden = true;
  const body = $('#advisor-body');
  body.innerHTML = '<p class="muted">Analyse en cours…</p>';
  $('#dlg-advisor').showModal();
  const m = month();
  const now = SPECIES.filter((s) => s.months.includes(m));
  let html = `<h3>En saison en ${MONTHS[m - 1]}</h3><div class="chips readonly">${now.map((s) => `<span class="chip">${esc(s.label)}${(s.peak ?? []).includes(m) ? ' <span class="in">● pic</span>' : ''}</span>`).join('')}</div>`;
  try {
    const grid = pacaGrid();
    const spots = state.spots.slice(0, 100);
    const all = await dailyFor([...grid, ...spots.map((s) => [s.lat, s.lon])]);
    const ws = all.map((d) => summarizeWeather(d, todayIso()));
    const g = ws.slice(0, grid.length);
    const avg = Math.round((g.reduce((t, w) => t + w.rain10, 0) / g.length) * 10) / 10;
    const wet = grid.map((p, i) => ({ p, w: g[i] })).sort((a, b) => b.w.rain10 - a.w.rain10);
    const seen = new Set(); const top = [];
    for (const x of wet) { const t = nearestTown(...x.p); if (!seen.has(t)) { seen.add(t); top.push([t, x.w.rain10]); } if (top.length === 4) break; }
    html += `<h3>Pluie sur 10 jours en PACA</h3>
      <p>Moyenne régionale : <b>${avg} mm</b>. Les secteurs les plus arrosés : ${top.map(([t, mm]) => `${esc(t)} (${mm} mm)`).join(', ')}.</p>
      <button id="advisor-rain" class="btn" type="button">🌧️ Voir la carte des pluies</button>`;
    const acc = await Promise.all(spots.map((s) => spotAccess(s).catch(() => ({}))));
    const closedN = acc.filter((x) => x.state === 'closed').length;
    html += `<h3>Accès aux massifs</h3><p class="small">${inFireSeason(m)
      ? (closedN ? `⛔ ${closedN === 1 ? '1 de tes coins est' : `${closedN} de tes coins sont`} dans un massif fermé aujourd'hui (risque incendie).` : 'Aucun de tes coins n\'est dans un massif fermé aujourd\'hui.')
      : 'Hors période réglementée (juin–septembre) : pas de fermeture publiée.'}</p>`;
    const ranked = spots.map((s, i) => ({ s, a: assess(ws[grid.length + i], spotContext(s, ws[grid.length + i])), x: acc[i] }))
      .filter((x) => x.a.level)
      .sort((x, y) => ((x.x?.state === 'closed') - (y.x?.state === 'closed')) || (LEVEL_ORDER[x.a.level] - LEVEL_ORDER[y.a.level]) || (y.a.score - x.a.score));
    html += `<h3>Tes coins</h3>` + (ranked.length ? `<ul class="rank">${ranked.slice(0, 15).map(({ s, a, x }) => `<li><button type="button" data-spot="${s.id}">
        <span class="t">${x?.state === 'closed' ? '⛔' : LEVELS[a.level].icon} ${esc(s.name)}</span>${x?.state === 'closed' ? ' <span class="small">(massif fermé)</span>' : ''}<br>
        <span class="small">${a.perSpecies[0] ? esc(a.perSpecies[0].label) + ' · ' : ''}${esc(a.reasons[0] ?? '')}</span></button></li>`).join('')}</ul>`
      : '<p class="muted small">Note des espèces sur tes coins pour que le conseiller puisse les évaluer.</p>');
  } catch (err) {
    html += `<p class="error">Météo indisponible : ${esc(frError(err))}</p>`;
  }
  body.innerHTML = html;
}
$('#advisor-btn').addEventListener('click', openAdvisor);
$('#advisor-btn2').addEventListener('click', openAdvisor);
$('#dlg-advisor .js-close').addEventListener('click', () => $('#dlg-advisor').close());
$('#dlg-advisor').addEventListener('click', (e) => {
  if (e.target.closest('#advisor-rain')) { $('#dlg-advisor').close(); window.scrollTo({ top: 0 }); map.setView([43.95, 6.1], 8); showRain(true); return; }
  const b = e.target.closest('[data-spot]'); if (!b) return;
  const s = state.spots.find((x) => x.id === b.dataset.spot); if (!s) return;
  $('#dlg-advisor').close(); window.scrollTo({ top: 0 });
  map.setView([s.lat, s.lon], Math.max(map.getZoom(), 14));
  openSpot(s.id);
});

// Guide des espèces
function renderGuide() {
  const m = month();
  $('#guide-body').innerHTML = SPECIES.filter((s) => GUIDE[s.id]).map((s) => {
    const g = GUIDE[s.id];
    const cells = MONTHS.map((name, i) => {
      const n = i + 1; const cls = [(s.peak ?? []).includes(n) ? 'peak' : s.months.includes(n) ? 'on' : '', n === m ? 'now' : ''].join(' ');
      return `<span class="${cls}" title="${name}">${name[0].toUpperCase()}</span>`;
    }).join('');
    const trees = g.trees.map((t) => labelOf(TREES, t)).join(', ');
    return `<div class="guide-card">
      <h4>${esc(s.label)}</h4><div class="latin">${esc(g.latin)}</div>
      <div class="months">${cells}</div>
      <p>${esc(g.habitat)}</p>
      <p class="small muted">${trees ? `Arbres : ${esc(trees)} · ` : ''}${g.soil ? `sol ${esc(g.soil)} · ` : ''}altitude ~${g.alt[0]}–${g.alt[1]} m</p>
      <p class="small ${g.lookalikes.includes('⚠️') ? 'warn' : ''}"><b>Sosies :</b> ${esc(g.lookalikes)}</p></div>`;
  }).join('');
}
function openGuide() { $('#menu').hidden = true; renderGuide(); $('#dlg-guide').showModal(); }
$('#guide-btn').addEventListener('click', openGuide);
$('#guide-btn2').addEventListener('click', openGuide);
$('#dlg-guide .js-close').addEventListener('click', () => $('#dlg-guide').close());
$('#guide-forest').addEventListener('click', () => { $('#dlg-guide').close(); window.scrollTo({ top: 0 }); showForests(true); if (map.getZoom() < 11) map.setZoom(11); toast('Forêts IGN affichées (légende dans le guide).'); });

// ---------------------------------------------------------------------------
// Administration (Enzo)

async function refreshAdminBadge() {
  const { data, error } = await sb.from('champi_access_requests').select('email');
  if (error) throw error;
  const count = data.length;
  $('#menu-dot').hidden = !count;
  $('#admin-count').hidden = !count;
  $('#admin-count').textContent = count || '';
  return count;
}

async function loadAdmin() {
  const [reqs, members] = await Promise.all([
    sb.from('champi_access_requests').select('email, display_name, message, created_at').order('created_at'),
    sb.from('champi_allowed_emails').select('email, label, added_at').order('added_at'),
  ]);
  if (reqs.error) throw reqs.error;
  if (members.error) throw members.error;
  const me = state.user.email.toLowerCase();
  $('#req-list').innerHTML = reqs.data.length ? reqs.data.map((r) => `<li>
      <div class="head"><span>${esc(r.display_name)}</span><span class="small muted">${formatDate(r.created_at)}</span></div>
      <div class="small muted">${esc(r.email)}</div>
      ${r.message ? `<div class="note">« ${esc(r.message)} »</div>` : ''}
      <div class="req-actions">
        <button class="btn primary" type="button" data-accept="${esc(r.email)}" data-name="${esc(r.display_name)}">Accepter</button>
        <button class="btn" type="button" data-refuse="${esc(r.email)}">Refuser</button>
      </div></li>`).join('') : '<li class="muted small">Aucune demande.</li>';
  $('#member-count').textContent = `(${members.data.length})`;
  $('#member-list').innerHTML = members.data.map((m) => `<li>
      <div class="head"><span>${esc(m.label || m.email.split('@')[0])}${m.email === me ? ' 👑' : ''}</span>
        ${m.email === me ? '' : `<button class="del" type="button" data-remove="${esc(m.email)}">Retirer</button>`}</div>
      <div class="small muted">${esc(m.email)} · depuis le ${formatDate(m.added_at)}</div></li>`).join('');
  await refreshAdminBadge();
}

$('#admin-btn').addEventListener('click', async () => {
  $('#menu').hidden = true;
  showError('#admin-error');
  $('#dlg-admin').showModal();
  try { await loadAdmin(); } catch (err) { showError('#admin-error', frError(err)); }
});
$('#dlg-admin .js-close').addEventListener('click', () => $('#dlg-admin').close());

async function addMember(email, label) {
  const { error } = await sb.from('champi_allowed_emails').insert({ email, label: label || null });
  if (error && error.code !== '23505') throw error;     // 23505 : déjà dans la liste
}

$('#dlg-admin').addEventListener('click', async (e) => {
  const acc = e.target.closest('[data-accept]'), ref = e.target.closest('[data-refuse]'), rem = e.target.closest('[data-remove]');
  if (!acc && !ref && !rem) return;
  showError('#admin-error');
  try {
    if (acc) {
      await addMember(acc.dataset.accept, acc.dataset.name);
      const { error } = await sb.from('champi_access_requests').delete().eq('email', acc.dataset.accept);
      if (error) throw error;
      toast(`${acc.dataset.name} fait partie de la famille ✔`);
    } else if (ref) {
      if (!confirm('Refuser cette demande ?')) return;
      const { error } = await sb.from('champi_access_requests').delete().eq('email', ref.dataset.refuse);
      if (error) throw error;
    } else {
      if (!confirm(`Retirer ${rem.dataset.remove} ? Cette personne ne verra plus les coins de la famille (ses propres coins restent à elle).`)) return;
      const { error } = await sb.from('champi_allowed_emails').delete().eq('email', rem.dataset.remove);
      if (error) throw error;
    }
    await loadAdmin();
  } catch (err) { showError('#admin-error', frError(err)); }
});

$('#add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#add-email').value.trim().toLowerCase();
  const label = $('#add-label').value.trim();
  const btn = e.submitter; busy(btn, true); showError('#admin-error');
  try {
    await addMember(email, label);
    await sb.from('champi_access_requests').delete().eq('email', email);   // si elle avait déjà demandé
    $('#add-email').value = ''; $('#add-label').value = '';
    toast(`${label || email} ajouté(e) ✔`);
    await loadAdmin();
  } catch (err) { showError('#admin-error', frError(err)); }
  busy(btn, false);
});

// ---------------------------------------------------------------------------
// Alertes de pousse (Web Push)

const ALERTS_URL = `${SUPABASE_URL}/functions/v1/champi-alertes`;
const isIos = /iP(hone|ad|od)/.test(navigator.userAgent);
const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function b64uToBytes(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
async function currentSub() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}
async function renderAlerts() {
  const st = $('#alerts-status');
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  let sub = null;
  try { sub = await currentSub(); } catch { /* indisponible */ }
  const on = !!sub && Notification.permission === 'granted';
  $('#alerts-on').hidden = on; $('#alerts-off').hidden = !on; $('#alerts-test').hidden = !on;
  if (isIos && !isStandalone) st.textContent = '📱 Sur iPhone, les alertes ne marchent que depuis l\'appli ajoutée à l\'écran d\'accueil.';
  else if (!supported) st.textContent = 'Ce navigateur ne gère pas les notifications.';
  else if (Notification.permission === 'denied') st.textContent = '🔕 Notifications refusées pour ce site : autorise-les dans les réglages du téléphone.';
  else st.textContent = on ? '🔔 Alertes actives sur ce téléphone.' : '🔕 Alertes inactives sur ce téléphone.';
  $('#alerts-on').disabled = !supported || (isIos && !isStandalone) || Notification.permission === 'denied';
}
$('#alerts-btn').addEventListener('click', () => { $('#menu').hidden = true; $('#alerts-msg').textContent = ''; renderAlerts(); $('#dlg-alerts').showModal(); });
$('#dlg-alerts .js-close').addEventListener('click', () => $('#dlg-alerts').close());
$('#alerts-on').addEventListener('click', async () => {
  const btn = $('#alerts-on'); busy(btn, true); $('#alerts-msg').textContent = '';
  try {
    if (await Notification.requestPermission() !== 'granted') throw new Error('Notifications non autorisées.');
    const reg = await navigator.serviceWorker.ready;
    const { publicKey } = await (await fetch(ALERTS_URL)).json();
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(publicKey) });
    const j = sub.toJSON();
    const { error } = await sb.from('champi_push_subscriptions').insert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
    if (error && error.code !== '23505') throw error;
    $('#alerts-msg').textContent = '✔ Alertes activées. Touche « Envoyer une alerte de test » pour vérifier.';
  } catch (err) {
    const m = String(err?.message ?? err);
    $('#alerts-msg').textContent = /Registration failed|push service|AbortError/i.test(m)
      ? 'Impossible d\'activer : le service de notifications de ce navigateur a refusé. Sur Android, utilise Chrome ; sur iPhone, l\'appli installée sur l\'écran d\'accueil.'
      : `Impossible d'activer : ${frError(err)}`;
  }
  busy(btn, false);
  renderAlerts();
});
$('#alerts-off').addEventListener('click', async () => {
  try {
    const sub = await currentSub();
    if (sub) { await sb.from('champi_push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
    $('#alerts-msg').textContent = 'Alertes désactivées sur ce téléphone.';
  } catch (err) { $('#alerts-msg').textContent = frError(err); }
  renderAlerts();
});
$('#alerts-test').addEventListener('click', async () => {
  $('#alerts-msg').textContent = 'Envoi…';
  const { data, error } = await sb.functions.invoke('champi-alertes', { body: { action: 'test' } });
  $('#alerts-msg').textContent = error ? `Échec : ${frError(error)}` : (data?.envois ?? []).includes('ok') ? '✔ Envoyée : la notification doit apparaître dans quelques secondes.' : `Réponse : ${JSON.stringify(data)}`;
});

// Lien direct vers un coin (notification) : …/#spot=<id>
function openSpotFromHash() {
  const m = location.hash.match(/^#spot=([0-9a-f-]{36})$/i);
  if (!m || !state.spots.some((s) => s.id === m[1])) return;
  history.replaceState(null, '', location.pathname + location.search);
  const s = state.spots.find((x) => x.id === m[1]);
  map.setView([s.lat, s.lon], Math.max(map.getZoom(), 14));
  openSpot(s.id);
}
window.addEventListener('hashchange', openSpotFromHash);

// ---------------------------------------------------------------------------
// Partage d'un coin privé avec des personnes précises

function decorateShares() {
  const me = state.user?.id;
  for (const s of state.spots) {
    s.sharedWithMe = s.owner !== me && s.visibility === 'private' && !s.pending;
    s.sharedWith = s.owner === me ? state.shares.filter((h) => h.spot_id === s.id).map((h) => h.user_id) : [];
  }
}
$('#spot-share').addEventListener('click', () => {
  const s = state.spots.find((x) => x.id === state.openSpotId); if (!s) return;
  const others = state.people.filter((p) => p.id !== state.user.id);
  $('#share-list').innerHTML = others.length ? others.map((p) => `<label class="share-person"><input type="checkbox" value="${p.id}"${s.sharedWith.includes(p.id) ? ' checked' : ''}> ${esc(p.display_name)}</label>`).join('')
    : '<p class="muted small">Personne d\'autre dans la famille pour l\'instant.</p>';
  showError('#share-error');
  $('#dlg-share').showModal();
});
$$('#dlg-share .js-close').forEach((b) => b.addEventListener('click', () => $('#dlg-share').close()));
$('#share-save').addEventListener('click', async () => {
  const s = state.spots.find((x) => x.id === state.openSpotId); if (!s) return;
  const want = new Set($$('#share-list input:checked').map((i) => i.value));
  const add = [...want].filter((id) => !s.sharedWith.includes(id)).map((user_id) => ({ spot_id: s.id, user_id }));
  const del = s.sharedWith.filter((id) => !want.has(id));
  const btn = $('#share-save'); busy(btn, true);
  try {
    if (add.length) { const { error } = await sb.from('champi_spot_shares').insert(add); if (error) throw error; }
    if (del.length) { const { error } = await sb.from('champi_spot_shares').delete().eq('spot_id', s.id).in('user_id', del); if (error) throw error; }
  } catch (err) { busy(btn, false); showError('#share-error', isNetworkError(err) ? 'Pas de réseau : réessaie plus tard.' : frError(err)); return; }
  busy(btn, false);
  $('#dlg-share').close();
  toast(want.size ? `Coin partagé avec ${want.size} personne${want.size > 1 ? 's' : ''} ✔` : 'Partage retiré');
  await loadData();
});
$('#spot-unshare').addEventListener('click', async () => {
  const s = state.spots.find((x) => x.id === state.openSpotId); if (!s) return;
  if (!confirm(`Ne plus voir « ${s.name} » ? ${s.author?.display_name ?? 'Son créateur'} pourra te le repartager.`)) return;
  const { error } = await sb.from('champi_spot_shares').delete().eq('spot_id', s.id).eq('user_id', state.user.id);
  if (error) { toast(frError(error)); return; }
  $('#dlg-spot').close();
  await loadData();
});

// ---------------------------------------------------------------------------
// Hors ligne : copie locale, envois en attente, cartes enregistrées

const SNAP_KEY = 'champi-snapshot';
function writeSnapshot() {
  store.set(SNAP_KEY, JSON.stringify({ uid: state.user.id, at: new Date().toISOString(), profile: state.profile, isAdmin: state.isAdmin,
    spots: state.spots.filter((s) => !s.pending), finds: state.finds.filter((f) => !f.pending), photos: state.photos,
    shares: state.shares, people: state.people }));
}
function readSnapshot() {
  try { const s = JSON.parse(store.get(SNAP_KEY) || 'null'); return s && s.uid === state.user?.id ? s : null; } catch { return null; }
}
function openFromSnapshot(snap) {
  state.profile = snap.profile; state.isAdmin = false;
  $('#me-name').textContent = snap.profile?.display_name ?? '';
  show('app');
  loadData().catch(fatal);
}
let pendingCount = 0;
async function applyPending() {
  let items = [];
  try { items = await queue.all(); } catch { /* IndexedDB indisponible */ }
  pendingCount = items.length;
  if (!items.length) return;
  const me = { owner: state.user.id, user_id: state.user.id, author: { display_name: state.profile?.display_name } };
  const mine = items.map((it) => ({ ...it, row: { ...me, created_at: new Date(it.at).toISOString(), ...it.row } }));
  const m = mergePending({ spots: state.spots.filter((s) => !s.pending), finds: state.finds.filter((f) => !f.pending) }, mine);
  state.spots = m.spots; state.finds = m.finds;
}
function updateOfflineBar() {
  const bar = $('#offline-bar');
  const off = !navigator.onLine || state.offlineSince;
  const parts = [];
  if (off) parts.push(`📴 Hors ligne${state.offlineSince ? ` · données du ${formatDate(state.offlineSince)} ${state.offlineSince.slice(11, 16)}` : ''}`);
  if (pendingCount) parts.push(`⏳ ${pendingCount} envoi${pendingCount > 1 ? 's' : ''} en attente`);
  bar.textContent = parts.join(' · ');
  bar.hidden = !parts.length;
}
let flushing = false;
async function flushQueue() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  let sent = 0;
  try {
    for (const it of sendOrder(await queue.all())) {
      let error;
      if (it.kind === 'spot') {
        ({ error } = await sb.from('champi_spots').insert(it.row));
        if (!error && it.photo) { try { await photos.upload({ spotId: it.row.id, file: it.photo }); } catch { /* photo : réessai impossible, coin envoyé */ } }
      } else {
        ({ error } = await sb.from('champi_finds').insert(it.row));
        if (!error) for (const f of it.files ?? []) { try { await photos.upload({ spotId: it.row.spot_id, findId: it.row.id, file: f }); } catch { /* idem */ } }
      }
      if (error && isNetworkError(error)) break;                           // toujours pas de réseau : on réessaiera
      if (error && error.code !== '23505') { toast(`Envoi refusé : ${frError(error)}`, 6000); }   // 23505 : déjà envoyé
      await queue.remove(it.qid);
      if (!error) sent++;
    }
  } finally { flushing = false; }
  if (sent) { toast(`✔ ${sent} envoi${sent > 1 ? 's' : ''} en attente transmis.`); await loadData().catch(() => {}); }
  else { await applyPending(); updateOfflineBar(); }
}
window.addEventListener('online', () => { updateOfflineBar(); flushQueue(); loadData().catch(() => {}); });
window.addEventListener('offline', updateOfflineBar);
setInterval(() => { if (pendingCount) flushQueue(); }, 60000);

// Cartes hors ligne (Plan IGN d'une zone)
const ZONES_KEY = 'champi-zones';
const zones = () => { try { return JSON.parse(store.get(ZONES_KEY) || '[]'); } catch { return []; } };
const zoneUrls = (z) => tilesFor(z.bounds, z.zMin, z.zMax).map((t) => PLAN_IGN(t.z, t.x, t.y));
let dlAbort = null;
async function renderZones() {
  const list = zones();
  $('#zone-list').innerHTML = list.length ? list.map((z) => `<li><div class="head"><span>🗺️ ${esc(z.name)}</span>
      <button class="del" type="button" data-zone="${z.id}">Supprimer</button></div>
      <div class="small muted">${z.count} tuiles · ${(z.bytes / 1e6).toFixed(1).replace('.', ',')} Mo · zooms ${z.zMin}–${z.zMax} · ${formatDate(z.date)}</div></li>`).join('')
    : '<li class="muted small">Aucune zone enregistrée.</li>';
  try {
    const est = await navigator.storage?.estimate?.();
    if (est) $('#offline-storage').textContent = `Espace utilisé par l'appli : ${(est.usage / 1e6).toFixed(0)} Mo.`;
  } catch { /* non disponible */ }
}
$('#offline-btn').addEventListener('click', () => { $('#menu').hidden = true; $('#offline-msg').textContent = ''; renderZones(); $('#dlg-offline').showModal(); });
$('#dlg-offline .js-close').addEventListener('click', () => $('#dlg-offline').close());
$('#offline-dl').addEventListener('click', async () => {
  if (dlAbort) { dlAbort.abort = true; return; }
  if (map.getZoom() < 11) { $('#offline-msg').textContent = 'Zoome d\'abord sur le massif (la zone affichée est trop grande).'; return; }
  const b = map.getBounds();
  const bounds = { west: b.getWest(), east: b.getEast(), south: b.getSouth(), north: b.getNorth() };
  const zMin = Math.max(10, Math.min(map.getZoom(), 13));
  const zMax = bestMaxZoom(bounds, zMin, 16, TILE_LIMIT);
  const urls = tilesFor(bounds, zMin, zMax).map((t) => PLAN_IGN(t.z, t.x, t.y));
  if (urls.length > TILE_LIMIT) { $('#offline-msg').textContent = 'Zone trop grande : zoome un peu plus.'; return; }
  try { await navigator.storage?.persist?.(); } catch { /* facultatif */ }
  const cache = await caches.open(TILE_CACHE);
  dlAbort = { abort: false };
  $('#offline-dl').textContent = 'Arrêter';
  $('#offline-progress').hidden = false;
  let done = 0, bytes = 0, failed = 0;
  const bar = $('#offline-progress span');
  const worker = async () => {
    while (urls.length && !dlAbort.abort) {
      const u = urls.shift();
      try {
        let res = await cache.match(u);
        if (!res) { res = await fetch(u, { mode: 'cors' }); if (!res.ok) throw new Error(res.status); await cache.put(u, res.clone()); }
        bytes += Number(res.headers.get('content-length')) || (await res.clone().blob()).size;
      } catch { failed++; }
      done++;
      bar.style.width = `${Math.round((done / (done + urls.length)) * 100)}%`;
      $('#offline-msg').textContent = `${done} tuiles…`;
    }
  };
  const total = urls.length;
  await Promise.all([worker(), worker(), worker(), worker()]);   // 4 téléchargements à la fois, pas plus
  const aborted = dlAbort.abort;
  dlAbort = null;
  $('#offline-dl').textContent = 'Enregistrer la zone affichée';
  $('#offline-progress').hidden = true;
  if (aborted) { $('#offline-msg').textContent = `Arrêté après ${done} tuiles.`; return; }
  const c = map.getCenter();
  const massif = massifAt(c.lat, c.lng, (await loadMassifs()) ?? {});
  const list = zones();
  list.push({ id: crypto.randomUUID(), name: massif ? `Massif ${massif.name}` : `Près de ${nearestTown(c.lat, c.lng)}`, bounds, zMin, zMax, count: total, bytes, date: todayIso() });
  store.set(ZONES_KEY, JSON.stringify(list));
  $('#offline-msg').textContent = failed ? `Enregistré, mais ${failed === 1 ? '1 tuile a échoué' : `${failed} tuiles ont échoué`} : touche à nouveau le bouton pour compléter.` : `✔ Zone enregistrée : ${total} tuiles, ${(bytes / 1e6).toFixed(1).replace('.', ',')} Mo.`;
  renderZones();
});
$('#zone-list').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-zone]'); if (!b) return;
  const list = zones(); const z = list.find((x) => x.id === b.dataset.zone); if (!z) return;
  const rest = list.filter((x) => x.id !== z.id);
  const keep = new Set(rest.flatMap(zoneUrls));                 // tuiles partagées avec une autre zone : on les garde
  const cache = await caches.open(TILE_CACHE);
  await Promise.all(zoneUrls(z).filter((u) => !keep.has(u)).map((u) => cache.delete(u)));
  store.set(ZONES_KEY, JSON.stringify(rest));
  renderZones();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !$('#screen-app').hidden) {
    flushQueue();
    loadData().catch(fatal);
    if (state.isAdmin) refreshAdminBadge().catch(() => {});
  }
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
