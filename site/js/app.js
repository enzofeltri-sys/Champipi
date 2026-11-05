import { SUPABASE_URL, SUPABASE_KEY, START } from './config.js';
import {
  SPECIES, speciesLabel, inSeason, seasonText, parseCoords, formatCoords, directionsUrl,
  sortSpots, filterSpots, spotSpecies, lastFinds, formatDate, todayIso, escapeHtml as esc,
  round6, MASSIFS, FORBIDDEN,
} from './logic.js';

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

const state = {
  user: null, profile: null,
  spots: [], finds: [],
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

  const { data: allowed, error } = await sb.from('champi_allowed_emails').select('email');
  if (error) throw error;
  if (!allowed.length) {
    $('#denied-email').textContent = state.user.email;
    show('denied');
    return;
  }
  const { data: profile, error: e2 } = await sb.from('champi_profiles')
    .select('id, display_name').eq('id', state.user.id).maybeSingle();
  if (e2) throw e2;
  if (!profile) { show('name'); $('#name-input').focus(); return; }
  state.profile = profile;
  $('#me-name').textContent = profile.display_name;
  show('app');
  await loadData();
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
  if (err?.status === 429 || /rate limit|too many/i.test(msg)) return 'trop de demandes, réessaie dans quelques minutes.';
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
    email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true },
  });
  busy(btn, false);
  if (error) { showError('#login-error', `Envoi impossible : ${frError(error)}`); return; }
  store.set('champi-email', email);
  $('#login-sent-to').textContent = email;
  $('#login-form').hidden = true;
  $('#login-sent').hidden = false;
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
  await sb.auth.refreshSession();
  const { data } = await sb.auth.getSession();
  route(data.session);
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
  const [spots, finds] = await Promise.all([
    sb.from('champi_spots').select('id, owner, visibility, name, lat, lon, species, note, created_at, updated_at, author:champi_profiles(display_name)'),
    sb.from('champi_finds').select('id, spot_id, user_id, found_on, species, note, created_at, author:champi_profiles(display_name)')
      .order('found_on', { ascending: false }).order('created_at', { ascending: false }),
  ]);
  if (spots.error) throw spots.error;
  if (finds.error) throw finds.error;
  state.spots = spots.data;
  state.finds = finds.data;
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
for (const sel of ['#edit-species', '#find-species']) {
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
    $('#edit-delete').hidden = !s;
    editFormFilled = true;
  }
  syncVis();
  $('#edit-coords').textContent = formatCoords(d.lat, d.lon);
  showError('#edit-error');
  $('#dlg-edit').showModal();
  if (!d.existing) setTimeout(() => $('#edit-name').focus(), 50);
}

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
  closeEdit(true);
  toast(d.id ? 'Coin modifié ✔' : 'Coin enregistré ✔');
  await loadData();
  openSpot(data.id);
});

$('#edit-delete').addEventListener('click', async () => {
  const d = state.draft; if (!d?.id) return;
  if (!confirm(`Supprimer « ${d.existing.name} » et tout son journal ?`)) return;
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
  $('#spot-coords').textContent = `📌 ${formatCoords(s.lat, s.lon)}`;
  $('#spot-route').href = directionsUrl(s.lat, s.lon);
  $('#spot-edit').hidden = !mine;

  const finds = state.finds.filter((f) => f.spot_id === id);
  $('#find-list').innerHTML = finds.length ? finds.map((f) => `<li>
      <div class="head"><span>${formatDate(f.found_on)}</span>
        ${f.user_id === me ? `<button class="del" type="button" data-find="${f.id}">Supprimer</button>` : ''}</div>
      <div class="small muted">par ${esc(f.user_id === me ? 'moi' : f.author?.display_name ?? '?')}${f.species?.length ? ' · ' + esc(f.species.map(speciesLabel).join(', ')) : ''}</div>
      ${f.note ? `<div class="note">${esc(f.note)}</div>` : ''}
    </li>`).join('') : '<li class="muted small">Pas encore de trouvaille notée.</li>';

  $('#find-add').open = false;
  $('#find-date').value = todayIso();
  $('#find-date').max = todayIso();
  $('#find-note').value = '';
  $('#find-species').innerHTML = chipsHtml([], true);
  showError('#find-error');
}

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
  };
  const btn = e.submitter; busy(btn, true);
  const { error } = await sb.from('champi_finds').insert(row);
  busy(btn, false);
  if (error) { showError('#find-error', `Ajout impossible : ${frError(error)}`); return; }
  toast('Trouvaille notée ✔');
  await loadData();
});

$('#find-list').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-find]'); if (!b) return;
  if (!confirm('Supprimer cette trouvaille ?')) return;
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

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !$('#screen-app').hidden) loadData().catch(fatal);
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
