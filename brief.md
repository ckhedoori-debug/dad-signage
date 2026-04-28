# Dad's Building Signage Screen — Build Brief

This is a paste-ready brief for a separate chat. Goal: build a single self-contained HTML dashboard that runs in fullscreen browser kiosk mode on a mini PC, displaying a beautiful video/photo background with live data overlays. The hardware is being purchased separately. This brief covers everything the build chat needs to know.

---

## Project Summary

A long, thin HDMI screen lives in one of my dad's commercial buildings in Sydney. It needs to display **gorgeous content twenty-four hours a day, seven days a week**, with live information overlaid. Think of it less as "digital signage" and more as a **piece of installed media art that happens to also inform passersby**. Brand-aligned, slow-paced, considered. Nothing about this should feel corporate, cluttered, or like a typical office TV.

Background plays beautiful cinematic video or photography on loop. Overlay panels show current time, weather, world news, stock prices. Data refreshes silently in place without ever interrupting the visual flow. Runs forever. Reboots itself if power blinks. Drop a new MP4 into a folder and it cycles into the rotation.

---

## Hardware (already specified, do not redesign)

- **Mini PC**: ASUS NUC 14 Essential (Intel N150 chip, barebones) + 16GB DDR5 SODIMM RAM + 500GB M.2 NVMe SSD. Bought from Umart Sydney.
- **OS**: To be installed fresh. Recommend Debian 12 stable (lighter, no nag, free) but Windows 11 IoT or Pro is acceptable if it makes the build simpler. Build chat to advise.
- **Browser for kiosk**: Chromium in fullscreen kiosk mode, autostart on boot.
- **Display connection**: Direct HDMI cable from mini PC to screen.
- **Network**: WiFi at the building (assume reliable but plan for graceful offline degradation).
- **Power**: Mini PC must auto-power-on after blackout, browser must auto-relaunch if it crashes.

The build chat does **not** need to spec hardware. Treat it as a fixed Linux box with a browser and an internet connection.

---

## Display Constraints

**Native pixel resolution: 2436 × 783** (confirmed).

Aspect ratio: roughly **3.11:1** — long landscape strip. Treat this as the locked target. Build the layout against these exact dimensions.

**Still build the layout driven by a CSS variable for `--screen-width` and `--screen-height`** (set to 2436 and 783) so future changes are trivial, but you don't need to ship multiple resolution variants. One layout, tuned for 2436 × 783.

Layout implication: this is wider than 16:9 by a long way, but not extreme. There's enough vertical room (783px) to actually compose properly — you can split the canvas into a generous video region plus side or footer zones for the data panels without things feeling cramped. Treat it more like "ultrawide cinema" than "stock ticker bar."

---

## What Goes On Screen

### Background layer (always visible, fills 100% of canvas)
- Looping video (MP4 / MOV / WEBM) **OR** static photograph that crossfades to the next image every N seconds.
- Content lives in a local folder. The page picks up everything in the folder and cycles through it.
- Drop a new file into the folder and it joins the rotation without restarting the browser.
- Audio is muted always.
- Video loops cleanly with no visible cut.
- Crossfade between items is slow and cinematic (recommend 2 to 4 second fades).

### Overlay panels (sit on top of background, semi-transparent or framed)

The exact layout depends on the screen's final aspect ratio, but the panels needed are:

1. **Time + Date** — large, elegant typography, updates every second.
2. **Weather** — current temperature, condition, location (Sydney). Icon plus text. Updates every 10 minutes.
3. **News headlines** — rotating ticker or panel showing 3 to 5 current headlines from a reputable source. Updates every 15 minutes.
4. **Stock prices** — small ticker showing ASX 200, S&P 500, AUD/USD, gold, Bitcoin (configurable list). Updates every 5 minutes.

**Aesthetic priority order:** the visual content (video/photo) is the hero. Data panels are subtle, restrained, never overpower the imagery. Think of them like the lower-thirds of a high-end documentary, not like a Bloomberg terminal.

---

## Aesthetic Direction

The screen is being installed in a **commercial building in Sydney**. Whose brand it represents is **TBC** (could be the building itself, could be Michael Khedoori's KHEDOORI brand, could be neutral). The build chat should produce something that looks **considered, expensive, restrained** by default, with the colour palette and typography exposed as easy-to-edit CSS variables so the look can shift without rewriting the layout.

**Default palette to start with:**
- Background tint / overlay scrim: deep near-black `#0A0A0A` (KHEDOORI VOID)
- Primary accent: muted bronze `#A77B45`
- Text and data colour: warm cream `#F5EFE2`

**Default typography:**
- Headings, time, large readouts: **Cormorant Garamond** (serif, elegant)
- Data, tickers, small text: **Barlow** (sans-serif, clean)

Both available free from Google Fonts. Self-host the font files in the project folder so the page works offline.

**Things to avoid:**
- Generic "digital signage" widget aesthetics (sharp boxes, gradients, weather emoji)
- Heavy drop shadows
- Animated UI elements that distract from the background imagery
- Anything that screams "made with a template"

---

## Technical Architecture

A single HTML file with linked CSS and JS files. No backend. No database. No build tools. No npm. **Pure static front-end** that Chromium serves locally.

### File structure
```
/dad-signage/
  index.html
  styles.css
  app.js
  assets/
    fonts/
      cormorant-garamond.woff2
      barlow.woff2
    media/                ← drop video/photo files here, page auto-cycles them
      sample-1.mp4
      sample-2.jpg
  config.json             ← editable config: stocks list, location, refresh intervals, API keys
```

### config.json shape (editable without touching code)
```json
{
  "location": { "city": "Sydney", "lat": -33.87, "lon": 151.21 },
  "stocks": ["^AXJO", "^GSPC", "AUDUSD=X", "GC=F", "BTC-USD"],
  "newsSource": "abc-news-au",
  "refreshIntervals": {
    "weatherMinutes": 10,
    "newsMinutes": 15,
    "stocksMinutes": 5
  },
  "mediaFolder": "assets/media",
  "crossfadeSeconds": 3
}
```

### APIs to use (all free tier or open)
- **Weather**: [Open-Meteo](https://open-meteo.com/) — free, no API key required, generous limits. Preferred over OpenWeatherMap because no key management.
- **News**: RSS feed from a reputable source (ABC News AU, BBC World, Reuters). Parse client-side using `rss2json` or a CORS-friendly proxy. If RSS proves painful from a static page, fall back to NewsAPI.org free tier (limited to 100 calls per day, easily within budget at 15-minute refresh).
- **Stocks**: Yahoo Finance unofficial JSON endpoint, or [Stooq](https://stooq.com/), or a free tier of Finnhub / Twelvedata. Pick whichever is easiest to call directly from the browser without CORS pain.

### Offline tolerance (mandatory)
- If a fetch fails, panel shows the last successful value plus a tiny grey "last updated HH:MM" caption.
- Never show error messages, broken icons, or "loading…" spinners on screen. Anything visible to a passerby must look intentional.
- If WiFi is down for hours, the video background keeps playing as if nothing happened.

### Auto-cycling media folder
- On page load, JS reads the contents of `assets/media/` (using a directory listing endpoint or a generated `manifest.json` rebuilt by a tiny watcher script).
- Plays each file fullscreen in turn, crossfading between them.
- Recommended approach: small Python or Node watcher running on the mini PC regenerates `manifest.json` whenever the folder contents change. The HTML re-reads the manifest every few minutes so new content appears without a restart.

### Auto-launch on boot (mini PC side, separate from HTML)
- systemd unit (Linux) or Task Scheduler entry (Windows) that:
  - Boots the OS
  - Auto-logs into a kiosk user
  - Launches Chromium with flags: `--kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --autoplay-policy=no-user-gesture-required --start-fullscreen`
  - Points it at the local `index.html`
  - Restarts Chromium if it crashes
- Build chat can include this as a separate `setup.sh` or `setup.ps1` script in the project folder.

---

## Things NOT to Build

- No login, auth, user accounts.
- No CMS, no admin UI. Editing is done by changing `config.json` or dropping files in the media folder.
- No analytics, tracking, telemetry.
- No "tap to interact" — the screen is non-touch and unattended.
- No multi-page navigation. One page, runs forever.
- No external dependencies on cloud platforms (no Vercel, no Netlify hosting). Everything runs from the mini PC's local filesystem.

---

## Deliverables I Want From the Build Chat

1. **`index.html`** — the main page, layout-complete and rendering with placeholder data.
2. **`styles.css`** — CSS variables at the top for screen dimensions, colour palette, font choices.
3. **`app.js`** — all data fetching, rotation logic, error handling, auto-refresh.
4. **`config.json`** — editable settings as specified above.
5. **`assets/media/`** — empty folder with two or three sample files (placeholder MP4 and JPG) so the rotation can be tested immediately.
6. **`assets/fonts/`** — self-hosted font files so the page works offline.
7. **`manifest.json`** generator — tiny Python script that watches the media folder and rewrites the manifest file whenever contents change.
8. **`setup.sh`** (Debian) and/or **`setup.ps1`** (Windows) — one-shot installer that puts Chromium into kiosk mode pointed at the local HTML, sets the system to auto-login and auto-launch, and configures auto-power-on.
9. **`README.md`** — short operating manual: how to drop new content in, how to change the stocks list, how to update the refresh intervals, how to recover if something goes wrong.

The whole thing should be a single zipped folder I can copy to the mini PC and run.

---

## Open Decisions Still to Resolve (will answer before final build)

1. **Exact screen resolution** — I will measure and provide. Until then, build for 3840 × 600 with CSS variables.
2. **Whose brand the design represents** — building's own identity, or KHEDOORI brand (cinematic + restrained), or neutral commercial. Default to neutral commercial with the VOID/BRONZE/CREAM palette and Cormorant + Barlow typography unless I confirm otherwise.
3. **Stocks the dad cares about** — placeholder list provided. Will refine based on what he actually watches.
4. **News source preference** — ABC News AU is my default, will confirm.

The build can proceed on placeholders for all four. None of these block the structural work.

---

## How to Treat This Brief

Read it once. Ask me clarifying questions only if a structural choice is genuinely blocked. Otherwise build version one against the placeholders and ship it. I'd rather iterate on a working file than over-spec it before any code exists.
