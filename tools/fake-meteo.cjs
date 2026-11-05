// Réponse Open-Meteo simulée (pour les parcours qui ne testent pas l'API elle-même).
module.exports = async function fakeMeteo(page) {
  await page.route('https://api.open-meteo.com/**', (route) => {
    const u = new URL(route.request().url());
    const lats = (u.searchParams.get('latitude') || '').split(',');
    const today = new Date(); const days = [];
    for (let i = -14; i <= 2; i++) { const d = new Date(today); d.setDate(d.getDate() + i); days.push(d.toISOString().slice(0, 10)); }
    const one = (k) => ({ daily: { time: days, precipitation_sum: days.map((_, i) => (i === 6 ? 22 : i === 9 ? 6 : 0)),
      temperature_2m_max: days.map(() => 16), temperature_2m_min: days.map(() => 7) } });
    const body = lats.length > 1 ? lats.map(one) : one();
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
};
