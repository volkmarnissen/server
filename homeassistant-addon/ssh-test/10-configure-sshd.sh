#!/usr/bin/env bash
set -euo pipefail

# This script runs as root during the container init phase (s6 cont-init.d)
# It prepares users, SSH keys and sshd_config based on /data/options.json

OPTIONS_FILE="/data/options.json"
if [ ! -f "$OPTIONS_FILE" ]; then
  echo "[cont-init] ERROR: Options file $OPTIONS_FILE not found" >&2
  exit 1
fi

SSH_PORT=$(jq -r '.ssh_port // empty' "$OPTIONS_FILE" || true)
USER_PUBKEY=$(jq -r '.user_pubkey // empty' "$OPTIONS_FILE" || true)

[ -n "${SSH_PORT:-}" ] || SSH_PORT=22

# Always configure SSH for root user
HOME_DIR="/root"
mkdir -p "$HOME_DIR/.ssh"
chmod 700 "$HOME_DIR/.ssh"

# If no public key provided, log warning and exit
if [ -z "${USER_PUBKEY:-}" ]; then
  echo "[cont-init] WARNING: No public key provided in options. SSH access will not be configured."
  echo "[cont-init] Please set 'user_pubkey' option to enable SSH access."
  exit 0
fi

echo "$USER_PUBKEY" > "$HOME_DIR/.ssh/authorized_keys"
chmod 600 "$HOME_DIR/.ssh/authorized_keys"
chown -R root:root "$HOME_DIR/.ssh" || true

# Ensure host keys exist
ssh-keygen -A >/dev/null 2>&1 || true

# Write sshd_config
SSHD_CONFIG="/etc/ssh/sshd_config"
cat > "$SSHD_CONFIG" <<EOF
Port $SSH_PORT
Protocol 2
HostKey /etc/ssh/ssh_host_rsa_key
HostKey /etc/ssh/ssh_host_ed25519_key
PermitRootLogin prohibit-password
PasswordAuthentication no
ChallengeResponseAuthentication no
UsePAM no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
AllowUsers root
Subsystem sftp /usr/lib/ssh/sftp-server
PrintMotd no
EOF

mkdir -p /var/run/sshd
chmod 755 /var/run/sshd

echo "[cont-init] sshd configured for root user on port $SSH_PORT"
