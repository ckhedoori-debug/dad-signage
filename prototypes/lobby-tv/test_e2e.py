"""End-to-end pretest for the Grace lobby TV prototypes.
Loads each layout in headless Chromium, waits for live data to settle,
inspects DOM and console errors, prints per-tile pass/fail.
Run from this dir or anywhere; assumes preview server on localhost:9000.
"""
import asyncio, json, sys
from playwright.async_api import async_playwright

URLS = {
    "option-b": "http://localhost:9000/prototypes/lobby-tv/option-b/",
    "option-c": "http://localhost:9000/prototypes/lobby-tv/option-c/",
}

INSPECT_JS = r"""
async () => {
  const text = (sel, root=document) => {
    const el = root.querySelector(sel);
    return el ? (el.textContent || '').trim() : null;
  };
  const out = {};
  out.clock = text('#clock');
  out.date = text('#date');
  out.weather_temp = text('[data-wx-temp]');
  out.weather_cond = text('[data-wx-cond]');
  out.weather_extra = text('[data-wx-extra]');
  out.forecast = Array.from(document.querySelectorAll('[data-forecast] span'))
    .map(s => (s.textContent || '').trim());

  out.hero_rows = Array.from(document.querySelectorAll('[data-mkt-row]')).map(r => {
    const sym = r.getAttribute('data-mkt-row');
    const num = r.querySelector('[data-num]');
    const dlt = r.querySelector('[data-dlt]');
    const sp = r.querySelector('[data-spark]');
    return {
      sym,
      num: num ? num.textContent.trim() : null,
      dlt: dlt ? dlt.textContent.trim() : null,
      dlt_class: dlt ? dlt.className : null,
      spark_points_len: sp ? (sp.getAttribute('points') || '').length : 0
    };
  });

  out.strip_cells = Array.from(document.querySelectorAll('[data-mkt-cell]')).map(c => ({
    sym: c.getAttribute('data-mkt-cell'),
    num: text('[data-num]', c),
    dlt: text('[data-dlt]', c)
  }));

  out.right_col_rows = Array.from(document.querySelectorAll('[data-rc-row]')).map(r => ({
    sym: r.getAttribute('data-rc-row'),
    num: text('[data-num]', r),
    dlt: text('[data-dlt]', r)
  }));

  out.news = Array.from(document.querySelectorAll('[data-news] li'))
    .map(li => (li.textContent || '').trim()).slice(0, 8);

  const ticker = document.querySelector('[data-ticker]');
  out.ticker_inner_chars = ticker ? (ticker.innerHTML || '').length : 0;
  out.ticker_first_spans = ticker
    ? Array.from(ticker.querySelectorAll('span')).slice(0, 6).map(s => (s.textContent || '').trim())
    : [];

  // Embedded media still present?
  out.iframes = Array.from(document.querySelectorAll('iframe')).map(f => f.getAttribute('src'));
  out.video_present = !!document.querySelector('video');

  return out;
}
"""

def evaluate(label, dom, console_errors):
    issues = []
    def fail(msg): issues.append(msg)
    def num_real(n): return n and n != '—' and n.lower() != 'loading…'

    if not dom['clock'] or dom['clock'] == '--:--':
        fail("clock not updated")
    if not num_real(dom['weather_temp']):
        fail("weather temp empty")
    if dom['weather_cond'] in (None, '', 'Sydney', 'SYDNEY'):
        fail("weather condition not populated")
    if not dom['forecast'] or any('—' in s for s in dom['forecast']):
        fail(f"forecast not populated: {dom['forecast']}")

    expected_syms = {'^AXJO', '^GSPC', '^N225'}
    seen = {r['sym'] for r in dom['hero_rows']}
    if seen != expected_syms:
        fail(f"hero rows symbols mismatch: {seen}")
    for r in dom['hero_rows']:
        if not num_real(r['num']):
            fail(f"hero {r['sym']} no num")
        if not num_real(r['dlt']):
            fail(f"hero {r['sym']} no delta")
        if r['spark_points_len'] < 10:
            fail(f"hero {r['sym']} sparkline empty/short")

    expected_strip = {'AUDUSD=X', 'GC=F', 'BTC'}
    if {c['sym'] for c in dom['strip_cells']} != expected_strip:
        fail(f"strip cells mismatch: {[c['sym'] for c in dom['strip_cells']]}")
    for c in dom['strip_cells']:
        if not num_real(c['num']):
            fail(f"strip {c['sym']} no num")
        if not num_real(c['dlt']):
            fail(f"strip {c['sym']} no delta")

    if len(dom['right_col_rows']) < 6:
        fail(f"right-col only {len(dom['right_col_rows'])} rows")
    for r in dom['right_col_rows']:
        if not num_real(r['num']):
            fail(f"right-col {r['sym']} no num")

    if len(dom['news']) < 3 or any('Loading' in n or n.endswith('—') for n in dom['news']):
        fail(f"news not populated: {dom['news'][:2]}")

    if dom['ticker_inner_chars'] < 200:
        fail(f"ticker too short ({dom['ticker_inner_chars']} chars)")
    if not dom['ticker_first_spans'] or all('Loading' in s for s in dom['ticker_first_spans']):
        fail(f"ticker still showing loading")

    if not dom['iframes'] or not any('youtube.com/embed' in (s or '') for s in dom['iframes']):
        fail("harbour iframe missing")
    if not dom['video_present']:
        fail("hero video missing")

    real_console_errors = [e for e in console_errors if e.strip()]
    return issues, real_console_errors

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 720})
        all_issues = {}
        for label, url in URLS.items():
            page = await ctx.new_page()
            errors = []
            page.on("pageerror", lambda exc: errors.append(f"PAGEERROR: {exc}"))
            page.on("console", lambda msg: errors.append(f"{msg.type}: {msg.text}") if msg.type in ("error",) else None)
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            except Exception as e:
                print(f"[{label}] navigation failed: {e}")
                continue
            # Let fetches settle (markets+news are slowest)
            await page.wait_for_timeout(8000)
            try:
                dom = await page.evaluate(INSPECT_JS)
            except Exception as e:
                print(f"[{label}] DOM eval failed: {e}")
                continue
            issues, cons = evaluate(label, dom, errors)
            all_issues[label] = (issues, cons, dom)
            await page.close()
        await browser.close()

        print("=" * 60)
        for label, (issues, cons, dom) in all_issues.items():
            print(f"\n=== {label} ===")
            if not issues:
                print("  ALL TILES PASSED ✓")
            else:
                print(f"  {len(issues)} issue(s):")
                for i in issues:
                    print(f"    - {i}")
            if cons:
                print(f"  Console errors ({len(cons)}):")
                for c in cons[:8]:
                    print(f"    - {c}")
            print("  Snapshot:")
            print("    clock=", dom.get('clock'))
            print("    wx_temp=", dom.get('weather_temp'), "cond=", dom.get('weather_cond'))
            print("    forecast=", dom.get('forecast'))
            print("    hero_rows=", json.dumps(dom.get('hero_rows'), indent=6)[:600])
            print("    strip_cells=", json.dumps(dom.get('strip_cells')))
            print("    right_col_rows=", json.dumps(dom.get('right_col_rows')))
            print("    news[:5]=", dom.get('news', [])[:5])
            print("    ticker_first_spans=", dom.get('ticker_first_spans'))

        any_fail = any(issues for issues, *_ in all_issues.values())
        sys.exit(1 if any_fail else 0)

asyncio.run(main())
