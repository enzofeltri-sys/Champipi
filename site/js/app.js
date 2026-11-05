import { SUPABASE_URL, SUPABASE_KEY, START } from './config.js';
import {
  SPECIES, speciesLabel, inSeason, seasonText, parseCoords, formatCoords, directionsUrl,
  sortSpots, filterSpots, spotSpecies, lastFinds, formatDate, todayIso, escapeHtml as esc,
  round6, MASSIFS, FORBIDDEN, TREES, SOILS, EXPOSURES, QUANTITIES, CONDITIONS, labelOf, exifGps,
} from './logic.js';
import { createPhotoStore, thumbPath } from './photos.js';

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
  spots: [], finds: [], photos: [],
  isAdmin: false, request: null,
  scope: store.get('champi-scope') || 'all',
  species: '',
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
  const [allowed, admin, request] = await Promise.all([
    sb.from('champi_allowed_emails').select('email, label').eq('email', email),
    sb.from('champi_admins').select('email').eq('email', email),
    sb.from('champi_access_requests').select('display_name, message').eq('email', email).maybeSingle(),
  ]);
  for (const r of [allowed, admin, request]) if (r.error) throw r.error;
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
    d.innerHTML = '<div><i style="background:var(--private)"></i>Moi seul</div><div><i style="background:var(--family)"></i>Famille</div><div><i style="background:var(--season)"></i>En saison</div>';
    return d;
  };
  legend.addTo(map);
  if (store.get('champi-massifs') === '1') massifsLayer.addTo(map);
  $('#toggle-massifs').checked = map.hasLayer(massifsLayer);

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
  const color = kind === 'family' ? 'var(--family)' : kind === 'draft' ? 'var(--primary)' : 'var(--private)';
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
  const [spots, finds, pics] = await Promise.all([
    sb.from('champi_spots').select('id, owner, visibility, name, lat, lon, species, note, trees, soil, exposure, access, altitude, created_at, updated_at, author:champi_profiles(display_name)'),
    sb.from('champi_finds').select('id, spot_id, user_id, found_on, species, note, quantity, condition, weather, created_at, author:champi_profiles(display_name)')
      .order('found_on', { ascending: false }).order('created_at', { ascending: false }),
    sb.from('champi_photos').select('id, spot_id, find_id, user_id, path, created_at, author:champi_profiles(display_name)')
      .order('created_at', { ascending: true }),
  ]);
  if (spots.error) throw spots.error;
  if (finds.error) throw finds.error;
  if (pics.error) throw pics.error;
  state.spots = spots.data;
  state.finds = finds.data;
  state.photos = pics.data;
  render();
  if (state.openSpotId && $('#dlg-spot').open) renderSpot(state.openSpotId);
}

const month = () => new Date().getMonth() + 1;

function render() {
  const me = state.user?.id;
  const visible = filterSpots(state.spots, state.finds, { scope: state.scope, species: state.species, me });
  const sorted = sortSpots(visible, state.finds);
  const last = lastFinds(state.finds);

  markersLayer.clearLayers();
  for (const s of sorted) {
    if (state.draft?.id === s.id) continue;
    const seasonal = inSeason(spotSpecies(s, state.finds), month()).length > 0;
    L.marker([s.lat, s.lon], { icon: pinIcon(s.visibility, seasonal), title: s.name, keyboard: true })
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
    return `<li><button class="spot-item ${s.visibility}" data-id="${s.id}" type="button">
      <span class="grow">
        <span class="title">${esc(s.name)}</span>
        <span class="badges">${badgesHtml(s, season)}</span>
        <span class="meta">${sp.length ? esc(sp.map(speciesLabel).join(', ')) : 'Aucune espèce notée'}</span>
        <span class="meta">${lf ? `Dernière trouvaille : ${formatDate(lf)}` : 'Pas encore de trouvaille'}${author}</span>
      </span></button></li>`;
  }).join('');
  $('#hint').hidden = !!state.draft || state.spots.length > 0;
}

function badgesHtml(s, season) {
  const vis = s.visibility === 'family' ? '<span class="badge family">👪 Famille</span>' : '<span class="badge private">🔒 Moi seul</span>';
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
  };
  if (!row.name) { showError('#edit-error', 'Donne un nom au coin.'); return; }
  const btn = $('#edit-save'); busy(btn, true);
  const q = d.id
    ? sb.from('champi_spots').update(row).eq('id', d.id).select('id').single()
    : sb.from('champi_spots').insert(row).select('id').single();
  const { data, error } = await q;
  busy(btn, false);
  if (error) { showError('#edit-error', `Enregistrement impossible : ${frError(error)}`); return; }
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
    ['Accès', s.access ?? ''],
  ].filter(([, v]) => v);
  $('#spot-details').innerHTML = det.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  $('#spot-details').hidden = !det.length;
  $('#spot-coords').textContent = `📌 ${formatCoords(s.lat, s.lon)}`;
  $('#spot-photos').innerHTML = thumbs(state.photos.filter((p) => p.spot_id === id && !p.find_id));
  $('#spot-photo-add').hidden = !mine;
  $('#spot-route').href = directionsUrl(s.lat, s.lon);
  $('#spot-edit').hidden = !mine;

  const finds = state.finds.filter((f) => f.spot_id === id);
  $('#find-list').innerHTML = finds.length ? finds.map((f) => `<li>
      <div class="head"><span>${formatDate(f.found_on)}</span>
        ${f.user_id === me ? `<button class="del" type="button" data-find="${f.id}">Supprimer</button>` : ''}</div>
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
$('#find-photos').addEventListener('change', (e) => { setFindFiles([...findFiles, ...e.target.files].slice(0, 6)); e.target.value = ''; });
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
  const btn = e.submitter; busy(btn, true);
  const { data, error } = await sb.from('champi_finds').insert(row).select('id').single();
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

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !$('#screen-app').hidden) {
    loadData().catch(fatal);
    if (state.isAdmin) refreshAdminBadge().catch(() => {});
  }
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
