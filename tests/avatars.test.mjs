import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avatarOf, avatarHtml, AVATAR_EMOJIS, AVATAR_COLORS } from '../site/js/avatars.js';

test('logo choisi respecté', () => {
  assert.deepEqual(avatarOf({ id: 'x', avatar_emoji: '🦊', avatar_color: '#c0392b' }), { emoji: '🦊', color: '#c0392b' });
});
test('logo par défaut stable et différent selon la personne', () => {
  const a = avatarOf({ id: 'adc9e05a-c3da-4293-a29c-faed87889357' });
  assert.deepEqual(a, avatarOf({ id: 'adc9e05a-c3da-4293-a29c-faed87889357' }));
  assert.ok(AVATAR_EMOJIS.includes(a.emoji) && AVATAR_COLORS.includes(a.color));
  const ids = Array.from({ length: 20 }, (_, i) => `id-${i}`).map((id) => JSON.stringify(avatarOf({ id })));
  assert.ok(new Set(ids).size >= 15, 'peu de collisions');
});
test('valeurs inconnues ignorées, HTML échappé', () => {
  const a = avatarOf({ id: 'y', avatar_emoji: '<script>', avatar_color: 'red' });
  assert.ok(AVATAR_EMOJIS.includes(a.emoji) && AVATAR_COLORS.includes(a.color));
  assert.ok(!avatarHtml({ id: 'z', display_name: '"><img>' }).includes('"><img>'));
});
