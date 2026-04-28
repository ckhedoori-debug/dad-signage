/* ============================================================
   Grace House Signage v2 — runtime
   - Stage auto-scale to viewport
   - Top-rail clock (small)
   - Markets table (live, animated row flash on update)
   - Sydney weather panel (live, full detail)
   - Continuous bottom ticker (rolling data)
   - Harmonograph motif (slow oscillating line, repeating loop)
   ============================================================ */

(() => {
  'use strict';

  const log  = (...a) => console.log('[gh2]', ...a);
  const warn = (...a) => console.warn('[gh2]', ...a);

  // ---------- 1. Stage scale -----------------------------------
  const stage = document.getElementById('stage');
  function scaleStage() {
    const cs = getComputedStyle(document.documentElement);
    const sw = parseFloat(cs.getPropertyValue('--screen-width'));
    const sh = parseFloat(cs.getPropertyValue('--screen-height'));
    const scale = Math.min(window.innerWidth / sw, window.innerHeight / sh);
    stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }
  window.addEventListener('resize', scaleStage);
  scaleStage();

  // ---------- 2. Config ----------------------------------------
  // Defaults are merged with config.json on boot. Edit config.json to change
  // stocks list / location / cadences without touching code.
  const DEFAULT_CONFIG = {
    location: { city: 'Sydney', lat: -33.87, lon: 151.21, tz: 'Australia/Sydney' },
    stocks: ['^AXJO', '^GSPC', '^IXIC', 'AUDUSD=X', 'GC=F', 'BTC-USD'],
    refreshIntervals: { weatherMinutes: 10, stocksMinutes: 5 },
  };
  const CONFIG = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  async function loadConfig() {
    try {
      const r = await fetch('config.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      if (j.location)         Object.assign(CONFIG.location, j.location);
      if (Array.isArray(j.stocks) && j.stocks.length) CONFIG.stocks = j.stocks;
      if (j.refreshIntervals) Object.assign(CONFIG.refreshIntervals, j.refreshIntervals);
      log('config loaded', CONFIG);
    } catch (e) {
      warn('config load failed, using defaults', e);
    }
  }

  const SYM_LABEL = {
    '^AXJO':    'ASX 200',
    '^GSPC':    'S&P 500',
    '^IXIC':    'NASDAQ',
    '^DJI':     'DOW',
    'AUDUSD=X': 'AUD/USD',
    'GC=F':     'GOLD',
    'BTC-USD':  'BTC/USD',
    'CL=F':     'OIL',
  };

  const pad2 = n => String(n).padStart(2, '0');
  const fmtPct = p => (p >= 0 ? '+' : '') + p.toFixed(2) + '%';
  const fmtPrice = (p, sym) => {
    if (p == null) return '—';
    const dp = sym === 'AUDUSD=X' ? 4 : (Math.abs(p) < 100 ? 2 : 2);
    return Number(p).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
  };

  // ---------- 3. Clock (top rail) -----------------------------
  const $time = document.getElementById('timeRail');
  const $date = document.getElementById('dateRail');
  function tickClock() {
    const now = new Date();
    const tz = CONFIG.location.tz;
    const t = new Intl.DateTimeFormat('en-AU', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
    const d = new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'short', day: '2-digit', month: 'short' }).format(now);
    $time.textContent = t;
    $date.textContent = d.toUpperCase().replace(/\./g, '');
  }
  tickClock();
  setInterval(tickClock, 1000 * 30);

  // ---------- 4. Markets --------------------------------------
  const $marketsBody    = document.querySelector('#marketsTable tbody');
  const $marketsUpdated = document.getElementById('marketsUpdated');
  const $stocksTrack    = document.getElementById('stocksTrack');
  let lastQuotes = {}; // symbol -> price

  function renderMarketsLoading() {
    $marketsBody.innerHTML = `<tr><td class="empty" colspan="3">CONNECTING TO MARKET FEED…</td></tr>`;
  }
  renderMarketsLoading();

  function renderMarkets(rows) {
    if (!rows.length) return;
    const html = rows.map(r => {
      const dir = (r.changePct == null) ? '' : (r.changePct >= 0 ? 'up' : 'down');
      const last = lastQuotes[r.sym];
      let flash = '';
      if (last != null && r.price != null) {
        if (r.price > last) flash = 'flash-up';
        else if (r.price < last) flash = 'flash-down';
      }
      lastQuotes[r.sym] = r.price;
      return `<tr class="${flash}">
        <td class="sym">${SYM_LABEL[r.sym] || r.sym}</td>
        <td class="price">${fmtPrice(r.price, r.sym)}</td>
        <td class="change ${dir}">${r.changePct == null ? '—' : fmtPct(r.changePct)}</td>
      </tr>`;
    }).join('');
    $marketsBody.innerHTML = html;
    // Clear flash classes after the transition
    setTimeout(() => {
      [...$marketsBody.querySelectorAll('tr')].forEach(tr => {
        tr.classList.remove('flash-up', 'flash-down');
      });
    }, 1500);
  }

  function renderTicker(rows) {
    if (!rows.length) return;
    const html = rows.map(r => {
      const dir = (r.changePct == null) ? '' : (r.changePct >= 0 ? 'up' : 'down');
      const c = r.changePct == null ? '' : fmtPct(r.changePct);
      return `<span class="ticker-item">
        <span class="ticker-symbol">${SYM_LABEL[r.sym] || r.sym}</span>
        <span class="ticker-value">${fmtPrice(r.price, r.sym)}</span>
        <span class="ticker-change ${dir}">${c}</span>
      </span><span class="ticker-sep">·</span>`;
    }).join('');
    $stocksTrack.innerHTML = html + html;
  }

  async function refreshStocks() {
    const symbols = CONFIG.stocks.join(',');
    const proxied = `/.netlify/functions/quotes?symbols=${encodeURIComponent(symbols)}`;
    try {
      const r = await fetch(proxied, { cache: 'no-store' });
      const j = await r.json();
      const result = (j?.results || []).filter(x => x && !x.error);
      // Preserve config order
      const ordered = CONFIG.stocks.map(s => result.find(x => x.sym === s)).filter(Boolean);
      if (ordered.length) {
        renderMarkets(ordered);
        renderTicker(ordered);
        const now = new Date();
        $marketsUpdated.textContent = `UPDATED ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
      }
    } catch (e) {
      warn('stocks fetch failed', e);
    }
  }
  // (refreshStocks scheduled in boot block after config loads)

  // ---------- 5. Weather --------------------------------------
  const $wTemp      = document.getElementById('weatherTemp');
  const $wCond      = document.getElementById('weatherCondition');
  const $wFeels     = document.getElementById('weatherFeels');
  const $wHigh      = document.getElementById('weatherHigh');
  const $wLow       = document.getElementById('weatherLow');
  const $wHumidity  = document.getElementById('weatherHumidity');
  const $wSunset    = document.getElementById('weatherSunset');
  const $wUV        = document.getElementById('weatherUV');
  const $wUpdated   = document.getElementById('weatherUpdated');

  function wxDescribe(code) {
    if (code == null) return '—';
    if (code === 0) return 'CLEAR';
    if ([1, 2].includes(code)) return 'PARTLY CLOUDY';
    if (code === 3) return 'OVERCAST';
    if ([45, 48].includes(code)) return 'FOG';
    if ([51, 53, 55, 56, 57].includes(code)) return 'DRIZZLE';
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'RAIN';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 'SNOW';
    if ([95, 96, 99].includes(code)) return 'STORM';
    return '—';
  }

  async function refreshWeather() {
    const { lat, lon } = CONFIG.location;
    const url = `https://api.open-meteo.com/v1/forecast`
      + `?latitude=${lat}&longitude=${lon}`
      + `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code`
      + `&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max`
      + `&timezone=auto`;
    try {
      const r = await fetch(url, { cache: 'no-store' });
      const j = await r.json();
      const c = j.current, d = j.daily;
      $wTemp.textContent = Math.round(c.temperature_2m);
      $wCond.textContent = wxDescribe(c.weather_code);
      $wFeels.textContent = Math.round(c.apparent_temperature) + '°';
      $wHigh.textContent  = Math.round(d.temperature_2m_max[0]) + '°';
      $wLow.textContent   = Math.round(d.temperature_2m_min[0]) + '°';
      $wHumidity.textContent = Math.round(c.relative_humidity_2m) + '%';
      const sunset = new Date(d.sunset[0]);
      $wSunset.textContent = pad2(sunset.getHours()) + ':' + pad2(sunset.getMinutes());
      $wUV.textContent = (d.uv_index_max[0] || 0).toFixed(0);
      const now = new Date();
      $wUpdated.textContent = `UPDATED ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    } catch (e) {
      warn('weather fetch failed', e);
    }
  }
  // (refreshWeather scheduled in boot block after config loads)

  // ---------- 6. Boot order ------------------------------------
  loadConfig().then(() => {
    refreshStocks();
    refreshWeather();
    setInterval(refreshStocks,  CONFIG.refreshIntervals.stocksMinutes  * 60 * 1000);
    setInterval(refreshWeather, CONFIG.refreshIntervals.weatherMinutes * 60 * 1000);
  });

  // ---------- 7. Harmonograph motif ----------------------------
  // Draws a damped Lissajous figure slowly over ~30s, holds, then
  // re-randomises params and starts a new figure. Pure cream lines
  // on transparent — the olive frame shows through.
  const cv  = document.getElementById('motif');
  const ctx = cv.getContext('2d', { alpha: true });
  const $seq = document.getElementById('motifSeq');
  const HG = {
    seq: 0,
    params: null,
    t: 0,
    drawing: true,
    pauseUntil: 0,
    DURATION: 95,            // seconds of slow drawing — contemplative
    HOLD: 14,                // seconds to hold at full
    DPR: Math.max(1, Math.min(window.devicePixelRatio || 1, 2)),
  };

  function resizeMotif() {
    const r = cv.getBoundingClientRect();
    cv.width  = Math.round(r.width  * HG.DPR);
    cv.height = Math.round(r.height * HG.DPR);
  }
  resizeMotif();
  window.addEventListener('resize', resizeMotif);

  function randParams() {
    const rand = (a, b) => a + Math.random() * (b - a);
    const sgn  = () => Math.random() > 0.5 ? 1 : -1;
    return {
      a1: rand(0.40, 0.48), a2: rand(0.18, 0.30),
      a3: rand(0.40, 0.48), a4: rand(0.18, 0.30),
      f1: Math.round(rand(2, 4)),
      f2: Math.round(rand(3, 7)) * sgn(),
      f3: Math.round(rand(2, 4)),
      f4: Math.round(rand(3, 7)) * sgn(),
      p1: rand(0, Math.PI * 2),
      p2: rand(0, Math.PI * 2),
      p3: rand(0, Math.PI * 2),
      p4: rand(0, Math.PI * 2),
      d1: rand(0.0030, 0.0080),
      d2: rand(0.0020, 0.0060),
      d3: rand(0.0030, 0.0080),
      d4: rand(0.0020, 0.0060),
    };
  }

  function startNewFigure() {
    HG.seq++;
    $seq.textContent = String(HG.seq).padStart(3, '0');
    HG.params = randParams();
    HG.t = 0;
    HG.drawing = true;
    ctx.clearRect(0, 0, cv.width, cv.height);
  }
  startNewFigure();

  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    const W = cv.width, H = cv.height;
    const cx = W / 2, cy = H / 2;
    const R  = Math.min(W, H) * 0.46;

    if (HG.drawing) {
      const p = HG.params;
      const stepsPerSec = 95;
      const steps = Math.round(stepsPerSec * dt);
      ctx.lineWidth = 1.0 * HG.DPR;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(229, 229, 218, 0.55)';
      ctx.beginPath();

      let prev = null;
      for (let i = 0; i < steps; i++) {
        const tt = HG.t + i * 0.018;
        // Damped harmonograph
        const damp1 = Math.exp(-p.d1 * tt * 6);
        const damp2 = Math.exp(-p.d2 * tt * 6);
        const damp3 = Math.exp(-p.d3 * tt * 6);
        const damp4 = Math.exp(-p.d4 * tt * 6);
        const x = cx + R * (p.a1 * Math.sin(p.f1 * tt + p.p1) * damp1 + p.a2 * Math.sin(p.f2 * tt + p.p2) * damp2);
        const y = cy + R * (p.a3 * Math.sin(p.f3 * tt + p.p3) * damp3 + p.a4 * Math.sin(p.f4 * tt + p.p4) * damp4);
        if (prev) {
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(x, y);
        }
        prev = { x, y };
      }
      ctx.stroke();
      HG.t += steps * 0.018;

      if (HG.t >= HG.DURATION) {
        HG.drawing = false;
        HG.pauseUntil = now + HG.HOLD * 1000;
      }
    } else if (now > HG.pauseUntil) {
      // Fade out, then redraw fresh
      ctx.fillStyle = 'rgba(92, 98, 72, 0.10)';
      ctx.fillRect(0, 0, W, H);
      // Quick fade — when nearly faded, restart
      if (Math.random() < 0.05) startNewFigure();
    } else {
      // Holding period — very subtle pulse
      ctx.fillStyle = 'rgba(92, 98, 72, 0.008)';
      ctx.fillRect(0, 0, W, H);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

})();
