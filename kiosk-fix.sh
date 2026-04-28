#!/usr/bin/env bash
# kiosk-fix.sh — switch the kiosk user from GNOME to openbox so Chromium
# truly fullscreens (GNOME shell overlays its dock on top of --kiosk
# windows even on X11; openbox is the standard digital-signage shell).
#
# Idempotent. Run once on the NUC as the kiosk user:
#   bash <(curl -fsSL https://raw.githubusercontent.com/ckhedoori-debug/dad-signage/main/kiosk-fix.sh)

set -euo pipefail

USER_NAME="$(id -un)"
if [[ "${USER_NAME}" == "root" ]]; then
  echo "[kiosk-fix] do not run as root — run as the kiosk user." >&2
  exit 1
fi

echo "[kiosk-fix] installing openbox…"
sudo apt-get update -y
sudo apt-get install -y openbox

echo "[kiosk-fix] writing openbox autostart for ${USER_NAME}…"
mkdir -p "${HOME}/.config/openbox"
cat > "${HOME}/.config/openbox/autostart" << 'EOF'
xset s off &
xset -dpms &
xset s noblank &
unclutter -idle 0.1 -root &
chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --no-first-run \
  --autoplay-policy=no-user-gesture-required \
  --overscroll-history-navigation=0 \
  --check-for-update-interval=31536000 \
  --user-data-dir=$HOME/.gh-kiosk-profile \
  http://127.0.0.1:9000/ &
EOF

echo "[kiosk-fix] setting AccountsService session → openbox…"
sudo install -d -m 0755 /var/lib/AccountsService/users
sudo tee "/var/lib/AccountsService/users/${USER_NAME}" >/dev/null <<EOF
[User]
Session=openbox
XSession=openbox
SystemAccount=false
EOF

echo "[kiosk-fix] disabling gh-kiosk.service (openbox handles Chromium directly)…"
systemctl --user disable gh-kiosk.service 2>/dev/null || true
systemctl --user stop    gh-kiosk.service 2>/dev/null || true

echo "[kiosk-fix] DONE. Reboot now to apply:"
echo "   sudo reboot"
