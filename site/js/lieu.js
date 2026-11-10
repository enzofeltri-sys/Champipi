// Le coin vu de près, sans clé (Géoplateforme de l'IGN) :
//  - relevés laser LiDAR HD : hauteur des arbres, couvert, pente, creux ou bosse (fenêtre de 120 m autour du point) ;
//  - forêt ancienne (déjà boisée vers 1850) ou récente ;
//  - zones protégées et forêts publiques, avec les règles de cueillette à vérifier.
// Ces informations aident à choisir et comprendre un coin ; elles ne changent pas l'avis météo.

const WMS = 'https://data.geopf.fr/wms-r/wms?SERVICE=WMS&VERSION=1.3.0';
const WFS = 'https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326';
export const LIDAR_LAYERS = {
  mnh: 'IGNF_LIDAR-HD_MNH_ELEVATION.ELEVATIONGRIDCOVERAGE.WGS84G',   // hauteur de la végétation (m)
  mnt: 'IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.WGS84G',   // altitude du sol (m)
};
export const RADIUS_M = 60, PX = 25;   // 120 m de côté, ~5 m par pixel

export function windowBox(lat, lon, radius = RADIUS_M) {
  const dLat = radius / 111320, dLon = radius / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon];
}
export function lidarUrl(layer, lat, lon) {
  const b = windowBox(lat, lon).map((x) => x.toFixed(6)).join(',');
  return `${WMS}&REQUEST=GetMap&LAYERS=${layer}&STYLES=&FORMAT=image/x-bil;bits=32&CRS=EPSG:4326&BBOX=${b}&WIDTH=${PX}&HEIGHT=${PX}`;
}
/** Fichier BIL 32 bits (flottants, petit-boutiste) → tableau ; valeurs absurdes (hors couverture) → null. */
export function parseBil(buf) {
  const v = new DataView(buf), out = [];
  for (let i = 0; i + 4 <= buf.byteLength; i += 4) { const x = v.getFloat32(i, true); out.push(Number.isFinite(x) && x > -500 && x < 9000 ? x : null); }
  return out;
}

/**
 * @param mnh hauteurs de végétation (PX × PX), @param mnt altitudes du sol (PX × PX), lignes du nord au sud
 * @returns { canopy: hauteur moyenne des arbres (> 2 m), cover: % du sol couvert d'arbres, tall: % d'arbres > 15 m,
 *            slope: pente au point (°), tpi: altitude du point − altitude moyenne autour (m) } ; null si pas de relevé
 */
export function terrainStats(mnh, mnt, px = PX, cellM = (2 * RADIUS_M) / PX) {
  const h = (mnh ?? []).filter((x) => x != null);
  const out = { canopy: null, cover: null, tall: null, slope: null, tpi: null };
  if (h.length >= px * px * 0.5) {
    const trees = h.filter((x) => x > 2);
    out.cover = Math.round((trees.length / h.length) * 100);
    out.tall = Math.round((h.filter((x) => x > 15).length / h.length) * 100);
    out.canopy = trees.length ? Math.round((trees.reduce((s, x) => s + x, 0) / trees.length) * 10) / 10 : 0;
  }
  const z = mnt ?? [];
  if (z.filter((x) => x != null).length >= px * px * 0.5) {
    const at = (r, c) => z[r * px + c];
    const c = Math.floor(px / 2);
    const mean = (cells) => { const v = cells.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
    const centre = mean([-1, 0, 1].flatMap((dr) => [-1, 0, 1].map((dc) => at(c + dr, c + dc))));
    const all = mean(z);
    if (centre != null && all != null) out.tpi = Math.round((centre - all) * 10) / 10;
    // Pente : différences sur 2 pixels (~10 m) autour du centre.
    const dzx = (at(c, c + 2) - at(c, c - 2)) / (4 * cellM), dzy = (at(c - 2, c) - at(c + 2, c)) / (4 * cellM);
    if (Number.isFinite(dzx) && Number.isFinite(dzy)) out.slope = Math.round((Math.atan(Math.hypot(dzx, dzy)) * 180) / Math.PI);
  }
  return out.canopy == null && out.tpi == null ? null : out;
}

/** Phrases simples pour la fiche. */
export function terrainText(t) {
  if (!t) return [];
  const out = [];
  if (t.cover != null) {
    out.push(t.cover < 10 ? `🌾 Peu d'arbres autour (${t.cover} % de couvert)`
      : `🌳 Arbres de <b>${t.canopy} m</b> en moyenne, couvert <b>${t.cover} %</b>${t.tall >= 30 ? ' · futaie haute' : t.canopy < 6 ? ' · taillis bas ou jeune bois' : ''}`);
  }
  if (t.tpi != null) {
    out.push(t.tpi <= -1.5 ? `💧 Le point est dans un <b>creux</b> (${t.tpi} m sous les alentours) : il garde mieux l'humidité`
      : t.tpi >= 1.5 ? `☀️ Le point est sur une <b>bosse ou une crête</b> (+${t.tpi} m) : il sèche plus vite`
        : '➖ Ni creux ni bosse marqués');
  }
  if (t.slope != null) out.push(`📐 Pente au point : ${t.slope}°`);
  return out;
}

export async function lidarAt(lat, lon, fetchFn = fetch) {
  const get = async (layer) => { const r = await fetchFn(lidarUrl(layer, lat, lon)); if (!r.ok) throw new Error(`LiDAR ${r.status}`); return parseBil(await r.arrayBuffer()); };
  const [mnh, mnt] = await Promise.all([get(LIDAR_LAYERS.mnh).catch(() => null), get(LIDAR_LAYERS.mnt).catch(() => null)]);
  return terrainStats(mnh, mnt);
}

export async function oldForestAt(lat, lon, fetchFn = fetch) {
  const d = 0.0005;
  const url = `${WMS}&REQUEST=GetFeatureInfo&LAYERS=IGNF_FORETS-ANCIENNES&QUERY_LAYERS=IGNF_FORETS-ANCIENNES&STYLES=&FORMAT=image/png&CRS=EPSG:4326`
    + `&BBOX=${lat - d},${lon - d},${lat + d},${lon + d}&WIDTH=101&HEIGHT=101&I=50&J=50&INFO_FORMAT=application/json&FEATURE_COUNT=1`;
  const r = await fetchFn(url); if (!r.ok) throw new Error(`forêts anciennes ${r.status}`);
  return (await r.json()).features?.[0]?.properties?.nature ?? null;   // « foret ancienne », « foret recente » ou null
}
export function oldForestText(nature) {
  if (!nature) return null;
  return /ancien/i.test(nature) ? '🏛️ <b>Forêt ancienne</b> : déjà boisée vers 1850 (sols forestiers anciens, souvent riches en champignons)'
    : /recen/i.test(nature) ? '🌱 Forêt récente : pas boisée vers 1850 (ancien champ ou pâture)' : null;
}

// Zones protégées et forêts publiques (Géoplateforme, données INPN et ONF). Les règles de cueillette ne sont dans
// aucune base : textes généraux ci-dessous, à vérifier pour chaque site.
export const ZONE_LAYERS = [
  { id: 'pn', layer: 'patrinat_pn:parc_national' },
  { id: 'rnn', layer: 'patrinat_rnn:rnn' },
  { id: 'rnr', layer: 'patrinat_rnr:rnr' },
  { id: 'rb', layer: 'patrinat_rb:rb' },
  { id: 'apb', layer: 'patrinat_apb:apb' },
  { id: 'pnr', layer: 'patrinat_pnr:pnr' },
  { id: 'onf', layer: 'ONF.FORETS_PUBLIQUES:ONF_FORETS_PUBLIQUES' },
];
export async function zonesAt(lat, lon, fetchFn = fetch) {
  const d = 0.0001, box = `${lat - d},${lon - d},${lat + d},${lon + d},urn:ogc:def:crs:EPSG::4326`;
  const res = await Promise.all(ZONE_LAYERS.map(async (z) => {
    const r = await fetchFn(`${WFS}&TYPENAMES=${z.layer}&COUNT=5&BBOX=${box}`);
    if (!r.ok) throw new Error(`zones ${r.status}`);
    return (await r.json()).features.map((f) => ({ kind: z.id, ...f.properties }));
  }));
  return res.flat();
}

/** Zones → [{ level: 'stop' | 'warn' | 'info', text, url? }] (le plus contraignant d'abord). */
export function zonesText(zones) {
  const out = [];
  const one = (kind) => zones.filter((z) => z.kind === kind);
  const pn = one('pn');
  const coeur = pn.find((z) => /c(œ|oe)ur/i.test(z.zone ?? '') || !/adh/i.test(z.nom_site ?? ''));
  if (coeur) out.push({ level: 'stop', text: `Cœur du parc national ${coeur.nom_site} : cueillette encadrée par la réglementation du parc, à vérifier avant de ramasser`, url: coeur.url_fiche });
  else if (pn.length) out.push({ level: 'info', text: `Aire d'adhésion du parc national ${pn[0].nom_site.replace(/\s*\[.*\]/, '')} : règles ordinaires, sauf arrêté local`, url: pn[0].url_fiche });
  for (const z of [...one('rnn'), ...one('rnr')]) {
    const name = (z.nom_site ?? '').replace(/\s+/g, ' ').trim();
    // Réserve géologique (fossiles, roches) ou simple périmètre de protection : les champignons ne sont pas visés.
    if (/g[ée]olog|p[ée]rim[èe]tre/i.test(name) || z.p4_geologi === 'T') out.push({ level: 'info', text: `${/p[ée]rim[èe]tre/i.test(name) ? 'Périmètre de protection d\'une réserve' : 'Réserve naturelle géologique'} (${name}) : protège les fossiles et les roches ; la cueillette des champignons n'y est pas visée`, url: z.url_fiche });
    else out.push({ level: 'stop', text: `Réserve naturelle ${name} : la cueillette y est souvent interdite, voir son règlement`, url: z.url_fiche });
  }
  for (const z of one('rb')) out.push({ level: 'stop', text: `Réserve biologique ${z.nom_site} : cueillette en général interdite ou très limitée`, url: z.url_fiche });
  for (const z of one('apb')) out.push({ level: 'warn', text: `Arrêté de protection de biotope ${z.nom_site} : règles propres au site, à vérifier`, url: z.url_fiche });
  for (const z of one('pnr')) out.push({ level: 'info', text: `Parc naturel régional ${z.nom_site} : pas d'interdiction générale, des règles locales sont possibles`, url: z.url_fiche });
  const onf = one('onf')[0];
  if (onf) out.push({ level: 'info', text: `${onf.llib_frt ?? 'Forêt publique'} (ONF) : cueillette familiale tolérée (jusqu'à 5 litres présumés autorisés, au-delà de 10 litres c'est une infraction), sauf arrêté contraire` });
  else out.push({ level: 'info', text: 'Pas de forêt publique ici : c\'est souvent une forêt privée, où les champignons appartiennent au propriétaire' });
  const rank = { stop: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
