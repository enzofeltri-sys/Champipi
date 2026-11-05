// Logos des personnes : un emblème sur un fond de couleur, choisis dans « Mon profil ».
// Sans choix, chacun reçoit un logo par défaut stable, calculé à partir de son identifiant.
export const AVATAR_EMOJIS = ['🍄', '🦊', '🐗', '🦉', '🐿️', '🦔', '🐻', '🐺', '🦌', '🐝', '🐌', '🐸',
  '🌲', '🌳', '🍂', '🌰', '⛰️', '🌞', '🌙', '⭐', '🧺', '🥾', '🔥', '❤️'];
export const AVATAR_COLORS = ['#7a4cc2', '#d9720b', '#13867f', '#c0392b', '#2f6db5', '#3f8f2f',
  '#b5486a', '#8a5a2b', '#5b6770', '#0e7490', '#a16207', '#6d28d9'];

function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Logo d'un profil : le sien s'il l'a choisi, sinon un logo par défaut stable. */
export function avatarOf(profile) {
  const h = hash(profile?.id ?? profile?.display_name ?? '?');
  return {
    emoji: AVATAR_EMOJIS.includes(profile?.avatar_emoji) ? profile.avatar_emoji : AVATAR_EMOJIS[h % AVATAR_EMOJIS.length],
    color: AVATAR_COLORS.includes(profile?.avatar_color) ? profile.avatar_color : AVATAR_COLORS[(h >>> 8) % AVATAR_COLORS.length],
  };
}

const escAttr = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Pastille ronde (HTML) : emblème sur fond coloré. */
export function avatarHtml(profile, size = 22) {
  const a = avatarOf(profile);
  return `<span class="avatar" style="background:${a.color};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.6)}px" title="${escAttr(profile?.display_name ?? '')}" aria-hidden="true">${a.emoji}</span>`;
}
