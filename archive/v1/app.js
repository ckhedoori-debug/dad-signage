/* ============================================================
   Grace House Signage — runtime
   Single-file static front-end. No build step.
   ============================================================ */

(() => {
  'use strict';

  const log = (...a) => console.log('[gh]', ...a);
  const warn = (...a) => console.warn('[gh]', ...a);

  // ---------- 1. Stage scaling ---------------------------------
  // The .stage is sized in CSS px to --screen-width × --screen-height.
  // We scale it to fit the viewport while preserving aspect ratio.
  const stage = document.getElementById('stage');
  function scaleStage() {
    const cs = getComputedStyle(document.documentElement);
    const sw = parseFloat(cs.getPropertyValue('--screen-width'));
    const sh = parseFloat(cs.getPropertyValue('--screen-height'));
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scale = Math.min(vw / sw, vh / sh);
    stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }
  window.addEventListener('resize', scaleStage);
  scaleStage();

  // ---------- 2. Config load -----------------------------------
  const DEFAULT_CONFIG = {
    location: { city: 'Sydney', lat: -33.87, lon: 151.21, tz: 'Australia/Sydney' },
    stocks: ['^AXJO', '^GSPC', 'AUDUSD=X', 'GC=F', 'BTC-USD'],
    newsSource: 'https://www.abc.net.au/news/feed/45910/rss.xml',
    refreshIntervals: { weatherMinutes: 10, newsMinutes: 15, stocksMinutes: 5, manifestMinutes: 5 },
    mediaFolder: 'assets/media',
    crossfadeSeconds: 3,
    newsRotateSeconds: 12,
  };

  let CONFIG = { ...DEFAULT_CONFIG };

  async function loadConfig() {
    try {
      const r = await fetch('config.json', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        CONFIG = { ...DEFAULT_CONFIG, ...j, refreshIntervals: { ...DEFAULT_CONFIG.refreshIntervals, ...(j.refreshIntervals || {}) } };
        log('config loaded', CONFIG);
      }
    } catch (e) {
      warn('config load failed, using defaults', e);
    }
  }

  // ---------- 3. Time + Date -----------------------------------
  const $time    = document.getElementById('timeDisplay');
  const $seconds = document.getElementById('timeSeconds');
  const $dateLong = document.getElementById('dateLong');

  function pad2(n) { return String(n).padStart(2, '0'); }

  function tickClock() {
    const now = new Date();
    const opts = { timeZone: CONFIG.location.tz || 'Australia/Sydney', hour12: false };
    const parts = new Intl.DateTimeFormat('en-AU', { ...opts, hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(now);
    const get = t => parts.find(p => p.type === t)?.value || '00';
    const hh = get('hour');
    const mm = get('minute');
    const ss = get('second');
    $time.textContent = `${hh}:${mm}`;
    $seconds.textContent = ss;

    const dateFmt = new Intl.DateTimeFormat('en-AU', { ...opts, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $dateLong.textContent = dateFmt.format(now).toUpperCase();
  }
  setInterval(tickClock, 1000);
  tickClock();

  // ---------- 4. Media rotation --------------------------------
  // manifest.json: { items: ["assets/media/file.mp4", ...] }
  const $vA = document.getElementById('mediaA');
  const $vB = document.getElementById('mediaB');
  const $iA = document.getElementById('mediaImgA');
  const $iB = document.getElementById('mediaImgB');
  const slots = [
    { video: $vA, image: $iA, active: true },
    { video: $vB, image: $iB, active: false },
  ];
  let slotIdx = 0;
  let mediaItems = [];
  let mediaPos = 0;

  const isVideo = path => /\.(mp4|mov|webm|m4v)$/i.test(path);

  function setSlotActive(slot, on) {
    [slot.video, slot.image].forEach(el => el.classList.toggle('active', on && el.dataset.live === '1'));
  }

  function loadInto(slot, src) {
    // hide previous live element in this slot
    [slot.video, slot.image].forEach(el => { el.dataset.live = '0'; el.classList.remove('active'); });
    if (isVideo(src)) {
      slot.video.src = src;
      slot.video.load();
      slot.video.dataset.live = '1';
      slot.video.play().catch(() => {});
      return slot.video;
    } else {
      slot.image.src = src;
      slot.image.dataset.live = '1';
      return slot.image;
    }
  }

  function nextMedia() {
    if (mediaItems.length === 0) return;
    const incoming = slots[1 - slotIdx];
    const outgoing = slots[slotIdx];
    const src = mediaItems[mediaPos % mediaItems.length];
    loadInto(incoming, src);
    requestAnimationFrame(() => {
      const liveEl = isVideo(src) ? incoming.video : incoming.image;
      liveEl.classList.add('active');
      // fade out outgoing after transition
      setTimeout(() => {
        [outgoing.video, outgoing.image].forEach(el => el.classList.remove('active'));
        if (outgoing.video.dataset.live === '1') outgoing.video.pause();
      }, (CONFIG.crossfadeSeconds || 2.5) * 1000);
    });
    slotIdx = 1 - slotIdx;
    mediaPos++;

    // Schedule next swap. For videos, swap on 'ended'. For images, fixed dwell.
    const liveEl = isVideo(src) ? incoming.video : incoming.image;
    if (isVideo(src)) {
      // Single-item playlist: never swap, just loop.
      if (mediaItems.length === 1) {
        liveEl.loop = true;
      } else {
        liveEl.loop = false;
        liveEl.onended = () => nextMedia();
      }
    } else {
      const dwellMs = 18000; // 18s per still
      setTimeout(nextMedia, dwellMs);
    }
  }

  async function loadManifest() {
    try {
      const r = await fetch('manifest.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('manifest http ' + r.status);
      const j = await r.json();
      const items = (j.items || []).filter(s => typeof s === 'string' && s.length);
      const same = items.length === mediaItems.length && items.every((v, i) => v === mediaItems[i]);
      if (!same) {
        const wasEmpty = mediaItems.length === 0;
        mediaItems = items;
        log('manifest', items.length, 'items');
        if (wasEmpty && items.length) {
          mediaPos = 0;
          nextMedia();
        }
      }
    } catch (e) {
      warn('manifest load failed', e);
    }
  }

  loadManifest();
  setInterval(loadManifest, (CONFIG.refreshIntervals.manifestMinutes || 5) * 60 * 1000);

  // ---------- 5. Weather (Open-Meteo, no key) ------------------
  const $weatherTag = document.getElementById('weatherTag');
  const wxState = { last: null, lastTs: null };

  function wxIcon(code) {
    if (code == null) return '';
    if (code === 0) return 'CLEAR';
    if ([1, 2].includes(code)) return 'PARTLY CLOUDY';
    if (code === 3) return 'OVERCAST';
    if ([45, 48].includes(code)) return 'FOG';
    if ([51, 53, 55, 56, 57].includes(code)) return 'DRIZZLE';
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'RAIN';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 'SNOW';
    if ([95, 96, 99].includes(code)) return 'STORM';
    return '';
  }

  async function refreshWeather() {
    const { lat, lon } = CONFIG.location;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;
    try {
      const r = await fetch(url, { cache: 'no-store' });
      const j = await r.json();
      const t = Math.round(j.current.temperature_2m);
      const desc = wxIcon(j.current.weather_code);
      wxState.last = `${t}° · ${desc}`;
      wxState.lastTs = Date.now();
    } catch (e) {
      warn('weather fetch failed', e);
    }
    paintWeather();
  }
  function paintWeather() {
    if (wxState.last) {
      $weatherTag.textContent = wxState.last;
      $weatherTag.classList.toggle('is-stale', wxState.lastTs && (Date.now() - wxState.lastTs > 60 * 60 * 1000));
    }
  }
  refreshWeather();
  setInterval(refreshWeather, (CONFIG.refreshIntervals.weatherMinutes || 10) * 60 * 1000);

  // ---------- 6. News (RSS via AllOrigins proxy) ---------------
  const $newsFeed   = document.getElementById('newsFeed');
  const $newsUpdated = document.getElementById('newsUpdated');
  const newsState = { items: [], idx: 0, lastTs: null };

  async function refreshNews() {
    const feed = CONFIG.newsSource;
    if (!feed) return;
    const proxied = `https://api.allorigins.win/raw?url=${encodeURIComponent(feed)}`;
    try {
      const r = await fetch(proxied, { cache: 'no-store' });
      const xml = await r.text();
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      const items = Array.from(doc.querySelectorAll('item title'))
        .map(el => (el.textContent || '').trim())
        .filter(Boolean)
        .slice(0, 8);
      if (items.length) {
        newsState.items = items;
        newsState.lastTs = Date.now();
        renderNewsUpdated();
      }
    } catch (e) {
      warn('news fetch failed', e);
    }
  }
  function renderNewsUpdated() {
    if (!newsState.lastTs) return;
    const d = new Date(newsState.lastTs);
    const hh = pad2(d.getHours()), mm = pad2(d.getMinutes());
    $newsUpdated.textContent = `UPDATED ${hh}:${mm}`;
  }
  function rotateNews() {
    if (newsState.items.length === 0) return;
    const text = newsState.items[newsState.idx % newsState.items.length];
    // Build a new item, fade in over current
    const old = $newsFeed.querySelector('.news-item.active');
    const next = document.createElement('div');
    next.className = 'news-item';
    next.textContent = text;
    $newsFeed.appendChild(next);
    requestAnimationFrame(() => next.classList.add('active'));
    if (old) {
      old.classList.remove('active');
      setTimeout(() => old.remove(), 1100);
    }
    newsState.idx++;
  }
  refreshNews();
  setInterval(refreshNews, (CONFIG.refreshIntervals.newsMinutes || 15) * 60 * 1000);
  setInterval(rotateNews, (CONFIG.newsRotateSeconds || 12) * 1000);
  // Try to first-paint a headline as soon as data arrives
  const newsBoot = setInterval(() => { if (newsState.items.length) { rotateNews(); clearInterval(newsBoot); } }, 800);

  // ---------- 7. Stocks (Yahoo Finance via AllOrigins proxy) ---
  const $stocksTrack = document.getElementById('stocksTrack');
  const stocksState = { rows: [], lastTs: null };

  function fmtChange(pct) {
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(2)}%`;
  }
  function prettySymbol(sym) {
    const map = {
      '^AXJO':    'ASX 200',
      '^GSPC':    'S&P 500',
      'AUDUSD=X': 'AUD/USD',
      'GC=F':     'GOLD',
      'BTC-USD':  'BTC/USD',
      '^IXIC':    'NASDAQ',
      '^DJI':     'DOW',
      'CL=F':     'OIL',
    };
    return map[sym] || sym;
  }

  async function refreshStocks() {
    const symbols = (CONFIG.stocks || []).join(',');
    if (!symbols) return;
    const yUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
    const proxied = `https://api.allorigins.win/raw?url=${encodeURIComponent(yUrl)}`;
    try {
      const r = await fetch(proxied, { cache: 'no-store' });
      const j = await r.json();
      const result = j?.quoteResponse?.result || [];
      if (result.length) {
        stocksState.rows = result.map(q => ({
          sym: q.symbol,
          price: q.regularMarketPrice,
          changePct: q.regularMarketChangePercent,
          ccy: q.currency,
        }));
        stocksState.lastTs = Date.now();
        renderStocks();
      }
    } catch (e) {
      warn('stocks fetch failed', e);
    }
  }
  function renderStocks() {
    if (!stocksState.rows.length) return;
    const html = stocksState.rows.map(r => {
      const v = (r.price != null) ? Number(r.price).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—';
      const c = (r.changePct != null) ? fmtChange(r.changePct) : '';
      const dir = r.changePct >= 0 ? 'up' : 'down';
      return `<span class="ticker-item">
                <span class="ticker-symbol">${prettySymbol(r.sym)}</span>
                <span class="ticker-value">${v}</span>
                <span class="ticker-change ${dir}">${c}</span>
              </span><span class="ticker-sep">·</span>`;
    }).join('');
    // Duplicate the content so the keyframe can scroll seamlessly
    $stocksTrack.innerHTML = html + html;
  }
  refreshStocks();
  setInterval(refreshStocks, (CONFIG.refreshIntervals.stocksMinutes || 5) * 60 * 1000);

  // ---------- 8. Boot order ------------------------------------
  loadConfig().then(() => {
    // Re-fire fetchers with possibly-updated config
    refreshWeather();
    refreshNews();
    refreshStocks();
    loadManifest();
  });

})();
