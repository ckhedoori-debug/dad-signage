#!/bin/bash
# Live kiosk URL switch for Grace House.
# usage: kiosk-switch.sh <lobby|ambient|heritage|holding>
#   heritage = option-e, historic Sydney photographs (added 22 Oct 2026)
#   ambient  = option-d, generative art (live 9 Sep to 22 Oct 2026, the rollback)
#
# Updates ~/.config/openbox/autostart for reboot persistence, kills the
# current Chromium, and launches a fresh Chromium fully detached (setsid +
# nohup) so it survives the SSH session disconnecting mid-flight.

set -u

target="${1:-}"
case "$target" in
  lobby)
    URL="http://127.0.0.1:9000/prototypes/lobby-tv/option-b/"
    ;;
  ambient)
    URL="http://127.0.0.1:9000/prototypes/lobby-tv/option-d/"
    ;;
  heritage)
    URL="http://127.0.0.1:9000/prototypes/lobby-tv/option-e/"
    ;;
  holding)
    URL="https://grace-house-signage.netlify.app/"
    ;;
  *)
    echo "usage: $0 <lobby|ambient|heritage|holding>"
    exit 1
    ;;
esac

ts() { date '+%H:%M:%S'; }
echo "[$(ts)] target=$target url=$URL"

AUTOSTART="$HOME/.config/openbox/autostart"
TEMPLATE="$HOME/.config/openbox/autostart.template"

# First run: persist a templated autostart that uses %URL% as a placeholder
# so subsequent runs do not have to do brittle inline URL surgery.
if [ ! -f "$TEMPLATE" ]; then
  cp "$AUTOSTART" "$TEMPLATE"
  # Replace whatever the active URL currently is with the placeholder so
  # the template is reusable. We tolerate either of the two known URLs.
  sed -i \
    -e 's|http://127\.0\.0\.1:9000/prototypes/lobby-tv/option-b/|%URL%|g' \
    -e 's|https://grace-house-signage\.netlify\.app/|%URL%|g' \
    -e 's|http://127\.0\.0\.1:9000/prototypes/lobby-tv/option-d/|%URL%|g' \
    -e 's|http://127\.0\.0\.1:9000/prototypes/lobby-tv/option-e/|%URL%|g' \
    "$TEMPLATE"
  echo "[$(ts)] seeded template at $TEMPLATE"
fi

# Render the template with the chosen URL.
sed "s|%URL%|$URL|g" "$TEMPLATE" > "$AUTOSTART.new" && mv "$AUTOSTART.new" "$AUTOSTART"
echo "[$(ts)] autostart updated"

# Kill any running Chromium kiosk instance.
pkill -f "chromium.*kiosk" 2>/dev/null || true
sleep 2

# Stale Singleton locks block a fresh launch when the prior Chromium was
# pkill -ed instead of cleanly exited.
rm -f "$HOME/.gh-kiosk-profile/SingletonLock" \
      "$HOME/.gh-kiosk-profile/SingletonCookie" \
      "$HOME/.gh-kiosk-profile/SingletonSocket" 2>/dev/null

# Launch new Chromium fully detached so it survives the parent shell.
setsid nohup env DISPLAY=:0 chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --no-first-run \
  --autoplay-policy=no-user-gesture-required \
  --overscroll-history-navigation=0 \
  --check-for-update-interval=31536000 \
  --user-data-dir="$HOME/.gh-kiosk-profile" \
  "$URL" </dev/null >/tmp/chromium-kiosk.log 2>&1 &
disown -a 2>/dev/null || true

sleep 3
new_pid="$(pgrep -f "chromium.*kiosk" | head -1)"
if [ -n "$new_pid" ]; then
  echo "[$(ts)] chromium pid=$new_pid url=$URL"
  exit 0
else
  echo "[$(ts)] FAILED to launch chromium" >&2
  tail -10 /tmp/chromium-kiosk.log >&2
  exit 1
fi
