#!/usr/bin/env bash
# bootstrap.sh — one-shot NUC install for Grace House signage.
#
# Run this ONCE on the NUC after a fresh Debian install + first login.
# Idempotent — safe to re-run if anything fails partway.
#
# This script:
#   1. Installs system packages (chromium, python3, git, cron, X tools)
#   2. Installs Tailscale and brings it up (interactive auth — you click a URL)
#   3. Configures GDM (or lightdm) to auto-login this user
#   4. Clones the dad-signage repo to ~/grace-house
#   5. Runs the project's setup.sh (installs systemd user services)
#   6. Installs an update script + cron job (pulls every 5 min, restarts kiosk on new commits)
#   7. Prints the BIOS reminder (only manual step that remains)
#
# Run as the kiosk user (NOT root):
#   bash bootstrap.sh

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/REPLACE_ME/dad-signage.git}"
INSTALL_DIR="${HOME}/grace-house"
USER_NAME="$(id -un)"

if [[ "${USER_NAME}" == "root" ]]; then
  echo "[bootstrap] do not run as root — run as the kiosk user." >&2
  exit 1
fi

log() { printf '\n[bootstrap] %s\n' "$*"; }

# --- 1. apt packages -------------------------------------------------
log "installing system packages…"
sudo apt-get update -y
sudo apt-get install -y \
  git curl ca-certificates \
  chromium python3 \
  unclutter xdotool x11-xserver-utils \
  cron

# --- 2. Tailscale ----------------------------------------------------
if ! command -v tailscale >/dev/null 2>&1; then
  log "installing Tailscale…"
  curl -fsSL https://tailscale.com/install.sh | sh
fi
sudo systemctl enable --now tailscaled

if ! tailscale status >/dev/null 2>&1; then
  log "bringing Tailscale up — open the URL it prints to authenticate."
  log "(click the link on your phone or laptop and approve this device)"
  sudo tailscale up --ssh --accept-routes
else
  log "Tailscale already up: $(tailscale status --self=true 2>/dev/null | head -1)"
fi

# --- 3. Clone the project repo --------------------------------------
log "cloning project to ${INSTALL_DIR}…"
if [[ ! -d "${INSTALL_DIR}/.git" ]]; then
  git clone "${REPO_URL}" "${INSTALL_DIR}"
else
  git -C "${INSTALL_DIR}" pull --rebase --autostash || true
fi
cd "${INSTALL_DIR}"

# --- 4. Run project setup.sh (autologin + systemd user services) ----
log "running setup.sh (autologin + systemd services)…"
chmod +x setup.sh
bash ./setup.sh

# --- 5. Update script + cron job ------------------------------------
log "installing update script + cron…"
mkdir -p "${INSTALL_DIR}/scripts"
cat > "${INSTALL_DIR}/scripts/update.sh" <<'UPDATE_EOF'
#!/usr/bin/env bash
# update.sh — pull repo; if new commits, restart the kiosk so changes show.
# Logs to /tmp/grace-house-update.log. Run by cron every 5 min.
set -uo pipefail

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${INSTALL_DIR}"

BEFORE="$(git rev-parse HEAD 2>/dev/null || echo none)"
git pull --rebase --autostash >/tmp/grace-house-update.log 2>&1 || exit 0
AFTER="$(git rev-parse HEAD 2>/dev/null || echo none)"

if [[ "${BEFORE}" != "${AFTER}" ]]; then
  echo "[$(date -Iseconds)] new commits ${BEFORE:0:7}..${AFTER:0:7} — restarting kiosk" >>/tmp/grace-house-update.log
  systemctl --user restart gh-kiosk.service >>/tmp/grace-house-update.log 2>&1 || true
fi
UPDATE_EOF
chmod +x "${INSTALL_DIR}/scripts/update.sh"

# Install cron line (idempotent — replaces any existing grace-house entry)
( crontab -l 2>/dev/null | grep -v 'grace-house update' ; \
  echo "*/5 * * * * ${INSTALL_DIR}/scripts/update.sh # grace-house update" \
) | crontab -
log "cron installed: pulls + restarts kiosk every 5 min."

# --- 6. Final message -----------------------------------------------
TS_NAME="$(tailscale status --json 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("Self",{}).get("DNSName","").rstrip(".") or "(unknown)")' 2>/dev/null || echo '(unknown)')"

cat <<EOF

=========================================================
[bootstrap] DONE.

  Project:     ${INSTALL_DIR}
  Tailscale:   ${TS_NAME}
  Kiosk URL:   http://127.0.0.1:9000/  (local)
  SSH from anywhere:
    ssh ${USER_NAME}@${TS_NAME}

  Logs:
    journalctl --user -u gh-server -f
    journalctl --user -u gh-kiosk  -f
    tail -f /tmp/grace-house-update.log

  Update flow (from your Mac):
    edit files, git push, NUC pulls within 5 min,
    kiosk auto-restarts only if commits changed.

=========================================================
LAST MANUAL STEP — at the NUC, BIOS (F2 at boot):
   Power → "Restore on AC Power Loss" → Power On
   Save & exit.
=========================================================

Reboot now to verify autologin → kiosk:
   sudo reboot

EOF
