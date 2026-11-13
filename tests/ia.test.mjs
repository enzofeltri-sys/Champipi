import test from 'node:test';
import assert from 'node:assert/strict';
import { outingFacts, outingReading, outingNext, spotHistory, checkComment, groqComment } from '../supabase/functions/champi-alertes/ia.js';

const day = '2026-11-13';
const w = { rain10: 52, rain30: 118, bigRains: [{ ago: 1, mm: 48 }, { ago: 24, mm: 25 }], balance30: 52, soilT3: 11.6, tmin7: 6.2, frost7: 0,
  future: [{ tmin: 3, rain: 1 }, { tmin: -1, rain: 2 }, { tmin: 2, rain: 1 }, { tmin: -5, rain: 30 }] };
const lact = { id: 'lactaire-sanguin', label: 'Lactaire sanguin', win: [5, 25] };
const facts = outingFacts({ empty: false, spotName: 'Pinède Chorges', author: 'Enzo', found: ['Lactaire sanguin'], sp: [lact], w, rank: 0.9,
  swi: { swi: 0.8, normal: 0.6 }, history: [], day, week: 4 });

test('lecture par espèce : fenêtre de l\'espèce, date de la pluie, position', () => {
  assert.match(facts.lecture_de_l_appli[0], /Lactaire sanguin : sorti 24 jours après les 25 mm du 20 octobre \(sa fenêtre : 5 à 25 jours, en bout de fenêtre\)/);
  const cepe = { id: 'cepe', label: 'Cèpe', win: [7, 25] };
  assert.match(outingReading(false, { bigRains: [{ ago: 5, mm: 40 }] }, [cepe], day)[0], /trop récente/);
});

test('la suite : fenêtre rouverte par la pluie récente, gel annoncé', () => {
  assert.deepEqual(facts.la_suite, ['les 48 mm du 12 novembre peuvent relancer une poussée entre le 17 novembre et le 7 décembre', 'gel annoncé 1 nuit sur les 3 prochaines']);
  assert.match(outingNext({ bigRains: [], future: [] }, [lact], day)[0], /pas de nouvelle poussée en vue/);
});

test('historique du coin, comparaison, semaine', () => {
  assert.deepEqual(facts.historique_du_coin, ['première trouvaille notée à ce coin']);
  const h = spotHistory([{ found_on: '2025-11-02', species: ['cepe'] }, { found_on: '2026-11-03', species: ['cepe'], empty: false }, { found_on: '2026-11-08', empty: true }],
    day, ['lactaire-sanguin'], () => 'Lactaire sanguin');
  assert.deepEqual(h, ['2 trouvailles déjà notées à ce coin avant celle-ci', 'première fois noté ici : Lactaire sanguin', 'déjà trouvé ici en novembre 2025', '3e sortie du mois à ce coin']);
  assert.equal(facts.comparaison_avec_la_saison[0], 'sol plus humide que 9 jours de novembre sur 10 ici');
  assert.equal(facts.cette_semaine_dans_l_appli, '4 autres trouvailles ces 7 derniers jours');
  assert.equal(facts.auteur, 'Enzo');
  assert.ok(!JSON.stringify(facts).match(/"lat|"lon/));
});

test('bredouille : trop tôt, ou conditions correctes', () => {
  assert.match(outingReading(true, { bigRains: [{ ago: 3, mm: 25 }] }, [lact], day)[0], /trop tôt/);
  assert.match(outingReading(true, { bigRains: [{ ago: 10, mm: 25 }] }, [lact], day)[0], /aide l'appli/);
  assert.match(outingReading(true, { bigRains: [], balance30: -80 }, [lact], day)[0], /sol en déficit/);
  const e = outingFacts({ empty: true, spotName: 'X', found: ['Cèpe'], sp: [lact], w: null, day });
  assert.equal(e.trouve, undefined);
});

test('commentaire : chiffres et dates des faits acceptés, inventés refusés', () => {
  assert.equal(checkComment('« Premier lactaire ici, Enzo : 24 jours après les 25 mm du 20 octobre. »', facts), 'Premier lactaire ici, Enzo : 24 jours après les 25 mm du 20 octobre.');
  assert.equal(checkComment('Ça pousse en général 2 à 4 jours après la pluie.', facts), null);
  assert.equal(checkComment('Bon appétit, ils sont comestibles !', facts), null);
});

test('appel Groq : réponse filtrée, échec → null', async () => {
  const ok = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'Le sol était bien chargé : 118 mm sur 30 jours.' } }] }) });
  assert.equal(await groqComment('k', facts, { fetchFn: ok }), 'Le sol était bien chargé : 118 mm sur 30 jours.');
  assert.equal(await groqComment('k', facts, { fetchFn: async () => ({ ok: false }) }), null);
  assert.equal(await groqComment('k', facts, { fetchFn: async () => { throw new Error('réseau'); } }), null);
});

test('nom de champ recopié par le modèle : retiré proprement', () => {
  assert.equal(checkComment('Sans gel prévu, la_suite', facts), 'Sans gel prévu.');
  assert.equal(checkComment('Pas de gel annoncé, la_suite.', facts), 'Pas de gel annoncé.');
});

test('sortie ancienne : pas de prévision (ce serait du passé)', () => {
  const old = outingNext(w, [lact], day, false);
  assert.deepEqual(old, ['les 48 mm du 12 novembre peuvent relancer une poussée entre le 17 novembre et le 7 décembre']);
});

test('cause inventée refusée, deuxième essai', async () => {
  assert.equal(checkComment('Le sol humide a favorisé la trouvaille.', facts), null);
  let n = 0;
  const seq = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: n++ ? 'Le sol a reçu 118 mm sur 30 jours.' : 'Ça a favorisé la pousse.' } }] }) });
  assert.equal(await groqComment('k', facts, { fetchFn: seq }), 'Le sol a reçu 118 mm sur 30 jours.');
});

test('prédictions trop sûres refusées', () => {
  assert.equal(checkComment('Les 48 mm devraient bien nourrir la suite.', facts), null);
  assert.equal(checkComment('Prépare-toi, ça va relancer !', facts), null);
});
