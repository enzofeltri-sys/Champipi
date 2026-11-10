// Génère supabase/functions/champi-alertes/rules.js à partir des règles de l'appli
// (site/js/advisor.js + logic.js + learn.js), pour que les alertes donnent exactement le même avis que l'appli.
// Usage : node tools/build-alertes.mjs   (à relancer après toute modification des règles, puis redéployer)
import { build } from 'esbuild';
await build({
  stdin: { contents: "export { summarizeWeather, assess, burnedAt, outingConditions } from './site/js/advisor.js'; export { spotSpecies, SPECIES } from './site/js/logic.js'; export { MIN_FINDS, profileKey, recentFinds, historyRange, findConditions, spotProfile, personalAdvice } from './site/js/learn.js';", resolveDir: '.', loader: 'js' },
  bundle: true, format: 'esm', minifyWhitespace: true, treeShaking: true, legalComments: 'none',
  banner: { js: '// FICHIER GÉNÉRÉ par tools/build-alertes.mjs depuis site/js/advisor.js et logic.js : ne pas modifier à la main.' },
  outfile: 'supabase/functions/champi-alertes/rules.js',
});
// Pluie mesurée : copie telle quelle (module sans dépendance).
import { readFileSync, writeFileSync } from 'node:fs';
writeFileSync('supabase/functions/champi-alertes/rain.js', '// COPIE de site/js/rain.js par tools/build-alertes.mjs : ne pas modifier à la main.\n' + readFileSync('site/js/rain.js', 'utf8'));
console.log('rules.js et rain.js générés');
