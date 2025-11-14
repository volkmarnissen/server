#!/bin/sh
set -e

# Configure SSH from options.json (if present)
OPTIONS_FILE="/data/options.json"

if [ -f "$OPTIONS_FILE" ]; then
  echo "[cont-init] Reading SSH configuration from $OPTIONS_FILE"
  
  USER_PUBKEY=$(jq -r '.user_pubkey // empty' "$OPTIONS_FILE" 2>/dev/null || true)
  
  if [ -n "${USER_PUBKEY:-}" ]; then
    echo "[cont-init] Configuring SSH public key for root"
    echo "$USER_PUBKEY" > /root/.ssh/authorized_keys
    chmod 600 /root/.ssh/authorized_keys
    chown root:root /root/.ssh/authorized_keys
    echo "[cont-init] SSH access configured for root user"
  else
    echo "[cont-init] No SSH public key provided in options.json"
  fi
else
  echo "[cont-init] No options.json found - SSH access requires manual authorized_keys configuration"
fi

exit 0
