// Commentaire automatique d'une sortie par l'IA (Groq). L'IA ne fait que reformuler les faits calculés par l'appli :
// pas d'identification, pas d'avis sur la comestibilité, pas de chiffre qui ne soit pas dans les faits.

export const MODEL = 'openai/gpt-oss-120b';
export const MAX_LEN = 260;

const r0 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v));

export const WINDOW = [5, 25];   // délai pluie → pousse, toutes espèces confondues (sinon fenêtre de l'espèce)
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const addDays = (iso, k) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
export const dateFr = (iso) => `${Number(iso.slice(8, 10))} ${MOIS[Number(iso.slice(5, 7)) - 1]}`;
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

/**
 * Lecture de la sortie, calculée ici (l'IA ne fait aucun lien de cause elle-même).
 * sp = [{ label, win: [lo, hi] }] : espèces trouvées (ou attendues au coin si bredouille), avec leur fenêtre pluie → pousse.
 */
export function outingReading(empty, w, sp = [], day = null) {
  if (!w) return [];
  const rains = (w.bigRains ?? []).slice().sort((a, b) => a.ago - b.ago);
  const when = (r) => (day ? `les ${r0(r.mm)} mm du ${dateFr(addDays(day, -r.ago))}` : `la grosse pluie de ${r0(r.mm)} mm`);
  const out = [];
  const list = sp.length ? sp : [{ label: null, win: WINDOW }];
  if (!empty) {
    for (const { label, win } of list.slice(0, 3)) {
      const fit = rains.find((r) => r.ago >= win[0] && r.ago <= win[1]);
      const who = label ? `${label} : ` : '';
      if (fit) {
        const pos = (fit.ago - win[0]) / (win[1] - win[0]);
        out.push(`${who}sorti ${fit.ago} jours après ${when(fit)} (sa fenêtre : ${win[0]} à ${win[1]} jours, ${pos < 0.34 ? 'en début' : pos > 0.66 ? 'en bout' : 'au milieu'} de fenêtre)`);
      } else if (rains.some((r) => r.ago < win[0])) out.push(`${who}la dernière grosse pluie est trop récente pour expliquer cette pousse, qui vient de l'humidité accumulée avant`);
      else out.push(`${who}aucune grosse pluie dans la fenêtre habituelle (${win[0]} à ${win[1]} jours avant) : cette pousse vient de la réserve d'eau du sol`);
    }
  } else {
    const lo = Math.min(...list.map((x) => x.win[0])), hi = Math.max(...list.map((x) => x.win[1]));
    const fit = rains.find((r) => r.ago >= lo && r.ago <= hi), fresh = rains.find((r) => r.ago < lo);
    if (fit) out.push(`conditions pourtant correctes (${when(fit)}, ${fit.ago} jours avant) : ce passage aide l'appli à mieux connaître ce coin`);
    else if (fresh) out.push(`la dernière grosse pluie (${when(fresh)}) date de ${plural(fresh.ago, 'jour')} : trop tôt pour une pousse`);
    else if (!rains.length) out.push(w.balance30 != null && w.balance30 < 0 ? 'aucune grosse pluie depuis 30 jours et sol en déficit : rien d\'étonnant' : 'aucune grosse pluie depuis 30 jours : rien d\'étonnant');
    else out.push(`la dernière grosse pluie remonte à plus de ${hi} jours : la poussée est sans doute passée`);
  }
  return out;
}

/** La suite (calculée) : prochaine fenêtre de pousse ouverte par une pluie récente, gel annoncé. */
export function outingNext(w, sp = [], day, forecast = true) {
  if (!w || !day) return [];
  const list = sp.length ? sp : [{ win: WINDOW }];
  const lo = Math.min(...list.map((x) => x.win[0])), hi = Math.max(...list.map((x) => x.win[1]));
  const fresh = (w.bigRains ?? []).filter((r) => r.ago < lo).sort((a, b) => b.mm - a.mm)[0];
  const out = [];
  if (fresh) {
    const rainDay = addDays(day, -fresh.ago);
    out.push(`les ${r0(fresh.mm)} mm du ${dateFr(rainDay)} peuvent relancer une poussée entre le ${dateFr(addDays(rainDay, lo))} et le ${dateFr(addDays(rainDay, hi))}`);
  } else if (!(w.bigRains ?? []).length) out.push('pas de grosse pluie récente : pas de nouvelle poussée en vue pour l\'instant');
  // Prévisions (gel, pluie annoncée) seulement pour une sortie du jour ou de la veille : sinon ce serait du passé.
  const fut = forecast ? (w.future ?? []).slice(0, 3).filter((r) => r.tmin != null) : [];
  if (fut.length) {
    const gel = fut.filter((r) => r.tmin < 0).length;
    out.push(gel ? `gel annoncé ${plural(gel, 'nuit')} sur les ${fut.length} prochaines` : `pas de gel annoncé sur les ${fut.length} prochains jours`);
  }
  const next3 = forecast ? (w.future ?? []).slice(0, 3).reduce((a, r) => a + (r.rain || 0), 0) : 0;
  if (next3 >= 15) out.push(`${r0(next3)} mm de pluie annoncés sur les 3 prochains jours`);
  return out;
}

/** Historique du coin avant cette sortie. hist = sorties du coin (sans celle-ci), ids = espèces trouvées, labelOf. */
export function spotHistory(hist, day, ids, labelOf) {
  const before = hist.filter((x) => x.found_on <= day);
  const real = before.filter((x) => !x.empty);
  const out = [];
  if (!real.length) out.push('première trouvaille notée à ce coin');
  else out.push(`${plural(real.length, 'trouvaille')} déjà notée${real.length > 1 ? 's' : ''} à ce coin avant celle-ci`);
  const seen = new Set(real.flatMap((x) => x.species ?? []));
  const neu = ids.filter((id) => !seen.has(id));
  if (real.length && neu.length) out.push(`première fois noté ici : ${neu.map(labelOf).join(', ')}`);
  const m = day.slice(5, 7), y = Number(day.slice(0, 4));
  const years = [...new Set(real.filter((x) => x.found_on.slice(5, 7) === m && Number(x.found_on.slice(0, 4)) < y).map((x) => x.found_on.slice(0, 4)))].sort();
  if (years.length) out.push(`déjà trouvé ici en ${MOIS[Number(m) - 1]} ${years.join(', ')}`);
  const nth = before.filter((x) => x.found_on.slice(0, 7) === day.slice(0, 7)).length + 1;
  if (nth > 1) out.push(`${nth}e sortie du mois à ce coin`);
  return out;
}

/** Faits d'une sortie (aucune coordonnée, aucun autre coin nommé). */
export function outingFacts({ empty, spotName, author, found, sp = [], w, rank, swi, history = [], day, week = null, forecast = true }) {
  const f = { sortie: empty ? 'bredouille (rien trouvé)' : 'trouvaille', auteur: author ?? null, coin: spotName };
  if (!empty) f.trouve = found;
  if (w) {
    f.lecture_de_l_appli = outingReading(empty, w, sp, day);
    const next = outingNext(w, sp, day, forecast);
    if (next.length) f.la_suite = next;
    f.pluie_10_jours_mm = r0(w.rain10);
    if (w.rain30 != null) f.pluie_30_jours_mm = r0(w.rain30);
    const cmp = [];
    if (rank != null && day) cmp.push(rank >= 0.6 ? `sol plus humide que ${Math.round(rank * 10)} jours de ${MOIS[Number(day.slice(5, 7)) - 1]} sur 10 ici` : rank <= 0.3 ? `sol plus sec que ${10 - Math.round(rank * 10)} jours de ${MOIS[Number(day.slice(5, 7)) - 1]} sur 10 ici` : 'sol humide comme d\'habitude en cette saison');
    if (swi?.swi != null && swi.normal != null) cmp.push(`réserve profonde du sol (Météo-France) à ${Math.round(swi.swi * 100)} %, normale ${Math.round(swi.normal * 100)} %`);
    if (w.balance30 != null) cmp.push(`bilan pluie moins évaporation sur 30 jours : ${w.balance30 > 0 ? '+' : ''}${r0(w.balance30)} mm`);
    if (cmp.length) f.comparaison_avec_la_saison = cmp;
    if (w.soilT3 != null) f.temperature_du_sol_c = r0(w.soilT3);
  }
  if (history.length || day) f.historique_du_coin = spotHistory(history, day, empty ? [] : (sp.map((x) => x.id).filter(Boolean)), (id) => sp.find((x) => x.id === id)?.label ?? id);
  if (week != null) f.cette_semaine_dans_l_appli = week ? `${week} autre${week > 1 ? 's' : ''} trouvaille${week > 1 ? 's' : ''} ces 7 derniers jours` : 'aucune autre trouvaille ces 7 derniers jours';
  return f;
}

export const SYSTEM = `Tu es le copain cueilleur de la famille : tu écris la petite réaction qui s'affiche sous une sortie aux champignons, dans leur appli. En français, ton détendu, complice et drôle, comme un message entre potes : tutoiement, le prénom s'il est donné, une pointe d'humour ou de taquinerie gentille, un emoji au plus.
Format : 1 ou 2 phrases courtes, 200 caractères au plus. Une seule info marquante (une première fois, un sol gorgé d'eau, une semaine de folie, une poussée qui se prépare), puis si possible ce qui vient. Pas de liste, pas de jargon (« fenêtre », « réserve profonde », « bilan », « évaporation ») : dis-le avec des mots de tous les jours. Deux chiffres au maximum.
Exemples de ton (les faits sont inventés, ne les recopie pas) :
« Premier lactaire ici, Léo ! Il a pris son temps après la pluie d'octobre… et celle d'hier pourrait en ramener vers la fin du mois 🍄 »
« Bredouille, mais pas de honte : la grosse pluie date d'avant-hier, les champignons sont encore en pyjama. »
« Sixième trouvaille de la semaine dans la famille, ça pousse de partout ! Le sol est gorgé comme une éponge. »
Règles strictes (non négociables) :
- Utilise UNIQUEMENT les faits fournis en JSON ; tout chiffre ou date écrit doit y figurer tel quel. Dans le doute, pas de chiffre.
- Aucun lien de cause de ton cru : l'explication est dans « lecture_de_l_appli », la prévision dans « la_suite ». Rien d'autre n'est prévu. Une pluie datée avant la sortie est passée, jamais « prévue ».
- N'identifie jamais un champignon, ne parle jamais de comestibilité, de toxicité ni de cuisine. Pas de lieu, pas de coordonnée.
- Ne devine pas le genre de l'auteur d'après son prénom : aucun adjectif ni participe accordé à l'auteur.
- N'écris jamais les noms des champs du JSON.
Réponds seulement par la réaction, sans guillemets.`;

/** Nombres présents dans les faits (pour refuser un chiffre inventé). */
function numbersIn(obj) {
  const out = new Set();
  JSON.stringify(obj).replace(/-?\d+(?:[.,]\d+)?/g, (m) => { out.add(String(Math.abs(Number(m.replace(',', '.'))))); return m; });
  return out;
}

const BANNED = /comestible|toxique|mortel|poison|v[ée]n[ée]neu|cuisin|recette|manger|consomm|identifi/i;
// Liens de cause ou promesses que le modèle ajoute de lui-même (la cause est dans lecture_de_l_appli, pas ailleurs).
const INVENTED = /favoris|grâce à|a permis|permet(tent)? |a laissé|laisse(nt)? présager|ce qui a |idéal|parfait|découvres ce coin/i;

/** Nettoie la réponse ; null si elle sort des règles (chiffre inventé, comestibilité…). */
export function checkComment(text, facts) {
  if (!text) return null;
  let t = String(text).replace(/\s+/g, ' ').trim().replace(/^["«»“”\s]+|["«»“”\s]+$/g, '');
  // Nom de champ recopié par le modèle (« la_suite ») : on l'enlève avec sa ponctuation.
  t = t.replace(/\s*[,;:–-]?\s*\b[a-z]+(?:_[a-z]+)+\b\s*/gi, ' ').replace(/\s+([.,;!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  if (t && !/[.!?…]$/.test(t)) t += '.';
  if (!t || BANNED.test(t) || INVENTED.test(t)) return null;
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
export async function groqComment(key, facts, { timeoutMs = 12000, fetchFn = fetch, tries = 2 } = {}) {
  if (!key) return null;
  for (let k = 0; k < tries; k++) {   // texte refusé (cause inventée…) ou limite de débit : un deuxième essai
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetchFn('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', signal: ctl.signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, reasoning_effort: 'medium', temperature: 0.8, max_tokens: 1500,
          messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: JSON.stringify(facts) }] }),
      });
      if (r.status === 429 && k + 1 < tries) { await new Promise((res) => setTimeout(res, 4000)); continue; }
      if (!r.ok) return null;
      const j = await r.json();
      const t = checkComment(j?.choices?.[0]?.message?.content, facts);
      if (t) return t;
    } catch { /* réseau ou délai dépassé : nouvel essai */ } finally { clearTimeout(timer); }
  }
  return null;
}
