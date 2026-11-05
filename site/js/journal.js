// Journal de la famille : toutes les trouvailles visibles et les alertes reçues, du plus récent au plus ancien.
// Chaque notification (« Tata a trouvé… », « Conditions favorables ») renvoie à une ligne de ce journal.

/**
 * @param finds trouvailles visibles ; @param alerts [{ spot_id, sent_on }] alertes reçues ; @param spots coins visibles
 * @param opts { kind: 'all' | 'finds' | 'alerts', me, mineToo: true }
 * @returns [{ type: 'find' | 'alert', key, day, at, spot, find? }]
 */
export function buildJournal(finds, alerts, spots, { kind = 'all' } = {}) {
  const byId = new Map(spots.map((s) => [s.id, s]));
  const out = [];
  if (kind !== 'alerts') for (const f of finds) {
    const spot = byId.get(f.spot_id); if (!spot) continue;
    out.push({ type: 'find', key: `f:${f.id}`, day: f.found_on, at: f.created_at ?? f.found_on, spot, find: f });
  }
  if (kind !== 'finds') for (const a of alerts) {
    const spot = byId.get(a.spot_id); if (!spot) continue;
    out.push({ type: 'alert', key: `a:${a.spot_id}:${a.sent_on}`, day: a.sent_on, at: `${a.sent_on}T07:37:00`, spot });
  }
  return out.sort((a, b) => (a.day === b.day ? (a.at < b.at ? 1 : -1) : a.day < b.day ? 1 : -1));
}

/** Éléments arrivés depuis la dernière ouverture du journal (hors les miens). */
export function unreadCount(items, lastSeen, me) {
  if (!lastSeen) return 0;
  return items.filter((x) => x.at > lastSeen && !(x.type === 'find' && x.find.user_id === me)).length;
}

/** Titre de jour : « Aujourd'hui », « Hier » ou la date. */
export function dayTitle(day, today, formatDate) {
  if (day === today) return "Aujourd'hui";
  if (day === new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10)) return 'Hier';
  return formatDate(day);
}
