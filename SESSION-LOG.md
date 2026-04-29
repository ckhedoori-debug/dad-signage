# Grace House Signage — Build Session Log

**Sessions:** 2026-04-27 → 2026-04-29 (across multiple Claude Code conversations).
**Outcome:** Working 24/7 kiosk display installed-ready, GitHub repo live, Tailscale remote access configured, live-update pipeline proven end-to-end.

This document is a self-contained handover so a fresh Claude session (or human collaborator) can pick up exactly where we left off.

---

## What this is

A long-thin HDMI display intended for **Grace House, 279 Clarence St, Sydney** (Michael's father's commercial building). Runs 24/7 in fullscreen browser-kiosk mode on a small Linux PC. Shows a quiet, brand-aligned dashboard with live data:

- Top-left: animated harmonograph (oscillating Lissajous figure, redraws every ~30s)
- Centre: live ASX 200, S&P 500, NASDAQ, AUD/USD, gold, BTC table (with row flash on price change)
- Right: detailed Sydney weather (current temp + condition + feels/high/low/humidity/sunset/UV)
- Bottom: continuous scrolling ticker with same markets data
- Top rail: building identity, date, clock

Aesthetic: olive/forest/cream Grace House palette, Cormorant Garamond + Archivo + IBM Plex Mono. Treat it like a piece of installed media art that informs passersby — not Bloomberg, not corporate signage.

---

## Hardware (purchased and installed)

| Component | Spec | Source |
|---|---|---|
| Mini PC | ASUS NUC 14 Essential (Intel N150 barebones) | Scorptec Silverwater |
| RAM | Crucial 16GB DDR5 SODIMM 5600MHz (CT16G56C46S5) | Scorptec |
| SSD | Crucial P310 500GB M.2 NVMe PCIe 4.0 (CT500P310SSD8) | Scorptec |
| Display | Long-strip HDMI panel — **2436 × 783** native (3.11:1) | Existing at building |
| Network | Wired Ethernet (during install + permanent) | Building |

Total ~$620–730 AUD.

---

## OS + Stack

- **Debian 13.4.0 (Trixie)** — netinst USB flashed via `dd` from macOS
- **GNOME desktop** installed (accidentally — should have been LXDE, accepted Enter on installer's default)
- **gdm3** as display manager → autologin → `openbox` session (NOT GNOME — that's a critical fix, see below)
- **Chromium** in `--kiosk` mode launched by openbox autostart
- **Python `http.server`** on `127.0.0.1:9000` serving the static dashboard
- **Tailscale** for SSH from anywhere (`grace@grace-house.taile7d5a3.ts.net`)
- **cron** for `git pull` every 5 min + auto-reload Chromium when new commits land
- **cron** for daily 4am reboot (clears Chromium memory leaks)

User on the NUC: `grace`. Hostname: `grace-house`.

---

## Architecture (live update flow)

```
┌───────────────────┐     git push     ┌──────────────────────┐
│ Mac (Michael)     │ ───────────────▶ │ GitHub (public repo) │
│ ~/Desktop/CLAUDE/ │                  │ ckhedoori-debug/     │
│  projects/        │                  │  dad-signage         │
│  dad-signage/     │                  └──────────┬───────────┘
└───────────────────┘                             │
                                                  │ git pull
                                                  │ (cron */5 min)
                                                  ▼
                              ┌────────────────────────────────────┐
                              │ NUC at Grace House                 │
                              │ ────────────────────────────────── │
                              │ openbox autostart → Chromium       │
                              │   --kiosk http://127.0.0.1:9000/   │
                              │                                    │
                              │ python3 -m http.server 9000        │
                              │   (gh-server systemd user service) │
                              │                                    │
                              │ cron: pull → if new commits,       │
                              │   xdotool F5 → page reloads        │
                              └────────────────────────────────────┘

SSH from anywhere via Tailscale:
  ssh grace@grace-house.taile7d5a3.ts.net
```

---

## GitHub repo

**Public:** https://github.com/ckhedoori-debug/dad-signage

Contents:
- `index.html` / `styles.css` / `app.js` — the v2 dashboard (data-forward, no video background)
- `config.json` — editable runtime config (location, stocks list, refresh intervals)
- `setup.sh` — installs systemd user services + autologin (called by bootstrap.sh)
- `bootstrap.sh` — one-shot NUC installer (idempotent)
- `kiosk-fix.sh` — switches kiosk session from GNOME → openbox (true fullscreen)
- `brief.md` — original project spec
- `archive/v1/` — earlier video-background version (preserved, not active)
- `archive/alternates/` — three parallel-chat variants (atelier, folio, plinth) — preserved, not active

`.gitignore` excludes parallel-chat litter that the second chat keeps creating at root: `atelier/`, `folio/`, `plinth/`, `menu.html`, `netlify/`, `netlify.toml`. Those exist on local disk but never go to the repo.

---

## NUC bootstrap one-liner (pasted at the NUC after Debian install)

```
sudo apt update && sudo apt install -y curl && curl -fsSL https://raw.githubusercontent.com/ckhedoori-debug/dad-signage/main/bootstrap.sh | bash
```

bootstrap.sh in turn:
1. apt installs chromium, python3, git, unclutter, xdotool, x11-xserver-utils, cron
2. Installs Tailscale + brings it up (interactive auth — opens a browser URL the user clicks)
3. Configures gdm3 autologin to user `grace`
4. Clones the repo to `~/grace-house`
5. Runs `setup.sh` (systemd services for the local web server + the now-disabled gh-kiosk service)
6. Installs `~/grace-house/scripts/update.sh` + cron line `*/5 * * * *` for auto-pull-and-reload
7. Prints Tailscale hostname + BIOS reminder

Then a separate one-liner to switch from GNOME to openbox session (because GNOME shell overlays its dock on top of Chromium kiosk):

```
bash <(curl -fsSL https://raw.githubusercontent.com/ckhedoori-debug/dad-signage/main/kiosk-fix.sh)
```

Then `sudo reboot`. The NUC comes up clean: autologin → openbox → Chromium fullscreen, no shell, no dock.

---

## Decisions locked in

| Decision | Rationale | Alternative rejected |
|---|---|---|
| **v2 layout (data-forward)** is canonical | Picked over v1 cinematic-bg version and a hybrid merge | v1 (closer to brief but Michael moved past it) |
| **Public GitHub repo** | No secrets in code; simplifies bootstrap (no deploy keys) | Private (rejected mid-session) |
| **Tailscale + GitHub + cron-pull** stack | Solves remote-fix + remote-content-update + secure | Syncthing-only (no version control); GitHub-only (no SSH); manual USB updates |
| **Debian 13.4.0** (current stable) | Original plan said Debian 12 but it's now oldstable | Debian 12; Windows 11 IoT |
| **openbox session, not GNOME** | GNOME shell overlays dock on top of Chromium kiosk even on X11 | Stick with GNOME and try to hide dock via gsettings |
| **GDM autologin via /etc/gdm3/daemon.conf** | GNOME got installed by accident; gdm3 is its DM | lightdm (was the original plan when LXDE was the target) |
| **Hardware = ASUS NUC 14 + Crucial 16GB + P310 500GB** | Verified in stock at Scorptec Silverwater; barebones cheaper than prebuilt | Beelink S13 (out of stock on Amazon AU); Umart equivalent |
| **2436 × 783** screen target | Michael measured | Earlier placeholders (3840×600, 1920×360) |
| **No video background (in v2)** | Layout deliberately data-forward | v1 had cinematic loop (still in archive) |

---

## What works right now

- Bootstrap completes end-to-end on a fresh Debian install
- Autologin → openbox → Chromium fullscreen (no dock, no shell visible)
- Live update pipeline proven: `git push` → cron pulls within 5 min → Chromium auto-F5s → page reloads with new content
- Tailscale SSH works from Michael's Mac to the NUC (`ssh grace@grace-house.taile7d5a3.ts.net`)
- Daily 4am reboot scheduled in cron
- Weather panel populates correctly (Open-Meteo direct API, no key)

## What doesn't work yet (open follow-ups)

1. **Markets data not displaying.** The Yahoo Finance proxy via `allorigins.win` appears rate-limited or unstable. The harmonograph + weather + ticker frame all render, but markets values stay as `—`. Fix options for next session:
   - Swap to Stooq (CORS-friendly direct API)
   - Self-host a CORS proxy
   - Use a different free quote API (Twelve Data, Finnhub free tier)
2. **BIOS "Restore on AC Power Loss"** — Michael was at the Power tab but never confirmed he set it. Without it, a power blip leaves the screen dark until the power button is pressed. Quick fix: reboot, F2, Power tab, find "Restore AC Power Loss" / "After AC Power Failure" / "State After G3" → set Power On.
3. **Auto-update mechanism is patched in-place, not in repo.** When kiosk-fix.sh disabled gh-kiosk service, the cron's update.sh still tried to `systemctl --user restart gh-kiosk.service` (no-op). Fixed via in-place sed on the NUC: `sed -i "s|systemctl --user restart gh-kiosk.service|DISPLAY=:0 xdotool key F5|" ~/grace-house/scripts/update.sh`. This patch lives only on the NUC. Next session should commit a corrected `scripts/update.sh` to the repo so future bootstraps are clean.
4. **gh-kiosk.service unit file** was deleted from the NUC because `systemctl --user mask` failed (file in the way). Repo's setup.sh still installs it. Next session should remove the gh-kiosk unit-file generation from setup.sh (only gh-server is needed; openbox autostart handles Chromium).
5. **Daily reboot cron line wiped the bootstrap-installed update cron line** when Michael added it. The recovery command (issued mid-session) restored both. Next session should make sure cron-line-add commands always preserve existing entries.
6. **Parallel chat is/was writing variants** at the project root: `atelier/`, `folio/`, `plinth/`, `menu.html`, `netlify/`, `netlify.toml`. Currently `.gitignore`d so they don't push, but they keep being recreated. Was the second chat doing parallel design exploration. May or may not still be active — current session never closed that loop.

---

## Standing directives that emerged from these sessions

1. **Always verify hardware stock before recommending a SKU.** Live fetch / search before naming any product. Multiple recommendations early on (Beelink S13 Amazon AU, original Scorptec NUC list) wasted time being out of stock.
2. **Never run `gh auth login` autonomously.** Auth is the user's action — Claude installs the binary, hands off the auth step, resumes after confirmation.
3. **Pause and surface when parallel chats are writing into the same folder.** Detected mid-session when three variant folders appeared at root timestamped after Claude's edits. Plowing forward would have destroyed the parallel chat's work.
4. **For sudo + dd commands**, hand them to Michael verbatim — Bash tool can't satisfy macOS's sudo prompt.
5. **Use `.gitignore`, not `mv`,** to handle parallel-chat litter when racing the other chat is impractical.

---

## File map (project folder)

```
/Users/khedoori/Desktop/CLAUDE/projects/dad-signage/
├── .git/                              # local git repo (synced to GitHub)
├── .gitignore                         # excludes parallel-chat litter
├── .claude/handovers/                 # session handover entries (3 files)
├── README.md                          # original v1-flavoured (needs rewrite for v2)
├── SESSION-LOG.md                     # this document
├── brief.md                           # original project spec
├── index.html                         # v2 dashboard markup
├── styles.css                         # v2 styles + Grace House design tokens
├── app.js                             # v2 runtime (markets/weather/ticker/harmonograph + config loader)
├── config.json                        # runtime-editable config
├── setup.sh                           # systemd user services + DM autologin
├── bootstrap.sh                       # one-shot NUC installer
├── kiosk-fix.sh                       # GNOME → openbox session swap
├── archive/
│   ├── v1/                            # original cinematic-bg version + watcher
│   └── alternates/
│       ├── atelier/                   # parallel-chat variant 1
│       ├── folio/                     # parallel-chat variant 2
│       └── plinth/                    # parallel-chat variant 3
└── (parallel-chat litter ignored by git: atelier/ folio/ plinth/ menu.html netlify/ netlify.toml)
```

---

## Critical access info

- **GitHub repo (public):** https://github.com/ckhedoori-debug/dad-signage
- **GitHub account used:** `ckhedoori-debug` (the dev/Netlify identity, not personal)
- **NUC SSH (via Tailscale):** `ssh grace@grace-house.taile7d5a3.ts.net`
- **NUC user:** `grace` (password set during install — Michael has it)
- **Tailscale identity:** `ckhedoori@gmail.com` (Google login). Mac mini and Mac are also on this tailnet.
- **Local kiosk URL on NUC:** http://127.0.0.1:9000/
- **Edit-and-publish flow:** edit files in `/Users/khedoori/Desktop/CLAUDE/projects/dad-signage/`, `git push`, NUC pulls within 5 min, screen auto-reloads.
- **Manual force-reload:** `ssh grace@grace-house.taile7d5a3.ts.net 'DISPLAY=:0 xdotool key F5'`
- **Tail update log:** `ssh grace@grace-house.taile7d5a3.ts.net 'tail -20 /tmp/grace-house-update.log'`
- **Status of services:** `ssh grace@grace-house.taile7d5a3.ts.net 'systemctl --user status gh-server'`

---

## For the next session

The kiosk is functional and installed-ready. Michael can install at Grace House any time. Highest-leverage next moves, in order:

1. **Fix markets data** (allorigins.win replacement — try Stooq first, no proxy needed).
2. **Confirm BIOS auto-power-on** is set, or have Michael set it next time he's near the NUC.
3. **Commit a corrected `scripts/update.sh`** to the repo (xdotool F5 instead of restarting the disabled gh-kiosk service) so future bootstraps don't need the in-place patch.
4. **Remove gh-kiosk.service generation from setup.sh** (it's redundant under the openbox session).
5. **Rewrite README.md** to reflect the v2 reality and the bootstrap one-liner.
6. **Deal with the parallel chat** — either let Michael close it, or formally document those alternate layouts as named variants the dashboard could rotate between.
