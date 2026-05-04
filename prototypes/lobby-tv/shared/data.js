// Lobby TV  live data layer.
// Endpoints verified in real browser (Playwright/Chromium) on 2026-05-02:
//   Open-Meteo direct, CoinGecko direct, HN Firebase direct,
//   Yahoo Finance v8 chart via corsproxy.io.
// Yahoo blocks browser fetch directly (CORS); the proxy is a temporary prototype
// shim. Production should switch to an on-device Python fetcher writing JSON
// (recommendation on-books for 3 rounds).

(function (global) {
  'use strict';

  const CORS = 'https://corsproxy.io/?';

  const SYMS = {
    '^AXJO':    { yahoo: '%5EAXJO',     decimals: 1, group: true },
    '^GSPC':    { yahoo: '%5EGSPC',     decimals: 1, group: true },
    '^N225':    { yahoo: '%5EN225',     decimals: 1, group: true },
    'AUDUSD=X': { yahoo: 'AUDUSD%3DX',  decimals: 4, group: false },
    'GC=F':     { yahoo: 'GC%3DF',      decimals: 1, group: true }
  };

  // ---------- formatting ----------
  function fmtNum(v, sym) {
    if (v == null || Number.isNaN(v)) return '';
    const meta = SYMS[sym];
    if (sym === 'BTC') {
      return Math.round(v).toLocaleString('en-US');
    }
    if (!meta) return String(v);
    const n = Number(v).toFixed(meta.decimals);
    return meta.group ? Number(n).toLocaleString('en-AU', {
      minimumFractionDigits: meta.decimals, maximumFractionDigits: meta.decimals
    }) : n;
  }

  function fmtDelta(pct, mode) {
    if (pct == null || Number.isNaN(pct)) return '';
    const sign = pct >= 0;
    const abs = Math.abs(pct).toFixed(2);
    if (mode === 'arrow') return (sign ? '▲ ' : '▼ ') + abs + '%';
    return (sign ? '+' : '−') + abs + '%';
  }

  function deltaClass(pct) {
    if (pct == null || Number.isNaN(pct)) return '';
    return pct >= 0 ? 'up' : 'down';
  }

  // ---------- sparkline ----------
  // closes: array of numbers (nulls filtered upstream).
  function sparklinePoints(closes, w, h) {
    w = w || 100; h = h || 30;
    const arr = closes.filter((x) => x != null && !Number.isNaN(x));
    if (arr.length < 2) return '';
    const N = Math.min(arr.length, 24);
    const step = (arr.length - 1) / (N - 1);
    const sample = [];
    for (let i = 0; i < N; i++) sample.push(arr[Math.round(i * step)]);
    const min = Math.min.apply(null, sample);
    const max = Math.max.apply(null, sample);
    const range = (max - min) || 1;
    const pad = 2;
    return sample.map((v, i) => {
      const x = (i / (N - 1)) * w;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
  }

  // ---------- WMO weather codes ----------
  const WMO = {
    0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Rime fog',
    51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
    66: 'Freezing rain', 67: 'Heavy freezing rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
    80: 'Showers', 81: 'Heavy showers', 82: 'Violent showers',
    85: 'Snow showers', 86: 'Heavy snow showers',
    95: 'Thunderstorm', 96: 'Storm w/ hail', 99: 'Severe storm'
  };
  function condition(code) { return WMO[code] || ('Code ' + code); }

  // ---------- fetchers ----------
  async function fetchYahooSymbol(sym) {
    const meta = SYMS[sym];
    const url = CORS + 'https://query1.finance.yahoo.com/v8/finance/chart/' +
      meta.yahoo + '?interval=1h&range=5d';
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('Yahoo ' + sym + ' HTTP ' + r.status);
    const j = await r.json();
    const res = j && j.chart && j.chart.result && j.chart.result[0];
    if (!res) throw new Error('Yahoo ' + sym + ' empty');
    const m = res.meta || {};
    const price = m.regularMarketPrice != null ? m.regularMarketPrice : null;
    const prev  = m.chartPreviousClose != null ? m.chartPreviousClose
                : (m.previousClose != null ? m.previousClose : null);
    const closes = (res.indicators && res.indicators.quote &&
      res.indicators.quote[0] && res.indicators.quote[0].close) || [];
    let pct = null;
    if (price != null && prev != null && prev !== 0) {
      pct = ((price - prev) / prev) * 100;
    }
    return { sym, price, prev, pct, closes };
  }

  async function fetchMarkets() {
    const symList = Object.keys(SYMS);
    const out = {};
    const settled = await Promise.allSettled(symList.map(fetchYahooSymbol));
    settled.forEach((s, i) => {
      const sym = symList[i];
      if (s.status === 'fulfilled') out[sym] = s.value;
      else out[sym] = { sym, error: String(s.reason) };
    });
    return out;
  }

  async function fetchBTC() {
    const spot = fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true', { cache: 'no-store' }).then((r) => r.json());
    const hist = fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=2&interval=hourly', { cache: 'no-store' }).then((r) => r.json());
    try {
      const [s, h] = await Promise.all([spot, hist]);
      const price = s && s.bitcoin && s.bitcoin.usd;
      const pct = s && s.bitcoin && s.bitcoin.usd_24h_change;
      const closes = (h && h.prices ? h.prices.map((p) => p[1]) : []);
      return { sym: 'BTC', price, pct, closes };
    } catch (e) {
      return { sym: 'BTC', error: String(e) };
    }
  }

  async function fetchWeather() {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=-33.87&longitude=151.21&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=Australia/Sydney&forecast_days=4';
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('OpenMeteo HTTP ' + r.status);
    const j = await r.json();
    const c = j.current || {};
    const d = j.daily || {};
    const days = (d.time || []).slice(1, 4).map((iso, i) => {
      const dt = new Date(iso + 'T00:00:00');
      return {
        day: dt.toLocaleDateString('en-AU', { weekday: 'short' }).toUpperCase(),
        max: Math.round(d.temperature_2m_max[i + 1]),
        min: Math.round(d.temperature_2m_min[i + 1]),
        code: d.weather_code[i + 1]
      };
    });
    return {
      temp: Math.round(c.temperature_2m),
      code: c.weather_code,
      wind: Math.round(c.wind_speed_10m),
      humidity: Math.round(c.relative_humidity_2m),
      days
    };
  }

  async function fetchNews(limit) {
    limit = limit || 5;
    try {
      const ids = await (await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', { cache: 'no-store' })).json();
      const top = (ids || []).slice(0, limit * 2);
      const items = await Promise.all(top.map((id) =>
        fetch('https://hacker-news.firebaseio.com/v0/item/' + id + '.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
      ));
      const stories = items.filter((x) => x && x.title).slice(0, limit).map((x) => ({
        title: x.title,
        host: x.url ? (new URL(x.url).hostname.replace(/^www\./, '')) : 'news.ycombinator.com'
      }));
      return { source: 'HN', items: stories };
    } catch (e) {
      return { source: 'HN', items: [], error: String(e) };
    }
  }

  // ---------- DOM applicators ----------
  function applyWeather(root, wx) {
    const t = root.querySelector('[data-wx-temp]');
    if (t) t.textContent = (wx.temp != null ? wx.temp + '°' : '');
    const c = root.querySelector('[data-wx-cond]');
    if (c) {
      // option-c uses uppercase + " · SYDNEY" suffix; option-b uses Title case + Sydney
      const lab = c.classList.contains('cond') && c.closest('.weather-block') ?
        condition(wx.code).toUpperCase() :
        condition(wx.code) + ' · Sydney';
      c.textContent = lab;
    }
    const ex = root.querySelector('[data-wx-extra]');
    if (ex) ex.innerHTML = 'WIND&nbsp;' + wx.wind + '&nbsp;KM/H · HUMIDITY&nbsp;' + wx.humidity + '%';
    const fc = root.querySelector('[data-forecast]');
    if (fc) {
      const includeMin = fc.classList.contains('forecast-block');
      fc.innerHTML = wx.days.map((d) => {
        return '<span><em>' + d.day + '</em> ' +
          (includeMin ? (d.max + '° / ' + d.min + '°') : (d.max + '°')) +
          '</span>';
      }).join('');
    }
  }

  function applyMarkets(root, mkts, btc) {
    const arrowMode = (root.dataset && root.dataset.arrow !== undefined) ? 'arrow' : 'sign';

    // Hero rows
    root.querySelectorAll('[data-mkt-row]').forEach((row) => {
      const sym = row.getAttribute('data-mkt-row');
      const m = sym === 'BTC' ? btc : mkts[sym];
      const numEl = row.querySelector('[data-num]');
      const dltEl = row.querySelector('[data-dlt]');
      const sparkEl = row.querySelector('[data-spark]');
      const mode = (row.dataset.arrow !== undefined) ? 'arrow' : 'sign';
      if (!m || m.error || m.price == null) {
        if (numEl) numEl.textContent = '';
        if (dltEl) { dltEl.textContent = ''; dltEl.classList.remove('up', 'down'); }
        return;
      }
      if (numEl) numEl.textContent = fmtNum(m.price, sym);
      if (dltEl) {
        dltEl.textContent = fmtDelta(m.pct, mode);
        dltEl.classList.remove('up', 'down');
        const cls = deltaClass(m.pct);
        if (cls) dltEl.classList.add(cls);
      }
      if (sparkEl) sparkEl.setAttribute('points', sparklinePoints(m.closes, 100, 30));
    });

    // Strip cells (incl. BTC)
    root.querySelectorAll('[data-mkt-cell]').forEach((cell) => {
      const sym = cell.getAttribute('data-mkt-cell');
      const data = sym === 'BTC' ? btc : mkts[sym];
      const numEl = cell.querySelector('[data-num]');
      const dltEl = cell.querySelector('[data-dlt]');
      const mode = (cell.dataset.arrow !== undefined) ? 'arrow' : 'sign';
      if (!data || data.error || data.price == null) {
        if (numEl) numEl.textContent = '';
        if (dltEl) { dltEl.textContent = ''; dltEl.classList.remove('up', 'down'); }
        return;
      }
      if (numEl) numEl.textContent = fmtNum(data.price, sym);
      if (dltEl) {
        dltEl.textContent = fmtDelta(data.pct, mode);
        dltEl.classList.remove('up', 'down');
        const cls = deltaClass(data.pct);
        if (cls) dltEl.classList.add(cls);
      }
    });

    // Right-column list rows
    root.querySelectorAll('[data-rc-row]').forEach((row) => {
      const sym = row.getAttribute('data-rc-row');
      const data = sym === 'BTC' ? btc : mkts[sym];
      const numEl = row.querySelector('[data-num]');
      const dltEl = row.querySelector('[data-dlt]');
      const listMode = row.parentElement && row.parentElement.dataset.arrow !== undefined ? 'arrow' : 'sign';
      if (!data || data.error || data.price == null) {
        if (numEl) numEl.textContent = '';
        if (dltEl) { dltEl.textContent = ''; dltEl.classList.remove('up', 'down'); }
        return;
      }
      if (numEl) numEl.textContent = fmtNum(data.price, sym);
      if (dltEl) {
        dltEl.textContent = fmtDelta(data.pct, listMode);
        dltEl.classList.remove('up', 'down');
        const cls = deltaClass(data.pct);
        if (cls) dltEl.classList.add(cls);
      }
    });
  }

  function applyNews(root, news) {
    const ul = root.querySelector('[data-news]');
    if (!ul) return;
    const numbered = ul.dataset.numbered !== undefined;
    if (!news.items.length) {
      ul.innerHTML = '<li>' + (numbered ? '<em></em>' : '') + 'News feed unavailable</li>';
      return;
    }
    ul.innerHTML = news.items.map((it, i) => {
      const idx = String(i + 1).padStart(2, '0');
      const text = numbered ? it.title.toUpperCase() : it.title;
      return '<li>' + (numbered ? '<em>' + idx + '</em>' : '') + text + '</li>';
    }).join('');
    const head = root.querySelector('[data-news-head]');
    if (head) head.textContent = head.textContent && head.textContent === head.textContent.toUpperCase() ? 'TECH · WORLD' : 'Tech · World';
    const meta = root.querySelector('[data-news-meta]');
    if (meta) {
      const d = new Date();
      meta.textContent = 'UPDATED ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
  }

  function applyTicker(root, mkts, btc, news) {
    const t = root.querySelector('[data-ticker]');
    if (!t) return;
    const arrow = t.dataset.arrow !== undefined;
    const items = [];
    Object.keys(SYMS).forEach((sym) => {
      const m = mkts[sym];
      if (!m || m.price == null) return;
      const dlt = fmtDelta(m.pct, arrow ? 'arrow' : 'sign');
      const cls = deltaClass(m.pct);
      const lbl = sym.replace('=X', '').replace('GC=F', 'GOLD').replace('^GSPC', 'S&P 500')
        .replace('^AXJO', 'ASX 200').replace('^N225', 'NIKKEI');
      items.push('<span>' + lbl + '&nbsp;&nbsp;' + fmtNum(m.price, sym) +
        '&nbsp;&nbsp;<em class="' + cls + '">' + dlt + '</em></span>');
    });
    if (btc && btc.price != null) {
      const dlt = fmtDelta(btc.pct, arrow ? 'arrow' : 'sign');
      const cls = deltaClass(btc.pct);
      items.push('<span>BTC&nbsp;&nbsp;' + fmtNum(btc.price, 'BTC') +
        '&nbsp;&nbsp;<em class="' + cls + '">' + dlt + '</em></span>');
    }
    (news.items || []).forEach((it) => {
      const prefix = arrow ? '// ' : 'HEADLINE · ';
      items.push('<span class="hl">' + prefix + (arrow ? it.title.toUpperCase() : it.title) + '</span>');
    });
    if (!items.length) {
      t.innerHTML = '<span>Live data unavailable</span>';
      return;
    }
    // Duplicate the run for seamless scroll
    t.innerHTML = items.join('') + items.join('');
  }

  // ---------- public ----------
  global.LobbyData = {
    fetchMarkets, fetchBTC, fetchWeather, fetchNews,
    applyMarkets, applyWeather, applyNews, applyTicker,
    fmtNum, fmtDelta, sparklinePoints, condition
  };
})(window);
