// Commentaire automatique d'une sortie par l'IA (Groq). L'IA ne fait que reformuler les faits calculés par l'appli :
// pas d'identification, pas d'avis sur la comestibilité, pas de chiffre qui ne soit pas dans les faits.

export const MODEL = 'openai/gpt-oss-120b';
export const MAX_LEN = 260;

const r0 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v));

export const WINDOW = [5, 25];   // délai pluie → pousse retenu par l'appli (selon l'espèce, 5 à 25 jours)

/**
 * Lecture de la sortie, calculée ici (l'IA ne fait aucun lien de cause elle-même) :
 * quelle grosse pluie peut expliquer la pousse, ou pourquoi c'était bredouille.
 */
export function outingReading(empty, w) {
  if (!w) return [];
  const rains = (w.bigRains ?? []).slice().sort((a, b) => a.ago - b.ago);
  const fit = rains.find((r) => r.ago >= WINDOW[0] && r.ago <= WINDOW[1]);
  const fresh = rains.find((r) => r.ago < WINDOW[0]);
  const bal = w.balance30;
  const out = [];
  if (!empty) {
    if (fit) out.push(`pousse cohérente avec la grosse pluie de ${r0(fit.mm)} mm tombée ${fit.ago} jours avant (l'appli compte 5 à 25 jours entre pluie et pousse)`);
    else if (fresh) out.push(`la grosse pluie de ${r0(fresh.mm)} mm tombée ${fresh.ago} jour${fresh.ago > 1 ? 's' : ''} avant est trop récente pour expliquer cette pousse : elle vient de l'humidité accumulée avant`);
    else out.push(bal != null && bal >= 0 ? 'pas de grosse pluie juste avant : la pousse s\'appuie sur la réserve d\'eau du sol' : 'pas de grosse pluie juste avant : pousse discrète, sur l\'humidité restante');
    if (fit && fresh) out.push(`la grosse pluie de ${r0(fresh.mm)} mm d'il y a ${fresh.ago} jour${fresh.ago > 1 ? 's' : ''} n'a pas encore agi`);
  } else {
    if (!rains.length) out.push(bal != null && bal < 0 ? 'aucune grosse pluie depuis 30 jours et sol en déficit : rien d\'étonnant' : 'aucune grosse pluie depuis 30 jours : rien d\'étonnant');
    else if (fresh && !fit) out.push(`la dernière grosse pluie (${r0(fresh.mm)} mm) date de ${fresh.ago} jour${fresh.ago > 1 ? 's' : ''} : trop tôt pour une pousse`);
    else if (fit) out.push(`les conditions semblaient correctes (grosse pluie de ${r0(fit.mm)} mm ${fit.ago} jours avant) : ce passage aide l'appli à mieux connaître ce coin`);
    else out.push('la dernière grosse pluie remonte à plus de 25 jours : la poussée est sans doute passée');
  }
  return out;
}

/** Faits d'une sortie (aucune coordonnée). month = sorties de ce coin ce mois-ci. */
export function outingFacts({ empty, spotName, found, w, rank, month }) {
  const humid = rank == null ? null : rank <= 0.2 ? 'nettement plus sec que d\'habitude' : rank < 0.4 ? 'un peu plus sec que d\'habitude'
    : rank >= 0.8 ? 'nettement plus humide que d\'habitude' : rank > 0.6 ? 'un peu plus humide que d\'habitude' : 'habituel pour la saison';
  const f = { sortie: empty ? 'bredouille (rien trouvé)' : 'trouvaille', coin: spotName };
  if (!empty) f.trouve = found;
  if (w) {
    f.lecture_de_l_appli = outingReading(empty, w);
    f.pluie_10_jours_mm = r0(w.rain10);
    if (w.rain30 != null) f.pluie_30_jours_mm = r0(w.rain30);
    if (w.balance30 != null) f.bilan_pluie_moins_evaporation_30_jours_mm = r0(w.balance30);
    if (humid) f.humidite_du_sol = humid;
    if (w.soilT3 != null) f.temperature_du_sol_c = r0(w.soilT3);
    if (w.frost7) f.nuits_de_gel_7_jours = w.frost7;
  }
  if (month) f.sorties_a_ce_coin_ce_mois = month;
  return f;
}

export const SYSTEM = `Tu écris un court commentaire (1 ou 2 phrases, 220 caractères au plus) sous une sortie aux champignons d'une appli familiale, en français, ton chaleureux et simple, tutoiement collectif.
Règles strictes :
- Utilise UNIQUEMENT les faits fournis en JSON. N'invente aucun fait, aucun chiffre, aucun délai, aucune généralité de mycologie.
- Ne fais AUCUN lien de cause toi-même : l'explication est dans « lecture_de_l_appli », reprends-la fidèlement (tu peux la raccourcir).
- Tout chiffre que tu écris doit figurer tel quel dans les faits. Dans le doute, n'écris pas de chiffre.
- N'identifie jamais un champignon, ne parle jamais de comestibilité, de toxicité ni de cuisine.
- Ne donne aucun lieu, aucune coordonnée, aucun conseil de sécurité.
- Pas d'exclamations en série, pas de « bravo à tous », pas de « exactement ce qui était prévu ». Sobre et amical.
- Pour une sortie bredouille : sobre, sans promettre de date.
Réponds seulement par le commentaire, sans guillemets.`;

/** Nombres présents dans les faits (pour refuser un chiffre inventé). */
function numbersIn(obj) {
  const out = new Set();
  JSON.stringify(obj).replace(/-?\d+(?:[.,]\d+)?/g, (m) => { out.add(String(Math.abs(Number(m.replace(',', '.'))))); return m; });
  return out;
}

const BANNED = /comestible|toxique|mortel|poison|v[ée]n[ée]neu|cuisin|recette|manger|consomm|identifi/i;

/** Nettoie la réponse ; null si elle sort des règles (chiffre inventé, comestibilité…). */
export function checkComment(text, facts) {
  if (!text) return null;
  let t = String(text).replace(/\s+/g, ' ').trim().replace(/^["«»“”\s]+|["«»“”\s]+$/g, '');
  if (!t || BANNED.test(t)) return null;
  const known = numbersIn(facts);
  for (const m of t.match(/\d+(?:[.,]\d+)?/g) ?? []) if (!known.has(String(Number(m.replace(',', '.'))))) return null;
  if (t.length > MAX_LEN) {
    const cut = t.slice(0, MAX_LEN);
    const end = cut.lastIndexOf('.');
    t = end > 80 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…';
  }
  return t;
}

/** Appel Groq ; null en cas d'échec ou de réponse refusée (on n'affiche alors rien). */
export async function groqComment(key, facts, { timeoutMs = 9000, fetchFn = fetch } = {}) {
  if (!key) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchFn('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', signal: ctl.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, reasoning_effort: 'low', temperature: 0.4, max_tokens: 500,
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: JSON.stringify(facts) }] }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return checkComment(j?.choices?.[0]?.message?.content, facts);
  } catch { return null; } finally { clearTimeout(timer); }
}
