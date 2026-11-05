import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildJournal, unreadCount, dayTitle } from '../site/js/journal.js';

const spots = [{ id: 's1', name: 'Pinède' }, { id: 's2', name: 'Châtaigneraie' }];
const finds = [
  { id: 'f1', spot_id: 's1', user_id: 'tata', found_on: '2026-11-04', created_at: '2026-11-04T17:00:00Z', species: ['cepe'] },
  { id: 'f2', spot_id: 's2', user_id: 'me', found_on: '2026-11-05', created_at: '2026-11-05T10:00:00Z', species: [] },
  { id: 'f3', spot_id: 'cache', user_id: 'x', found_on: '2026-11-05', created_at: '2026-11-05T11:00:00Z', species: [] },   // coin invisible
];
const alerts = [{ spot_id: 's1', sent_on: '2026-11-05' }];

test('journal : trouvailles et alertes, du plus récent au plus ancien', () => {
  const j = buildJournal(finds, alerts, spots);
  assert.deepEqual(j.map((x) => x.key), ['f:f2', 'a:s1:2026-11-05', 'f:f1']);
  assert.deepEqual(buildJournal(finds, alerts, spots, { kind: 'alerts' }).map((x) => x.type), ['alert']);
  assert.equal(buildJournal(finds, alerts, spots, { kind: 'finds' }).length, 2);
});

test('nouveautés : depuis la dernière visite, sans mes propres trouvailles', () => {
  const j = buildJournal(finds, alerts, spots);
  assert.equal(unreadCount(j, '2026-11-04T00:00:00Z', 'me'), 2);   // trouvaille de Tata + alerte
  assert.equal(unreadCount(j, null, 'me'), 0);                       // première ouverture : rien de « nouveau »
});

test('titres des jours', () => {
  assert.equal(dayTitle('2026-11-05', '2026-11-05', String), "Aujourd'hui");
  assert.equal(dayTitle('2026-11-04', '2026-11-05', String), 'Hier');
  assert.equal(dayTitle('2026-10-01', '2026-11-05', (d) => 'le ' + d), 'le 2026-10-01');
});
