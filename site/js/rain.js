// Pluie mesurée (stations Météo-France) mêlée à la météo Open-Meteo.
// Pour chaque jour passé, la pluie d'un point = moyenne des stations à moins de RADIUS km, pondérée par
// l'inverse du carré de la distance. Sans station assez proche ce jour-là, on garde la valeur Open-Meteo.
// Les températures et les prévisions restent celles d'Open-Meteo ; si Open-Meteo ne répond pas, on construit
// une météo « pluie seule » à partir des stations (sans températures).

export const RADIUS = 25;   // km

export function distKm(a, b, c, d) {
  const R = 6371, r = Math.PI / 180;
  const x = (d - b) * r * Math.cos(((a + c) / 2) * r), y = (c - a) * r;
  return Math.sqrt(x * x + y * y) * R;
}

/**
 * Index des mesures : { stations: [{ id, lat, lon }], byDay: Map 'AAAA-MM-JJ' → Map id → rr }.
 * @param stations lignes champi_rain_stations ; @param rows lignes champi_rain_daily
 */
export function rainIndex(stations, rows) {
  const byDay = new Map();
  for (const r of rows) {
    if (!byDay.has(r.day)) byDay.set(r.day, new Map());
    byDay.get(r.day).set(r.station_id, Number(r.rr));
  }
  return { stations: stations.map((s) => ({ id: s.id, lat: s.lat, lon: s.lon, name: s.name })), byDay };
}

/** Stations proches d'un point, triées par distance. */
export function nearStations(index, lat, lon, radius = RADIUS) {
  return index.stations.map((s) => ({ ...s, km: distKm(lat, lon, s.lat, s.lon) }))
    .filter((s) => s.km <= radius).sort((a, b) => a.km - b.km);
}

/** Pluie mesurée estimée au point pour un jour, ou null. */
export function rainAt(index, near, day) {
  const m = index.byDay.get(day); if (!m) return null;
  let sw = 0, sv = 0;
  for (const s of near) {
    const v = m.get(s.id); if (v == null) continue;
    const w = 1 / Math.max(s.km, 1) ** 2; sw += w; sv += w * v;
  }
  return sw ? Math.round((sv / sw) * 10) / 10 : null;
}

/**
 * Remplace la pluie des jours passés par la pluie mesurée quand c'est possible.
 * @returns { daily, measured: nombre de jours remplacés, near: stations utilisées }
 */
export function mergeRain(daily, lat, lon, index, today) {
  if (!index?.stations.length) return { daily, measured: 0, near: [] };
  const near = nearStations(index, lat, lon);
  if (!near.length) return { daily, measured: 0, near };
  if (!daily) {
    // Open-Meteo indisponible : 14 jours passés reconstruits avec la pluie mesurée seule.
    const time = [];
    for (let i = 14; i >= 1; i--) time.push(new Date(Date.parse(today) - i * 86400000).toISOString().slice(0, 10));
    const rain = time.map((d) => rainAt(index, near, d));
    if (rain.filter((v) => v != null).length < 7) return { daily: null, measured: 0, near };
    return { daily: { time, precipitation_sum: rain.map((v) => v ?? 0), temperature_2m_max: time.map(() => null), temperature_2m_min: time.map(() => null) },
      measured: rain.filter((v) => v != null).length, near, rainOnly: true };
  }
  let measured = 0;
  const precipitation_sum = daily.time.map((d, i) => {
    if (d >= today) return daily.precipitation_sum?.[i] ?? 0;
    const v = rainAt(index, near, d);
    if (v == null) return daily.precipitation_sum?.[i] ?? 0;
    measured++; return v;
  });
  return { daily: { ...daily, precipitation_sum }, measured, near };
}

/** Texte de la source, pour l'affichage. */
export function rainSource(r) {
  if (!r?.measured) return 'Pluie : Open-Meteo (modèle)';
  const s = r.near[0];
  return `Pluie mesurée : Météo-France (${s.name ? `${s.name}, ` : ''}${Math.round(s.km)} km${r.near.length > 1 ? ` + ${r.near.length - 1} station${r.near.length > 2 ? 's' : ''}` : ''})${r.rainOnly ? ' · températures indisponibles' : ''}`;
}
