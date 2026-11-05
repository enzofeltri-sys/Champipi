// Gestes communs aux parcours, pour l'interface « carte seule ».
async function closeDialogs(page) {
  await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); document.querySelector('#menu').hidden = true; });
}
async function openList(page) {
  if (await page.evaluate(() => document.querySelector('#dlg-list').open)) return;
  await closeDialogs(page);
  await page.click('#menu-btn'); await page.click('#list-btn');
  await page.waitForSelector('#dlg-list[open]');
}
/** Ouvre un coin par son nom depuis la liste ; déplie « Météo, bilan et détails » (more = true). */
async function openSpot(page, text, { more = true } = {}) {
  await openList(page);
  const loc = text ? page.locator('.spot-item', { hasText: text }) : page.locator('.spot-item').first();
  await loc.first().click();
  await page.waitForSelector('#dlg-spot[open]');
  if (more) await page.evaluate(() => { document.querySelector('#spot-more').open = true; });
}
async function setScope(page, scope) { await openList(page); await page.click(`#scope-seg [data-scope=${scope}]`); }
async function pickSpecies(page, label) { await closeDialogs(page); await page.locator('.sp-chip', { hasText: label }).first().click(); }
/** « ＋ Noter un coin » puis « C'est ici » (centre de la carte) : la fiche du nouveau coin s'ouvre. */
async function addAtCenter(page) {
  await closeDialogs(page);
  await page.click('#btn-add'); await page.click('#add-here');
  await page.waitForSelector('#dlg-edit[open], #dlg-near[open]'); if (await page.isVisible('#dlg-near')) await page.click('#near-no'); 
  await page.waitForSelector('#dlg-edit[open]');
}
module.exports = { closeDialogs, openList, openSpot, setScope, pickSpecies, addAtCenter };
