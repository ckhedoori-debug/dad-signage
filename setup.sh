#!/usr/bin/env bash
# setup.sh — Debian 12 kiosk install for Grace House signage.
#
# Configures the current user to:
#   1. Auto-login at boot (via lightdm if present)
#   2. Serve the project folder over http://127.0.0.1:9000
#   3. Launch Chromium in --kiosk pointed at that URL
#   4. Disable screen blanking, hide the cursor
#   5. Auto-restart server + browser on crash
#
# Re-runnable. Run as the kiosk user (NOT root).
#
# Final step you must do AT THE NUC:
#   In BIOS (F2 at boot) → Power → "Restore on AC Power Loss" → Power On.
#   This is the only thing setup.sh cannot do.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USER_NAME="$(id -un)"
SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"
PORT=9000

if [[ "${USER_NAME}" == "root" ]]; then
  echo "[setup] do not run as root — run as the kiosk user." >&2
  exit 1
fi

echo "[setup] project dir: ${PROJECT_DIR}"
echo "[setup] user:        ${USER_NAME}"
echo "[setup] kiosk URL:   http://127.0.0.1:${PORT}/"

# --- 1. Packages -----------------------------------------------------
echo "[setup] installing packages…"
sudo apt-get update -y
sudo apt-get install -y \
  chromium \
  python3 \
  unclutter \
  xdotool \
  x11-xserver-utils

CHROMIUM_BIN="$(command -v chromium 2>/dev/null || command -v chromium-browser 2>/dev/null || true)"
if [[ -z "${CHROMIUM_BIN}" ]]; then
  echo "[setup] FATAL: chromium not on PATH after install" >&2
  exit 1
fi

# --- 2. lightdm autologin (best-effort) ------------------------------
# If lightdm is the active display manager, configure autologin to this
# user. If not present, skip with a warning — the user can configure
# their own DM autologin.
if [[ -d /etc/gdm3 ]]; then
  echo "[setup] configuring gdm3 autologin → ${USER_NAME}"
  GDM_CONF=/etc/gdm3/daemon.conf
  # Strip any existing autologin block, then append a clean one
  sudo python3 -c "
import re, sys
p='${GDM_CONF}'
try: t=open(p).read()
except FileNotFoundError: t=''
t=re.sub(r'(?ms)^\[daemon\].*?(?=^\[|\Z)', '', t).strip()
t = (t + '\n\n' if t else '') + '[daemon]\nAutomaticLoginEnable=true\nAutomaticLogin=${USER_NAME}\n'
open(p,'w').write(t)
"
elif [[ -d /etc/lightdm ]]; then
  echo "[setup] configuring lightdm autologin → ${USER_NAME}"
  sudo install -d -m 0755 /etc/lightdm/lightdm.conf.d
  SESSION_NAME="$(ls /usr/share/xsessions/*.desktop 2>/dev/null | head -1 | xargs -n1 basename 2>/dev/null | sed 's/\.desktop$//')"
  sudo tee /etc/lightdm/lightdm.conf.d/50-grace-house-autologin.conf >/dev/null <<EOF
[Seat:*]
autologin-user=${USER_NAME}
autologin-user-timeout=0
user-session=${SESSION_NAME:-openbox}
EOF
  sudo getent group autologin >/dev/null 2>&1 || sudo groupadd -r autologin
  sudo usermod -aG autologin "${USER_NAME}" || true
else
  echo "[setup] WARNING: neither gdm3 nor lightdm found — configure your DM autologin manually." >&2
fi

# --- 3. systemd user services dir ------------------------------------
mkdir -p "${SYSTEMD_USER_DIR}"

# --- 4. Local HTTP server unit ---------------------------------------
cat > "${SYSTEMD_USER_DIR}/gh-server.service" <<EOF
[Unit]
Description=Grace House signage — local static server
After=network-online.target

[Service]
Type=simple
WorkingDirectory=${PROJECT_DIR}
ExecStart=/usr/bin/python3 -m http.server ${PORT} --bind 127.0.0.1
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

# --- 5. Chromium kiosk unit ------------------------------------------
# Note: depends on a running X session (DISPLAY=:0). The autologin
# configured above is what brings that up at boot.
cat > "${SYSTEMD_USER_DIR}/gh-kiosk.service" <<EOF
[Unit]
Description=Grace House signage — Chromium kiosk
After=gh-server.service graphical-session.target
Requires=gh-server.service
PartOf=graphical-session.target

[Service]
Type=simple
Environment=DISPLAY=:0
ExecStartPre=/bin/sh -c '/usr/bin/xset s off; /usr/bin/xset -dpms; /usr/bin/xset s noblank'
ExecStartPre=/bin/sh -c '/usr/bin/unclutter -idle 0.1 -root &'
ExecStartPre=/bin/sleep 4
ExecStart=${CHROMIUM_BIN} \\
  --kiosk \\
  --noerrdialogs \\
  --disable-infobars \\
  --disable-session-crashed-bubble \\
  --disable-features=TranslateUI \\
  --no-first-run \\
  --autoplay-policy=no-user-gesture-required \\
  --start-fullscreen \\
  --overscroll-history-navigation=0 \\
  --check-for-update-interval=31536000 \\
  --user-data-dir=${HOME}/.gh-kiosk-profile \\
  http://127.0.0.1:${PORT}/
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

# --- 6. Enable + start ----------------------------------------------
# Lingering keeps user services running across reboots without needing
# an interactive login session.
sudo loginctl enable-linger "${USER_NAME}" || true

systemctl --user daemon-reload
systemctl --user enable gh-server.service gh-kiosk.service
systemctl --user restart gh-server.service
# gh-kiosk needs an X session — only restart if DISPLAY is up
if [[ -n "${DISPLAY:-}" ]] && command -v xset >/dev/null 2>&1 && xset q >/dev/null 2>&1; then
  systemctl --user restart gh-kiosk.service
else
  echo "[setup] no X session active — kiosk will start on next graphical login (auto)."
fi

# --- 7. Done ---------------------------------------------------------
cat <<EOF

[setup] DONE.

   Server: http://127.0.0.1:${PORT}/
   Logs:
     journalctl --user -u gh-server -f
     journalctl --user -u gh-kiosk  -f

   FINAL MANUAL STEP — at the NUC, BIOS (F2 at boot):
     Power → "Restore on AC Power Loss" → Power On
     Save & exit. After this, a power blip auto-recovers everything.

   Reboot now to verify the autologin → kiosk chain end-to-end:
     sudo reboot

EOF
