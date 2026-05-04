# Lobby TV — Layout Prototypes

Six-zone 24/7 kiosk layouts for the Grace House lobby TV (different physical
screen from the long-strip LED — same repo for convenience).

**Status:** layout-only, mock data everywhere. No real APIs. Desktop preview
only this round; not deployed to the wall.

## Canvas

- Stage: **2436 × 783** anchored top-left of a 2560 × 1080 output (same X8E
  contract as the long-strip wall — see `feedback_grace_house_x8e_top_left_capture`).
- In a desktop browser the stage is **scaled to fit the viewport** so you can
  see the whole layout without horizontal scroll. On the wall the scale
  resolves to 1.0 with the stage anchored at 0,0.

## Zones (shared by both options)

- Top header strip — time, weather, 3-day forecast
- Left column — two 16:9 sports tiles stacked, looping mp4 stand-ins
- Centre hero — looping mp4 (swatch-nines-frame-04.mov)
- Right column — markets panel on top, AU news headlines below
- Bottom footer — left→right ticker (markets + headlines mix)

Right column matches left column width (mirrored footprint). Middle takes
whatever is left.

## Options

- `option-b/` — "Cinematic hero" · Cormorant Garamond + IBM Plex Mono · olive/forest/cream Grace House DNA · 48px header & footer
- `option-c/` — "Strip-honest" · Archivo + IBM Plex Mono · cool-dark / cyan accent · 60px header & footer · transit-board feel

## Preview

Open either `option-b/index.html` or `option-c/index.html` directly in a
browser. The wrapper detects viewport size and scales the 2436×783 stage to
fit. Resize the window — it re-fits.

## Assets

`assets/hero.mov` is the swatch-nines clip, copied locally and gitignored
(34 MB, public repo). The HTML references it via `../assets/hero.mov`.
