# Grace House signage

A long-thin HDMI kiosk display for 279 Clarence St. Branded as Grace House: olive / forest / cream palette, condensed serif logo, mono uppercase rails. Plays cinematic background loop with quiet data overlays for time, weather, news, and markets.

Target screen: **2436 × 783** (aspect 3.11:1).

## Quick local preview (Mac)

```bash
cd /Users/khedoori/Desktop/CLAUDE/projects/dad-signage
python3 -m http.server 9000
open "http://localhost:9000/"
```

The page auto-scales to your viewport while preserving the 2436×783 design aspect, so you can preview at any browser size.

## File map

```
dad-signage/
  index.html          # markup
  styles.css          # all visual rules (palette + type + layout vars)
  app.js              # runtime: clock, media rotation, weather, news, stocks
  config.json         # runtime config (stocks, news source, intervals)
  manifest.json       # list of media files (auto-regenerated)
  assets/
    media/            # drop new mp4 / mov / webm / jpg / png here
    fonts/            # offline font self-host (see "Self-hosted fonts")
  scripts/
    watch-media.py    # rebuilds manifest.json when media folder changes
  setup.sh            # Debian / Linux kiosk install (systemd user units)
```

## Editing

- **Add background content:** drop any `.mp4 .mov .webm .jpg .png .webp` into `assets/media/`. The watcher rewrites `manifest.json`. The page picks it up within ~5 minutes (or refresh).
- **Change stocks list:** edit `config.json` → `stocks` (Yahoo Finance symbols).
- **Change news source:** edit `config.json` → `newsSource` (any RSS feed URL).
- **Change refresh cadences:** edit `config.json` → `refreshIntervals`.
- **Retarget screen size:** edit the two `--screen-width` / `--screen-height` vars at the top of `styles.css`. The whole layout reshapes to the new aspect.

## Brand source

Palette and typography are sampled from the Grace House Tenancy Fitout Guide at `/Users/khedoori/Desktop/Property/REAL ESTATE/Grace House/Marketing (website Stuff)/6974_Grace House _Tenancy Fitout Guide_FA.pdf`.

| Token | Value | Use |
|---|---|---|
| `--gh-olive` | `#5C6248` | primary brand background tint |
| `--gh-forest` | `#131C12` | deepest type / scrim |
| `--gh-cream` | `#E5E5DA` | primary text |
| `--gh-cream-dim` | rgba cream 62% | rail labels |
| `--gh-cream-faint` | rgba cream 32% | meta labels, tickers |

| Slot | Family | Use |
|---|---|---|
| `--font-serif` | Cormorant Garamond | time display, monogram |
| `--font-display` | Archivo Black | news headlines |
| `--font-mono` | IBM Plex Mono | rails, labels, ticker |
| `--font-body` | Inter | fallback body |

## Self-hosted fonts (offline robustness)

Currently `index.html` imports the four families from Google Fonts. Once online for the first time, Chromium caches them, so brief outages are fine. For a full offline guarantee, run:

```bash
# (optional) download woff2 files into assets/fonts/ and swap the @import
# for local @font-face rules. Drop instructions here once locked.
```

## Hardware target

- ASUS NUC 14 Essential (N150), 16GB RAM, 500GB NVMe.
- Debian 12 stable.
- HDMI direct to the Grace House strip.
- Chromium in `--kiosk` mode pointed at `http://localhost:9000/`.

## Boot setup (Debian)

```bash
cd /opt/dad-signage   # wherever you place the project on the mini PC
chmod +x setup.sh scripts/watch-media.py
./setup.sh
```

This installs three user-systemd units:

- `gh-server`  — `python3 -m http.server 9000` from the project dir
- `gh-watcher` — manifest regenerator
- `gh-kiosk`   — Chromium fullscreen at the local URL

All three auto-restart on crash, and `loginctl enable-linger` lets them start at boot without a login.

Logs:

```bash
journalctl --user -u gh-kiosk -f
```

## Recovery

- **Screen black:** `systemctl --user restart gh-kiosk`
- **No data showing:** check internet, then `systemctl --user restart gh-server`
- **New videos not appearing:** check the watcher: `systemctl --user status gh-watcher`
- **Total reset:** reboot the mini PC; everything autostarts.

## Things this is not

No login, no admin UI, no cloud, no analytics, no touch interactions. One page, runs forever.
