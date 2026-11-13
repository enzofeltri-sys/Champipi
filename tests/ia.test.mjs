import test from 'node:test';
import assert from 'node:assert/strict';
import { outingFacts, outingReading, checkComment, groqComment } from '../supabase/functions/champi-alertes/ia.js';

const w = { rain10: 32.4, rain30: 118, bigRains: [{ ago: 9, mm: 41.2 }], balance30: 52, soilT3: 11.6, tmin7: 6.2, frost7: 0 };
const facts = outingFacts({ empty: false, spotName: 'Trévaresse', found: ['Cèpe'], w, rank: 0.85, month: { trouvailles: 2, bredouilles: 1 } });

test('faits : arrondis, humidité en mots, pas de coordonnées', () => {
  assert.equal(facts.pluie_10_jours_mm, 32);
  assert.match(facts.lecture_de_l_appli[0], /cohérente avec la grosse pluie de 41 mm tombée 9 jours avant/);
  assert.equal(facts.humidite_du_sol, 'nettement plus humide que d\'habitude');
  assert.ok(!JSON.stringify(facts).match(/lat|lon/));
  const e = outingFacts({ empty: true, spotName: 'X', found: ['Cèpe'], w: null, rank: null });
  assert.equal(e.trouve, undefined);
  assert.equal(e.pluie_10_jours_mm, undefined);
});

test('commentaire : chiffres des faits acceptés, chiffres inventés refusés', () => {
  assert.equal(checkComment('« Belle sortie : 32 mm en 10 jours et une grosse pluie il y a 9 jours. »', facts),
    'Belle sortie : 32 mm en 10 jours et une grosse pluie il y a 9 jours.');
  assert.equal(checkComment('Ça pousse en général 2 à 4 jours après la pluie.', facts), null);
  assert.equal(checkComment('Bon appétit, ils sont comestibles !', facts), null);
  assert.equal(checkComment('', facts), null);
});

test('commentaire trop long : coupé proprement', () => {
  const long = 'Le sol est nettement plus humide que d\'habitude. ' + 'Encore une belle sortie au coin '.repeat(12);
  const t = checkComment(long, facts);
  assert.ok(t.length <= 262);
  assert.ok(t.endsWith('.') || t.endsWith('…'));
});

test('appel Groq : réponse filtrée, échec → null', async () => {
  const ok = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'Le sol était bien chargé : 118 mm sur 30 jours.' } }] }) });
  assert.equal(await groqComment('k', facts, { fetchFn: ok }), 'Le sol était bien chargé : 118 mm sur 30 jours.');
  assert.equal(await groqComment('k', facts, { fetchFn: async () => ({ ok: false }) }), null);
  assert.equal(await groqComment('k', facts, { fetchFn: async () => { throw new Error('réseau'); } }), null);
  assert.equal(await groqComment('', facts, { fetchFn: ok }), null);
});

test("lecture : c'est le code qui dit quelle pluie explique la pousse", () => {
  // Grosse pluie trop récente : elle n'explique pas la trouvaille (erreur faite par le modèle seul).
  assert.match(outingReading(false, { bigRains: [{ ago: 2, mm: 50 }], balance30: 20 })[0], /trop récente pour expliquer/);
  // Les deux : la bonne pluie explique, la récente « n'a pas encore agi ».
  const both = outingReading(false, { bigRains: [{ ago: 12, mm: 30 }, { ago: 1, mm: 29 }] });
  assert.match(both[0], /30 mm tombée 12 jours avant/);
  assert.match(both[1], /29 mm d'il y a 1 jour n'a pas encore agi/);
  assert.match(outingReading(false, { bigRains: [], balance30: 40 })[0], /réserve d'eau/);
  assert.match(outingReading(true, { bigRains: [], balance30: -80 })[0], /sol en déficit/);
  assert.match(outingReading(true, { bigRains: [{ ago: 3, mm: 25 }] })[0], /trop tôt/);
  assert.match(outingReading(true, { bigRains: [{ ago: 10, mm: 25 }] })[0], /aide l'appli/);
  assert.deepEqual(outingReading(false, null), []);
});
