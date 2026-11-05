// Photos : réduction sur le téléphone, envoi dans Supabase Storage, liens signés.
// La réduction passe par un canvas, ce qui supprime toutes les métadonnées EXIF (dont la position GPS).
import { fitSize } from './logic.js';

export const BUCKET = 'champi-photos';
const FULL = 1600, THUMB = 400;

export const thumbPath = (path) => path.replace(/\.jpg$/, '_t.jpg');

async function decode(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();          // l'orientation EXIF est appliquée par le navigateur
    return img;
  } catch {
    throw new Error('Format de photo non lu par ce navigateur (essaie en JPEG).');
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

function toJpeg(img, max, quality) {
  const { w, h } = fitSize(img.naturalWidth, img.naturalHeight, max);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('Conversion impossible'))), 'image/jpeg', quality));
}

/** { full, thumb } : deux JPEG réduits, sans métadonnées. */
export async function prepare(file) {
  const img = await decode(file);
  let full = await toJpeg(img, FULL, 0.82);
  if (full.size > 1.8e6) full = await toJpeg(img, FULL, 0.65);
  const thumb = await toJpeg(img, THUMB, 0.75);
  return { full, thumb };
}

export function createPhotoStore(sb) {
  const cache = new Map();   // chemin → { url, exp }

  async function upload({ spotId, findId = null, file }) {
    const { full, thumb } = await prepare(file);
    const path = `${spotId}/${crypto.randomUUID()}.jpg`;
    const st = sb.storage.from(BUCKET);
    const a = await st.upload(path, full, { contentType: 'image/jpeg', upsert: false });
    if (a.error) throw a.error;
    const b = await st.upload(thumbPath(path), thumb, { contentType: 'image/jpeg', upsert: false });
    if (b.error) { await st.remove([path]); throw b.error; }
    const { error } = await sb.from('champi_photos').insert({ spot_id: spotId, find_id: findId, path });
    if (error) { await st.remove([path, thumbPath(path)]); throw error; }
    return path;
  }

  /** Supprime les fichiers puis les lignes (photos déjà chargées : objets { id, path }). */
  async function removeFiles(photos) {
    if (!photos.length) return;
    const paths = photos.flatMap((p) => [p.path, thumbPath(p.path)]);
    const { error } = await sb.storage.from(BUCKET).remove(paths);
    if (error) throw error;
  }

  async function remove(photo) {
    await removeFiles([photo]);
    const { error } = await sb.from('champi_photos').delete().eq('id', photo.id);
    if (error) throw error;
  }

  /** Liens signés (1 h), mis en cache. */
  async function urls(paths) {
    const now = Date.now();
    const missing = [...new Set(paths)].filter((p) => !(cache.get(p)?.exp > now + 60000));
    if (missing.length) {
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(missing, 3600);
      if (error) throw error;
      for (const d of data) if (d.signedUrl) cache.set(d.path, { url: d.signedUrl, exp: now + 3600 * 1000 });
    }
    return Object.fromEntries(paths.map((p) => [p, cache.get(p)?.url]));
  }

  /** Remplit les <img data-path> d'un conteneur. */
  async function hydrate(root) {
    const imgs = [...root.querySelectorAll('img[data-path]')];
    if (!imgs.length) return;
    const map = await urls(imgs.map((i) => i.dataset.path));
    for (const i of imgs) if (map[i.dataset.path]) i.src = map[i.dataset.path];
  }

  return { upload, remove, removeFiles, urls, hydrate };
}
