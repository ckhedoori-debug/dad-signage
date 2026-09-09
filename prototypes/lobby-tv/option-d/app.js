/* Grace House lobby wall . Option D
   Full width hero, minimal chrome: identity on top, time and weather below.

   HERO SOURCE. Two modes, one switch:
     mode 'art'   renders the generative piece below (no file, no licence,
                  drawn live at the panel's native size so nothing is ever
                  cropped or enlarged).
     mode 'video' plays a file instead. Set video to a path relative to this
                  folder, for example '../assets/hero.mp4'.

   The guest portal swap (the pointer polling in option-b/app.js setupHero)
   is NOT ported here. It carries security mitigations M-GV3 and friends and
   should be moved across verbatim if the portal is wanted on this layout.
   See README.md. */
var HERO = { mode: 'art', video: null };

(function () {
  'use strict';

  var W = 2436, H = 783;

  // ---------- stage fit (X8E top left capture contract) ----------
  function fit() {
    var sx = window.innerWidth / W;
    var sy = window.innerHeight / H;
    var kiosk = sx >= 1 && sy >= 1;
    var s = kiosk ? 1 : Math.min(sx, sy);
    document.documentElement.style.setProperty('--fit', s);
    document.documentElement.classList.toggle('kiosk-mode', kiosk);
  }

  // ---------- clock ----------
  // Each block exists in both bars so the layout can place it without moving
  // DOM, so every write goes to all copies.
  function setAll(sel, text) {
    var els = document.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) els[i].textContent = text;
  }

  function tick() {
    var d = new Date();
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    var day = d.toLocaleDateString('en-AU', { weekday: 'short' }).toUpperCase();
    var date = d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' }).toUpperCase();
    setAll('[data-clock]', hh + ':' + mm);
    setAll('[data-date]', day + ' . ' + date);
  }

  // ---------- weather ----------
  // Self contained ON PURPOSE. This page does NOT use ../shared/data.js.
  //
  // The version of shared/data.js committed to the repo (the one the NUC
  // actually has) does not export fetchWeatherCached or loadCached; those
  // exist only in an uncommitted local copy. Depending on them would have
  // shipped a wall with permanently blank weather. Pushing the newer data.js
  // instead would have changed option-b's data layer underneath the live
  // page, which is not a thing to do remotely. So option-d owns its weather:
  // same Open Meteo endpoint, same localStorage-cache behaviour, no shared
  // dependency, independently deployable.
  var WX_KEY = 'gh.optiond.weather.v1';
  var WX_URL = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=-33.87&longitude=151.21'
    + '&current=temperature_2m,weather_code'
    + '&daily=temperature_2m_max,temperature_2m_min,weather_code'
    + '&timezone=Australia/Sydney&forecast_days=4';

  var WMO = {
    0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Drizzle',
    56: 'Freezing drizzle', 57: 'Freezing drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
    66: 'Freezing rain', 67: 'Freezing rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
    80: 'Showers', 81: 'Showers', 82: 'Heavy showers',
    85: 'Snow showers', 86: 'Snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm'
  };
  function condition(code) { return WMO[code] || 'Sydney'; }

  function cacheGet() {
    try {
      var raw = localStorage.getItem(WX_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.data || !o.ts) return null;
      return { data: o.data, ageMs: Date.now() - o.ts };
    } catch (e) { return null; }
  }
  function cacheSet(data) {
    try { localStorage.setItem(WX_KEY, JSON.stringify({ data: data, ts: Date.now() })); }
    catch (e) { /* private mode or full: the screen still works */ }
  }

  function fetchWeather() {
    return fetch(WX_URL, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('open-meteo HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      var c = j.current || {}, d = j.daily || {};
      if (c.temperature_2m == null) throw new Error('no temp');
      var days = (d.time || []).slice(1, 4).map(function (iso, i) {
        return {
          day: new Date(iso + 'T00:00:00')
            .toLocaleDateString('en-AU', { weekday: 'short' }).toUpperCase(),
          max: Math.round(d.temperature_2m_max[i + 1]),
          min: Math.round(d.temperature_2m_min[i + 1]),
          code: d.weather_code[i + 1]
        };
      });
      return { temp: Math.round(c.temperature_2m), code: c.weather_code, days: days };
    });
  }
  function paintWeather(w, ageMs) {
    if (!w) return;

    if (w.temp != null) setAll('[data-wx-temp]', w.temp + '°');

    setAll('[data-wx-cond]', condition(w.code));

    if (Array.isArray(w.days)) {
      var days = w.days.slice(0, 3);
      var slots = document.querySelectorAll('[data-forecast]');
      for (var i = 0; i < slots.length; i++) {
        var f = slots[i];
        f.textContent = '';
        days.forEach(function (d) {
          var el = document.createElement('span');
          el.className = 'wx-day';
          var a = document.createElement('span'); a.className = 'd'; a.textContent = d.day;
          var b = document.createElement('span'); b.className = 'hi'; b.textContent = d.max + '°';
          var s = document.createElement('span'); s.className = 'lo'; s.textContent = d.min + '°';
          el.appendChild(a); el.appendChild(b); el.appendChild(s);
          f.appendChild(el);
        });
      }
    }

    // Older than an hour reads as stale rather than confidently wrong.
    var stale = ageMs != null && ageMs > 3600000;
    var wraps = document.querySelectorAll('.blk-wx');
    for (var j = 0; j < wraps.length; j++) wraps[j].classList.toggle('is-stale', stale);
  }

  // Paint the cached reading synchronously at load so the wall is never blank
  // while the first request is in flight.
  function seedWeather() {
    var c = cacheGet();
    if (c) paintWeather(c.data, c.ageMs);
  }

  function refreshWeather() {
    fetchWeather().then(function (w) {
      cacheSet(w);
      paintWeather(w, 0);
    }).catch(function (e) {
      // Network down. Whatever the cache last held stays on screen and ages
      // visibly via the stale class, rather than blanking.
      var c = cacheGet();
      if (c) paintWeather(c.data, c.ageMs);
      console.warn('[weather]', e && e.message);
    });
  }

  // ---------- liveness heartbeat ----------
  // kiosk-watchdog.sh decides the renderer is alive by counting requests for
  // now-playing.json in the gh-server journal, because a dead renderer keeps
  // the chromium process up and a "is it running" check would miss it. That
  // is option-b's portal poll. This page has no portal, so without an
  // equivalent beat the watchdog would call it dead within STALE_MIN and
  // restart chromium every few minutes forever. Same 20s cadence; the
  // response is deliberately ignored.
  function heartbeat() {
    fetch('../assets/now-playing.json?t=' + Date.now(), { cache: 'no-store' })
      .catch(function () { /* a 404 or a refusal still proves we are alive */ });
  }

  // ---------- the art ----------
  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

  var FRAG = [
    'precision highp float;',
    'uniform vec2 u_res; uniform float u_t;',

    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}',
    'float noise(vec2 p){',
    ' vec2 i=floor(p), f=fract(p);',
    // Quintic rather than cubic. Cubic leaves a kink in the second
    // derivative at every cell edge, which is what makes value noise look
    // faintly blocky and makes the motion feel like it steps. Quintic is
    // smooth through the second derivative and costs two extra multiplies.
    ' f=f*f*f*(f*(f*6.0-15.0)+10.0);',
    ' return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),',
    '            mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);',
    '}',
    'float fbm(vec2 p){',
    ' float s=0.0,a=0.5;',
    ' for(int i=0;i<4;i++){ s+=a*noise(p); p=p*2.02+vec2(17.3,9.1); a*=0.5; }',
    ' return s;',
    '}',

    // One caustic layer. Warp the domain twice, then fold the field so the
    // bright parts collapse into thin filaments the way refracted light does.
    'float caustic(vec2 p,float t,float fold){',
    ' vec2 q=vec2(fbm(p+vec2(0.0,t*0.20)), fbm(p+vec2(5.2,1.3)-t*0.16));',
    ' vec2 r=vec2(fbm(p+2.0*q+vec2(1.7,9.2)+t*0.11),',
    '             fbm(p+2.0*q+vec2(8.3,2.8)-t*0.09));',
    ' float f=fbm(p+2.4*r);',
    ' return 1.0-abs(sin(f*fold+t*0.42));',
    '}',

    'void main(){',
    ' vec2 uv=gl_FragCoord.xy/u_res;',
    ' float ar=u_res.x/u_res.y;',
    // Bias the domain horizontally so forms sit naturally in a 3.8:1 frame
    // instead of looking like a square pattern that got cropped.
    ' vec2 p=vec2(uv.x*ar*0.62,uv.y)*2.10;',
    ' float t=u_t*0.055;',

    // Two layers at different scales: a broad field of light, and a finer
    // one over it for detail. Both are caustics, so they belong together.
    ' float broad=caustic(p,t,5.5);',
    ' float fine =caustic(p*1.55+31.0,t*1.25,8.0);',

    ' float sharp=pow(broad,7.0);',      // the filament, with some body to it
    ' float glow =pow(broad,2.4)*0.50;', // bloom underneath it
    ' float spark=pow(fine,9.0)*0.35;',  // finer light over the top

    // Gentle composition drift. Enough that the wall breathes and is never
    // an even texture, but nowhere near a mask: a 3.8:1 frame with a dark
    // hole through the middle reads as a broken screen, not as restraint.
    ' float env=fbm(p*0.30+vec2(t*0.05,-t*0.035));',
    ' env=0.72+smoothstep(0.30,0.80,env)*0.42;',

    ' float lum=(sharp+glow+spark)*env;',

    ' vec3 dark  =vec3(0.026,0.027,0.033);',
    ' vec3 bronze=vec3(0.639,0.510,0.286);',
    ' vec3 cream =vec3(0.949,0.925,0.878);',

    ' vec3 col=dark;',
    ' col+=bronze*clamp(lum,0.0,1.6)*1.15;',
    ' col+=cream*pow(clamp(sharp*env,0.0,1.0),1.2)*1.00;',

    ' vec2 v=uv-0.5; v.x*=0.82;',
    ' col*=1.0-dot(v,v)*0.55;',

    // Triangular dither, not flat noise. A dark gradient across 2436 px on an
    // 8 bit panel lands on visible stair steps; breaking the quantisation with
    // a triangular distribution at just over one code value removes the banding
    // without reading as grain.
    ' float r1=hash(gl_FragCoord.xy+fract(u_t)*97.0);',
    ' float r2=hash(gl_FragCoord.xy+fract(u_t)*53.0+7.7);',
    ' col+=(r1+r2-1.0)*(1.6/255.0);',

    ' gl_FragColor=vec4(max(col,0.0),1.0);',
    '}'
  ].join('\n');

  function startArt() {
    var host = document.querySelector('.hero');
    var cv = document.getElementById('art');
    if (!host || !cv) return;

    var gl = cv.getContext('webgl', { antialias: false, alpha: false, depth: false })
          || cv.getContext('experimental-webgl');
    if (!gl) {
      // No WebGL: a still gradient beats a black rectangle.
      cv.style.background = 'radial-gradient(120% 180% at 30% 40%, #241d12 0%, #060607 70%)';
      return;
    }

    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('[art]', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }
    var vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      cv.style.background = 'radial-gradient(120% 180% at 30% 40%, #241d12 0%, #060607 70%)';
      return;
    }
    var pr = gl.createProgram();
    gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) {
      console.error('[art]', gl.getProgramInfoLog(pr));
      return;
    }
    gl.useProgram(pr);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var uRes = gl.getUniformLocation(pr, 'u_res');
    var uT = gl.getUniformLocation(pr, 'u_t');

    // Render scale. Full native is the only setting where the gradients are
    // truly clean, because the dither above survives only if it is not
    // bilinearly smeared on the way up. So start at native and step down
    // ONLY if the box cannot hold a frame rate. The N150 on site decides
    // this for itself, at runtime, rather than us guessing.
    var LADDER = [1.0, 0.75, 0.5, 0.35, 0.25];
    var step = LADDER.indexOf(parseFloat(host.getAttribute('data-render-scale')));
    if (step < 0) step = 0;
    var scale = LADDER[step];
    var bw = 0, bh = 0;

    function size() {
      // Two things decide how many pixels this canvas should actually draw.
      //
      // On the wall it is simple: --fit is 1 and the panel has no pixel
      // doubling, so this comes out at 2436 x 647, one canvas pixel per LED.
      //
      // In preview it is not. The canvas is laid out at 2436 CSS px and the
      // stage is then CSS-scaled by --fit, and a Retina screen draws every
      // remaining CSS pixel with two device pixels. At a typical window that
      // lands on ~3600 real pixels of glass being fed from a 2436 wide canvas,
      // so the preview was being enlarged by about 1.5x and looked soft in a
      // way the wall never will. Draw for the device pixels actually covered.
      var dpr = window.devicePixelRatio || 1;
      var fitv = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--fit')
      ) || 1;
      // Bounded so a freak dpr cannot ask for an absurd buffer. On the NUC
      // this evaluates to exactly 1, so the wall is unchanged.
      var cap = Math.max(0.1, Math.min(fitv * dpr, 2));

      var w = Math.max(1, Math.round(host.clientWidth * cap * scale));
      var h = Math.max(1, Math.round(host.clientHeight * cap * scale));
      if (w === bw && h === bh) return;
      bw = w; bh = h;
      cv.width = w; cv.height = h;
      gl.viewport(0, 0, w, h);
    }
    size();

    // Quality governor.
    //
    // The first version dropped a rung after a single slow four second window
    // and could never climb back. Three preview tabs sharing one GPU was
    // enough to trip it, and the picture then stayed degraded for good, which
    // reads exactly like the artwork getting worse on its own. So: require
    // several consecutive slow windows before giving up any quality, climb
    // back when the pressure lifts, and never judge at all while the tab is
    // in the background, where the browser throttles frames on purpose.
    var SLOW_FPS = 24, FAST_FPS = 45, STRIKES = 3;
    var frames = 0, since = performance.now(), settling = false;
    var slow = 0, fast = 0;

    window.__art = { fps: 0, scale: scale, step: 0 };

    function rescale(next, why, fps) {
      step = next;
      scale = LADDER[step];
      bw = bh = 0;
      size();
      settling = true;
      window.__art.scale = scale;
      window.__art.step = step;
      console.warn('[art] ' + fps.toFixed(1) + ' fps, ' + why + ' render scale ' + scale);
    }

    function loop(now) {
      // A hidden tab gets throttled to roughly 1fps by the browser. Drawing
      // into it is wasted GPU that the visible tabs need, and measuring it
      // would be measuring the throttle.
      if (document.hidden) {
        frames = 0; since = now; slow = 0; fast = 0;
        requestAnimationFrame(loop);
        return;
      }

      gl.uniform2f(uRes, bw, bh);
      gl.uniform1f(uT, now / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      frames++;
      if (now - since > 4000) {
        var fps = frames * 1000 / (now - since);
        frames = 0; since = now;

        if (settling) { settling = false; return requestAnimationFrame(loop); }

        window.__art.fps = fps;

        if (fps < SLOW_FPS) { slow++; fast = 0; }
        else if (fps > FAST_FPS) { fast++; slow = 0; }
        else { slow = 0; fast = 0; }

        if (slow >= STRIKES && step < LADDER.length - 1) {
          slow = 0;
          rescale(step + 1, 'sustained slow, dropping to', fps);
        } else if (fast >= STRIKES && step > 0) {
          fast = 0;
          rescale(step - 1, 'headroom returned, raising to', fps);
        }
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    window.addEventListener('resize', size);
  }

  function startVideo(src) {
    var cv = document.getElementById('art');
    var v = document.getElementById('heroVideo');
    if (!v) return;
    if (cv) cv.hidden = true;
    v.hidden = false;
    v.src = src;
    var p = v.play();
    if (p && p.catch) p.catch(function (e) { console.error('[hero video]', e); });
  }

  // ---------- init ----------
  function init() {
    // ?layout=a|b|c overrides the attribute, so the three word placements can
    // be compared side by side without editing anything.
    var q = (location.search.match(/[?&]layout=([abc])/i) || [])[1];
    var stage = document.querySelector('.stage');
    if (q && stage) stage.setAttribute('data-layout', q.toLowerCase());

    fit();
    window.addEventListener('resize', fit);

    tick();
    setInterval(tick, 1000);

    seedWeather();
    refreshWeather();
    setInterval(refreshWeather, 600000); // 10 min, same cadence as option-b

    heartbeat();
    setInterval(heartbeat, 20000); // 20s, the cadence kiosk-watchdog.sh expects

    if (HERO.mode === 'video' && HERO.video) startVideo(HERO.video);
    else startArt();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
