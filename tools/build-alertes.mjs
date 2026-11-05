// Génère supabase/functions/champi-alertes/rules.js à partir des règles de l'appli
// (site/js/advisor.js + logic.js), pour que les alertes donnent exactement le même avis que l'appli.
// Usage : node tools/build-alertes.mjs   (à relancer après toute modification des règles, puis redéployer)
import { build } from 'esbuild';
await build({
  stdin: { contents: "export { summarizeWeather, assess } from './site/js/advisor.js'; export { spotSpecies, SPECIES } from './site/js/logic.js';", resolveDir: '.', loader: 'js' },
  bundle: true, format: 'esm', minifyWhitespace: true, treeShaking: true, legalComments: 'none',
  banner: { js: '// FICHIER GÉNÉRÉ par tools/build-alertes.mjs depuis site/js/advisor.js et logic.js : ne pas modifier à la main.' },
  outfile: 'supabase/functions/champi-alertes/rules.js',
});
console.log('rules.js généré');
