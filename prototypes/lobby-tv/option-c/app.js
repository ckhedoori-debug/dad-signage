(function () {
  'use strict';
  const W = 2436;
  const H = 783;

  function fit() {
    const sx = window.innerWidth / W;
    const sy = window.innerHeight / H;
    const s = Math.min(sx, sy);
    document.documentElement.style.setProperty('--fit', s);
  }

  function tick() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const c = document.getElementById('clock');
    if (c) c.textContent = hh + ':' + mm;
    const day = d.toLocaleDateString('en-AU', { weekday: 'long' }).toUpperCase();
    const date = d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
    const dEl = document.getElementById('date');
    if (dEl) dEl.textContent = day + ' · ' + date;
  }

  let cache = { mkts: {}, btc: null, news: { items: [] } };

  async function refreshMarkets(root) {
    try {
      const [mkts, btc] = await Promise.all([
        LobbyData.fetchMarkets(),
        LobbyData.fetchBTC()
      ]);
      cache.mkts = mkts;
      cache.btc = btc;
      LobbyData.applyMarkets(root, mkts, btc);
      LobbyData.applyTicker(root, mkts, btc, cache.news);
    } catch (e) { console.error('[markets]', e); }
  }
  async function refreshWeather(root) {
    try {
      const wx = await LobbyData.fetchWeather();
      LobbyData.applyWeather(root, wx);
    } catch (e) { console.error('[weather]', e); }
  }
  async function refreshNews(root) {
    try {
      const news = await LobbyData.fetchNews(5);
      cache.news = news;
      LobbyData.applyNews(root, news);
      LobbyData.applyTicker(root, cache.mkts, cache.btc, news);
    } catch (e) { console.error('[news]', e); }
  }

  function init() {
    const root = document;
    fit();
    tick();
    window.addEventListener('resize', fit);
    setInterval(tick, 1000);

    refreshWeather(root);
    refreshMarkets(root);
    refreshNews(root);

    setInterval(() => refreshWeather(root), 10 * 60 * 1000);
    setInterval(() => refreshMarkets(root), 60 * 1000);
    setInterval(() => refreshNews(root), 10 * 60 * 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
