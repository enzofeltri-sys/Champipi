// « Qu'est-ce qui pousse ici ? » : à partir de la forêt (IGN BD Forêt V2), du sol (carte des sols INRAE,
// diffusée par l'IGN), de l'altitude et du mois, liste les champignons du carnet qui ont leur milieu ici.
// Règles simples et transparentes, pas d'IA. Indicatif : un milieu favorable ne garantit rien.
import { SPECIES, seasonText, seasonOf } from './logic.js';
import { GUIDE } from './advisor.js';
import { speciesTrees } from './forests.js';

const FEUILLUS = ['chene-blanc', 'chene-vert', 'chataignier', 'hetre'];
const PINS = ['pin-alep', 'pin-sylvestre', 'pin-maritime', 'pin-autre'];

/** Type de forêt IGN (champ « tfv ») → Map arbre → poids (2 = essence pure, 1 = mélange, possible). */
export function treesAt(tfv) {
  const t = (tfv || '').toLowerCase();
  const out = new Map();
  const put = (ids, k) => { for (const id of ids) out.set(id, Math.max(out.get(id) ?? 0, k)); };
  if (/pin d.alep/.test(t)) put(['pin-alep'], 2);
  if (/pin sylvestre/.test(t)) put(['pin-sylvestre'], 2);
  if (/pin maritime/.test(t)) put(['pin-maritime'], 2);
  if (/pin (noir|laricio|à crochets|cembro)|autres? pins?/.test(t)) put(['pin-autre'], 2);
  if (/mélange de pins/.test(t)) put(PINS, 1);
  if (/chênes? sempervirent/.test(t)) put(['chene-vert', 'chene-liege'], 2);
  if (/chênes? décidu/.test(t)) put(['chene-blanc'], 2);
  if (/hêtre/.test(t)) put(['hetre'], 2);
  if (/châtaignier/.test(t)) put(['chataignier'], 2);
  if (/mélèze/.test(t)) put(['meleze'], 2);
  if (!out.size) {
    const feuillus = /feuillus/.test(t), coniferes = /conifères/.test(t);
    if (feuillus) put(FEUILLUS, 1);
    if (coniferes) put([...PINS, 'meleze'], 1);
  }
  if (/formation herbacée/.test(t)) put(['prairie'], 2);
  if (/lande/.test(t)) put(['prairie'], 1);
  return out;
}

export const fix = (s) => (s || '').replace(/\u0092/g, '’').replace(/\s+/g, ' ').trim();

/**
 * Carte des sols (propriétés INRAE) → { kind: 'calcaire' | 'siliceux' | null, name, text }.
 * Le type vient du sol dominant quand il est net, sinon de la description de la zone ; sinon « non déterminé ».
 */
export function soilKind(p) {
  if (!p) return { kind: null, name: '', text: '' };
  const name = fix(p.nom_sol_dominant);
  const text = fix(p.nom_ucs);
  const s = name.toUpperCase();
  const d = text.toLowerCase();
  let kind = null;
  if (/RENDOSOL|RENDISOL|CALCOSOL|CALCISOL|DOLOMITOSOL/.test(s)) kind = 'calcaire';
  else if (/RANKOSOL|PODZOSOL|ALOCRISOL|VERACRISOL/.test(s)) kind = 'siliceux';
  else {
    const calc = /calcaire|calcarénite|marno|marne|dolo?mi|dolimi|gypse|travertin|molasse calcaire/.test(d);
    const sil = /cristallin|granit|gneiss|schiste|micaschiste|phyllade|quartzite|rhyolit|grès|siliceu|acide|maures|estérel|tanneron/.test(d);
    if (calc && !sil) kind = 'calcaire';
    else if (sil && !calc) kind = 'siliceux';
  }
  return { kind, name, text };
}

/**
 * @param ctx { trees: Map (treesAt), soil: 'calcaire'|'siliceux'|null, alt: mètres|null, month: 1-12 }
 * @returns [{ id, label, level: 'probable'|'possible', score, inSeason, peak, season, why: [{ ok, text }] }]
 */
export function whatGrows({ trees, soil = null, alt = null, month }) {
  const out = [];
  for (const sp of SPECIES) {
    const g = GUIDE[sp.id];
    if (!g || !g.trees.length) continue;            // milieu non décrit par des arbres (morille) : on ne juge pas
    const want = speciesTrees(sp.id);
    let tree = 0, treeName = '';
    for (const id of want) { const k = trees.get(id) ?? 0; if (k > tree) { tree = k; treeName = id; } }
    if (!tree) continue;
    const why = [{ ok: true, text: tree === 2 ? `arbres typiques (${TREE_LABEL[treeName] ?? treeName})` : 'arbres possibles dans le mélange' }];
    let score = tree * 2;
    if (g.soil) {
      if (soil === g.soil) { score += 1; why.push({ ok: true, text: `sol ${soil}` }); }
      else if (soil) { score -= 3; why.push({ ok: false, text: `préfère un sol ${g.soil} (ici ${soil})` }); }
      else why.push({ ok: null, text: `préfère un sol ${g.soil} (sol non déterminé ici)` });
    }
    if (alt != null) {
      if (alt < g.alt[0] - 100 || alt > g.alt[1] + 100) { score -= 3; why.push({ ok: false, text: `rare à ${alt} m (plutôt ${g.alt[0]}–${g.alt[1]} m)` }); }
      else why.push({ ok: true, text: `altitude ${alt} m` });
    }
    if (why.some((w) => w.ok === false)) continue;   // une contrainte nette n'est pas remplie : on ne le propose pas
    const inSeason = sp.months.includes(month), late = seasonOf(sp.id, month) === 'late';
    out.push({
      id: sp.id, label: sp.label, score, inSeason, late, peak: (sp.peak ?? []).includes(month), season: seasonText(sp.id),
      level: tree === 2 ? 'probable' : 'possible', why,
    });
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'probable' ? -1 : 1)
    || Number(b.inSeason) - Number(a.inSeason) || b.score - a.score);
}

export const TREE_LABEL = {
  'pin-alep': "pin d'Alep", 'pin-sylvestre': 'pin sylvestre', 'pin-maritime': 'pin maritime', 'pin-autre': 'pins',
  'chene-vert': 'chêne vert', 'chene-liege': 'chêne-liège', 'chene-blanc': 'chêne blanc', hetre: 'hêtre',
  chataignier: 'châtaignier', meleze: 'mélèze', prairie: 'prairie, pelouse',
};
