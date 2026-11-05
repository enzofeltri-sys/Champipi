// Pluie mesurée (stations Météo-France) mêlée à la météo Open-Meteo.
// Pour chaque jour passé, la pluie d'un point = moyenne des stations à moins de RADIUS km, pondérée par
// l'inverse du carré de la distance. Sans station assez proche ce jour-là, on garde la valeur Open-Meteo.
// Températures des jours passés : stations à moins de RADIUS km, corrigées de l'altitude (−0,65 °C par 100 m)
// quand l'altitude du point est connue. Aujourd'hui : au moins la pluie déjà mesurée depuis minuit.
// Les prévisions restent celles d'Open-Meteo ; si Open-Meteo ne répond pas, on construit une météo
// « mesures seules » à partir des stations (sans températures).

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
    const n = (v) => (v == null ? null : Number(v));
    byDay.get(r.day).set(r.station_id, { rr: n(r.rr), tn: n(r.tn), tx: n(r.tx), hours: r.hours ?? 24 });
  }
  return { stations: stations.map((s) => ({ id: s.id, lat: s.lat, lon: s.lon, name: s.name, alt: s.alt ?? null })), byDay };
}

/** Stations proches d'un point, triées par distance. */
export function nearStations(index, lat, lon, radius = RADIUS) {
  return index.stations.map((s) => ({ ...s, km: distKm(lat, lon, s.lat, s.lon) }))
    .filter((s) => s.km <= radius).sort((a, b) => a.km - b.km);
}

/** Pluie mesurée estimée au point pour un jour, ou null. partial = accepter une journée incomplète (aujourd'hui). */
export function rainAt(index, near, day, partial = false) {
  const m = index.byDay.get(day); if (!m) return null;
  let sw = 0, sv = 0;
  for (const s of near) {
    const r = m.get(s.id); if (r?.rr == null || (!partial && r.hours < 20)) continue;
    const w = 1 / Math.max(s.km, 1) ** 2; sw += w; sv += w * r.rr;
  }
  return sw ? Math.round((sv / sw) * 10) / 10 : null;
}

/** Température mesurée (key = 'tn' ou 'tx') ramenée à l'altitude du point, ou null. */
export function tempAt(index, near, day, key, alt) {
  const m = index.byDay.get(day); if (!m || alt == null) return null;
  let sw = 0, sv = 0;
  for (const s of near) {
    const r = m.get(s.id); if (r?.[key] == null || r.hours < 20 || s.alt == null) continue;
    const w = 1 / Math.max(s.km, 1) ** 2; sw += w; sv += w * (r[key] + 0.0065 * (s.alt - alt));
  }
  return sw ? Math.round((sv / sw) * 10) / 10 : null;
}

/**
 * Remplace la pluie et les températures des jours passés par les mesures quand c'est possible ; pour aujourd'hui,
 * la pluie vaut au moins ce qui est déjà tombé.
 * @returns { daily, measured: jours de pluie mesurée, temps: jours de températures mesurées, near, rainOnly? }
 */
export function mergeRain(daily, lat, lon, index, today) {
  if (!index?.stations.length) return { daily, measured: 0, temps: 0, near: [] };
  const near = nearStations(index, lat, lon);
  if (!near.length) return { daily, measured: 0, temps: 0, near };
  if (!daily) {
    // Open-Meteo indisponible : 14 jours passés reconstruits avec les mesures seules.
    const time = [];
    for (let i = 14; i >= 1; i--) time.push(new Date(Date.parse(today) - i * 86400000).toISOString().slice(0, 10));
    const rain = time.map((d) => rainAt(index, near, d));
    if (rain.filter((v) => v != null).length < 7) return { daily: null, measured: 0, temps: 0, near };
    const now = rainAt(index, near, today, true);
    return { daily: { time: [...time, today], precipitation_sum: [...rain.map((v) => v ?? 0), now ?? 0],
      temperature_2m_max: [...time, today].map(() => null), temperature_2m_min: [...time, today].map(() => null) },
    measured: rain.filter((v) => v != null).length, temps: 0, near, rainOnly: true };
  }
  let measured = 0, temps = 0;
  const alt = daily.elevation ?? null;
  const tmax = [...(daily.temperature_2m_max ?? [])], tmin = [...(daily.temperature_2m_min ?? [])];
  const precipitation_sum = daily.time.map((d, i) => {
    const om = daily.precipitation_sum?.[i] ?? 0;
    if (d > today) return om;
    if (d === today) { const so = rainAt(index, near, d, true); return so != null ? Math.max(om, so) : om; }
    const x = tempAt(index, near, d, 'tx', alt), n = tempAt(index, near, d, 'tn', alt);
    if (x != null) tmax[i] = x;
    if (n != null) tmin[i] = n;
    if (x != null || n != null) temps++;
    const v = rainAt(index, near, d);
    if (v == null) return om;
    measured++; return v;
  });
  return { daily: { ...daily, precipitation_sum, temperature_2m_max: tmax, temperature_2m_min: tmin }, measured, temps, near };
}

/** Texte de la source, pour l'affichage. */
export function rainSource(r) {
  if (!r?.measured) return 'Pluie : Open-Meteo (modèle)';
  const s = r.near[0];
  return `${r.temps ? 'Pluie et températures mesurées' : 'Pluie mesurée'} : Météo-France (${s.name ? `${s.name}, ` : ''}${Math.round(s.km)} km${r.near.length > 1 ? ` + ${r.near.length - 1} station${r.near.length > 2 ? 's' : ''}` : ''})${r.rainOnly ? ' · températures indisponibles' : ''}`;
}
