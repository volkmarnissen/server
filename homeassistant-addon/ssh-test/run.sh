#!/usr/bin/env bash
set -euo pipefail

OPTIONS_FILE="/data/options.json"
if [ ! -f "$OPTIONS_FILE" ]; then
  echo "ERROR: Options file $OPTIONS_FILE not found" >&2
  exit 1
fi

SSH_PORT=$(jq -r '.ssh_port // empty' "$OPTIONS_FILE" || true)
USERNAME=$(jq -r '.username // empty' "$OPTIONS_FILE" || true)
USER_PUBKEY=$(jq -r '.user_pubkey // empty' "$OPTIONS_FILE" || true)

[ -n "${SSH_PORT:-}" ] || SSH_PORT=22
[ -n "${USERNAME:-}" ] || USERNAME="root"

# Determine home dir
if [ "$USERNAME" = "root" ]; then
  HOME_DIR="/root"
else
  # Create user if not exists
  if ! id "$USERNAME" >/dev/null 2>&1; then
    echo "Creating user $USERNAME"
    adduser -D -s /bin/ash "$USERNAME" || true
  fi
  HOME_DIR="/home/$USERNAME"
fi

mkdir -p "$HOME_DIR/.ssh"
chmod 700 "$HOME_DIR/.ssh"

# If no public key provided, generate one and log it
if [ -z "${USER_PUBKEY:-}" ]; then
  echo "No public key provided in options. Generating a temporary key pair for testing..."
  ssh-keygen -t ed25519 -N '' -f "$HOME_DIR/.ssh/temp_ed25519" >/dev/null
  USER_PUBKEY=$(cat "$HOME_DIR/.ssh/temp_ed25519.pub")
  echo "Generated public key (use this on your client to connect):"
  echo "$USER_PUBKEY"
fi

echo "$USER_PUBKEY" > "$HOME_DIR/.ssh/authorized_keys"
chmod 600 "$HOME_DIR/.ssh/authorized_keys"
chown -R "$USERNAME":"$USERNAME" "$HOME_DIR/.ssh" || true

# Ensure host keys exist
ssh-keygen -A >/dev/null 2>&1 || true

# Configure sshd
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
AllowUsers $USERNAME
Subsystem sftp /usr/lib/ssh/sftp-server
PrintMotd no
EOF

mkdir -p /var/run/sshd
chmod 755 /var/run/sshd

echo "Starting sshd on port $SSH_PORT for user $USERNAME"
exec /usr/sbin/sshd -D -e -f "$SSHD_CONFIG"