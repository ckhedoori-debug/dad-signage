# Option D . full width hero, minimal chrome

Built 9 Sep 2026. **Not deployed. Nothing pushed.** option-b is still the live
page and is untouched.

## What this is

The Grace House wall simplified to three bands:

```
2436 x 783 stage
├─  68 px   GRACE HOUSE            279 CLARENCE STREET
├─ 647 px   [ hero, full width, edge to edge ]
└─  68 px   12:51  WED . 09 SEPT        17° PARTLY CLOUDY | THU FRI SAT
```

The hero is generative art rendered live in WebGL, not a video file. It draws
at the panel's own size, so nothing is ever cropped or enlarged, there is no
footage to licence, and there is no file to keep on the box.

## What it replaces, and how that worked

`option-b/` is the page that has been live since May 2026. Keep it. It is the
fallback and the record. Its layout was:

```
2436 x 783 stage
├─  48 px   header: clock, date, Sydney temp, 3 day forecast
├─ 687 px   grid: 590 px markets column | 1256 px hero video | 590 px right column
│             left:  ASX 200 / S&P 500 / Nikkei, then AUD-USD / Gold / BTC, with sparklines
│             mid:   crossfading hero video (heroA / heroB, 3.33s opacity dissolve)
│             right: ASX Top 10 list, then ABC News headlines
└─  48 px   ticker: markets plus BBC World headlines, scrolling
```

Data cadences in option-b: clock 1s, markets 60s, weather 10min, AU news 10min,
global news 10min, freshness label re-render 30s. All feeds cache to
localStorage under the `lobbytv.v1.` prefix, so a dropped connection shows the
last known values rather than blank cells. The "UPD HH:MM" and "M AGO" labels
track the **oldest** feed, so one dead source visibly ages the whole label.

The hero video in option-b was `../assets/hero.mp4`: 1920x1080, 24fps, 900s,
395MB, and its content is a tricking competition. That footage being wrong for
a commercial lobby is the reason this layout exists.

## What is deliberately NOT carried over

- **Markets, stocks, news, ticker.** Removed by request. The data layer that
  fed them (`../shared/data.js`) is untouched and still exports
  `fetchMarkets`, `fetchNews`, `fetchNewsGlobal`, `applyTicker` and the rest,
  so any of it can come back without rewriting anything.
- **The guest portal video swap.** option-b's `setupHero()` polls
  `../assets/now-playing.json` and swaps in an uploaded file. It carries the
  security mitigations from the video upload threat model (M-GV3 defensive
  pointer parse, a strict filename regex, auto revert on decode error or
  stall). It is **not** ported here. If the portal is wanted on this layout,
  move that function across verbatim rather than rewriting it.

## Hero: art or video

One switch at the top of `app.js`:

```js
var HERO = { mode: 'art', video: null };              // generative (default)
var HERO = { mode: 'video', video: '../assets/x.mp4' }; // play a file instead
```

Video mode fills the full 2436 x 647 hero with `object-fit: cover`. Note that
a 16:9 source loses about 40% of its frame height to reach that shape, so it
wants a 4K master. A 1080p source will be enlarged and will look soft.

## Performance

The box on site is an Intel N150 with integrated graphics. It was assumed this
would need the art drawn at half resolution and scaled up. **That assumption
was wrong and has been measured**: the N150 holds 54fps at full native
2436 x 647, so the page ships at `data-render-scale="1"` on
`main.hero` in `index.html`. Numbers and method are in "Measured on the NUC"
below; the safety net is in "Quality governor".

Full native matters for more than sharpness. The dither that keeps the dark
gradients from banding only survives if it is not smeared on the way up, so
drawing at half resolution and scaling would quietly bring the banding back.

## Geometry contract

Unchanged from option-b and non negotiable. The Colorlight X8E captures only
the top left 2436 x 783 of the HDMI input. The NUC outputs 2560 x 1080. The
stage is anchored top left at exactly 2436 x 783 with no centring and no
scale to fit transform when the viewport is large enough
(`html.kiosk-mode`). Everything outside that rectangle stays black. See
`feedback_grace_house_x8e_top_left_capture` in memory.

## Look at it

```
cd ~/Desktop/CLAUDE/projects/dad-signage/prototypes/lobby-tv && python3 -m http.server 8888
```

then open `http://127.0.0.1:8888/option-d/`. Below 2436 x 783 the stage scales
down to fit so it is previewable on a laptop; at or above it, kiosk mode
engages and the geometry contract applies.

## When it goes live (not yet done)

`scripts/kiosk-switch.sh` currently knows two targets, `lobby` (option-b) and
`holding` (the Netlify page). It has **not** been edited. Going live means
adding an `ambient` case pointing at
`http://127.0.0.1:9000/prototypes/lobby-tv/option-d/`, committing, pushing,
letting the NUC's 5 minute cron pull, then running the switch. All of that is
Michael's call and none of it has happened.

---

## Word placement (added 9 Sep 2026)

Three arrangements of the same content, switched by `data-layout` on the
stage or `?layout=a|b|c` in the URL. Every block exists in both bars and CSS
decides which bar shows it, so a placement change never moves DOM and the
clock and weather never need rewiring.

- **A . Corners** (chosen, and the default). Name and address on top, time
  and weather below. Four anchored corners.
- **B . Crown.** Name alone and centred, like a plaque. Address, time and
  weather share one line underneath.
- **C . Ledger.** Name and time on top the way a building board reads,
  address and weather underneath.

## Measured on the NUC, 9 Sep 2026

The production shader was extracted from `app.js` and run on the NUC's own
GPU (`ANGLE / Intel Vulkan 1.4.305, Intel Graphics ADL-N`), **while the live
kiosk was still running and competing for the same GPU**, so these are worst
case.

| render scale | pixels | fps |
|---|---|---|
| 1.0 (native) | 2436 x 647 | **54** |
| 0.75 | 1827 x 485 | 92 |
| 0.5 | 1218 x 324 | 184 |
| 0.35 | 853 x 226 | 344 |

Target is 30. Full native has about 80 percent headroom, so the page ships at
`data-render-scale="1"` and the governor below should never fire on this box.

Method note: Chromium headless only reaches the real GPU with
`--use-gl=angle --use-angle=vulkan`. Plain `--use-gl=egl` and the default
both fail to create a WebGL context. Do NOT benchmark with
`--virtual-time-budget`, which fast forwards `performance.now()` and reports
nonsense (it claimed 1.7 million fps). Time a synchronous draw loop and force
completion with a 1x1 `readPixels`.

## Quality governor

`app.js` samples frame rate every 4 seconds while the tab is visible.

- Three consecutive windows under 24fps steps the render scale down one rung
  (1.0, 0.75, 0.5, 0.35, 0.25).
- Three consecutive windows over 45fps steps it back up.
- A hidden tab is never measured and never drawn, because browsers throttle
  background frames on purpose and drawing there steals GPU from the wall.

The first version dropped a rung after a single slow window and could never
recover. Three preview tabs on one laptop was enough to trip it, and the
picture then stayed permanently degraded, which looks exactly like the
artwork getting worse by itself. Hysteresis plus recovery is the fix.

## Canvas sizing and Retina previews

The canvas is laid out at 2436 CSS px and the stage is then CSS-scaled by
`--fit`. On a Retina laptop each remaining CSS pixel becomes two device
pixels, so a typical preview window puts about 3600 real pixels of glass in
front of a 2436 wide canvas: a 1.5x enlargement that reads as soft or
pixelated. `size()` now multiplies by `--fit` times `devicePixelRatio`
(bounded to 2) so the buffer matches the glass exactly.

On the NUC `--fit` is 1 and `devicePixelRatio` is 1, so this evaluates to 1
and the wall renders at exactly 2436 x 647 as before. The benchmark above
still holds.
