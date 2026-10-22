# Option E . heritage photographs

**LIVE on the wall since 22 Oct 2026 12:02 AEDT** (`kiosk-switch.sh heritage`).
`option-d` (the generative art) is untouched on disk and is the rollback:

```
ssh grace@grace-house.taile7d5a3.ts.net '~/grace-house/scripts/kiosk-switch.sh ambient'
```

Verified live after the switch: stage at 0,0 and black outside it, live clock
and weather, a change every 30s on the dot (12:02:41, 12:03:11, ...), 15
heartbeats in 5 minutes, the watchdog's grab box different on every sample,
zero watchdog log entries, CC BY licence line visible (P066 at 12:09:52).
Programme: 102 photos, 30s each, mixed order, 51 minute loop.

**13:10 AEDT, grain v2 (per frame) live by F5 reload, `?v=e3`.** v1 (once a second)
left the screen unchanged for up to 10s at a time and drew four watchdog
"frozen" strikes in the first 30 minutes (max two in a row, no restart). After
v2: 55 of 60 grabs 0.6s apart distinct, longest identical run 3. Note the old
art page, animating at 54fps, still logged 29 to 47 strikes a day, so the
NUC display itself stalls now and then; the watchdog's four-strike rule is
the right backstop for that.

Open at deploy: shared memory was 1% just after the restart. The art page
leaked about 450 MB an hour; this page's rate is not measured yet.

## What this is

Option D's page with the generative art swapped for the historic Sydney
photo programme Michael approved in the ChatGPT review on 22 Oct 2026.

- Bars: option-d layout and code, recoloured to the approved olive, cream and
  brass palette. Clock, date and weather are live, the same code as option-d.
- Hero: one photograph at a time, whole frame, original colours, blurred
  copy behind. 1.8s crossfade with the old photo kept opaque underneath.
- Year and location bottom right, photographer and licence bottom left.

The approved design is the contract: the 105 PNG mock-ups in
`~/Desktop/CLAUDE/projects/grace-house-heritage/Grace House - All photo previews/PNG previews/`.
`styles.css` is option-d's stylesheet plus the approved `preview.css` display
rules, copied verbatim.

## Rebuilding the programme

```
python3 -I ~/Desktop/CLAUDE/scripts/build-grace-heritage-screen.py --dwell 40 --order mixed
```

It reads the approved records only (never the old sourcing batches), refuses
to build if any of Michael's five removals reappears or any original photo has
changed, leaves out P020 P038 P041 (unresolved dates) unless
`--include-undated` is passed, and writes `photos/` (screen sized copies,
never enlarged, never cropped, colour profile kept) and `programme.js`.

## Two things that are not optional

1. **The heartbeat.** Same 20s `now-playing.json` beat as option-d. Without it
   `kiosk-watchdog.sh` restarts chromium every few minutes.
2. **The grain.** A still photograph looks exactly like a frozen screen to both
   freeze detectors (the NUC watchdog and the Mini's lookout). A one to two
   level grain, redrawn every second by JavaScript, keeps the picture moving.
   It is invisible on the wall. A hung page stops the grain too, so real
   freezes are still caught. A slideshow that stops advancing is caught by
   the page itself: it reloads after three missed changes.

## Cache

gh-server sends a 24 hour max-age on css, js and jpg. `index.html` is
no-store. So every asset URL carries `?v=`: bump `v=` (now e3) in `index.html` on any
css or js change. Photo URLs carry their checksum and bust themselves.

## Look at it locally

```
cd ~/Desktop/CLAUDE/projects/dad-signage/prototypes/lobby-tv && python3 -m http.server 8888
```

then open `http://127.0.0.1:8888/option-e/?dwell=7`. Test overrides:
`?dwell=7`, `?start=P012`, `?nograin`.
