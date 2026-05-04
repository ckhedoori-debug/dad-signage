(function () {
  'use strict';
  const W = 2436;
  const H = 783;

  function fit() {
    const sx = window.innerWidth / W;
    const sy = window.innerHeight / H;
    const kiosk = sx >= 1 && sy >= 1;
    const s = kiosk ? 1 : Math.min(sx, sy);
    document.documentElement.style.setProperty('--fit', s);
    document.documentElement.classList.toggle('kiosk-mode', kiosk);
  }

  function tick() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const c = document.getElementById('clock');
    if (c) c.textContent = hh + ':' + mm;
    const day = d.toLocaleDateString('en-AU', { weekday: 'short' }).toUpperCase();
    const date = d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' }).toUpperCase();
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

  function setupHeroCrossfade() {
    const a = document.getElementById('heroA');
    const b = document.getElementById('heroB');
    if (!a || !b) return;

    const FPS = 24;
    const FADE_FRAMES = 80;
    const FADE_SEC = FADE_FRAMES / FPS;

    let active = a;
    let standby = b;
    let switching = false;

    function startActive() {
      active.classList.add('is-active');
      const p = active.play();
      if (p && p.catch) p.catch(err => console.error('[hero active]', err));
    }

    if (active.readyState >= 1) {
      startActive();
    } else {
      active.addEventListener('loadedmetadata', startActive, { once: true });
    }

    function tickHero() {
      if (switching) return;
      if (!active.duration || isNaN(active.duration) || active.duration === Infinity) return;
      const remaining = active.duration - active.currentTime;
      if (remaining <= FADE_SEC && remaining > 0) {
        switching = true;
        standby.currentTime = 0;
        const p = standby.play();
        if (p && p.catch) p.catch(err => console.error('[hero standby]', err));
        active.classList.remove('is-active');
        standby.classList.add('is-active');
        const oldActive = active;
        active = standby;
        standby = oldActive;
        setTimeout(() => {
          oldActive.pause();
          oldActive.currentTime = 0;
          switching = false;
        }, FADE_SEC * 1000 + 100);
      }
    }

    setInterval(tickHero, 250);
  }

  function init() {
    const root = document;
    fit();
    tick();
    window.addEventListener('resize', fit);
    setInterval(tick, 1000);

    setupHeroCrossfade();

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
