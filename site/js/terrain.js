// Pente et exposition d'un point, calculées à partir de 5 altitudes IGN (le point et 4 voisins à ~40 m).
// Exposition = direction vers laquelle le terrain descend (versant « nord » = qui regarde le nord).
export const STEP = 40;   // mètres
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

/** { n, s, e, o } altitudes (m) des voisins à STEP mètres → { slope (°), aspect ('N'…'NO' ou 'plat') }. */
export function slopeAspect({ n, s, e, o }, step = STEP) {
  const dzdx = (e - o) / (2 * step), dzdy = (n - s) / (2 * step);   // montée vers l'est, vers le nord
  const slope = Math.round((Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI);
  if (slope < 4) return { slope, aspect: 'plat' };
  const az = ((Math.atan2(-dzdx, -dzdy) * 180) / Math.PI + 360) % 360;   // sens de la descente, depuis le nord, horaire
  return { slope, aspect: DIRS[Math.round(az / 45) % 8] };
}

/** Décalages en degrés pour STEP mètres autour d'une latitude. */
export function offsets(lat, step = STEP) {
  return { dlat: step / 111320, dlon: step / (111320 * Math.cos((lat * Math.PI) / 180)) };
}

export const ASPECT_TEXT = { N: 'nord', NE: 'nord-est', E: 'est', SE: 'sud-est', S: 'sud', SO: 'sud-ouest', O: 'ouest', NO: 'nord-ouest', plat: 'terrain plat' };
