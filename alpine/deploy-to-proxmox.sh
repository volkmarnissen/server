#!/bin/sh
set -eu

PROXMOX_HOST="${1:-}"
PROXMOX_CT="${2:-}"

if [ -z "$PROXMOX_HOST" ] || [ -z "$PROXMOX_CT" ]; then
  echo "Usage: $0 <proxmox-host> <container-id>"
  echo "Example: $0 pve.local 100"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$SCRIPT_DIR/repo"

# Find latest APK for system architecture
ARCH=$(uname -m)
APK_FILE=$(find "$REPO_DIR/$ARCH" -name "modbus2mqtt-*.apk" -type f | sort -V | tail -1)

if [ -z "$APK_FILE" ]; then
  echo "ERROR: No APK found for architecture $ARCH" >&2
  echo "Run package/modbus2mqtt/build.sh first" >&2
  exit 1
fi

APK_NAME=$(basename "$APK_FILE")
echo "Deploying $APK_NAME to Proxmox container $PROXMOX_CT..."

# Copy APK to Proxmox host
echo "1. Copying APK to Proxmox host..."
scp "$APK_FILE" "root@${PROXMOX_HOST}:/tmp/"

# Copy public key if available
if [ -f ~/.ssh/id_rsa.pub ]; then
  echo "2. Copying SSH public key..."
  scp ~/.ssh/id_rsa.pub "root@${PROXMOX_HOST}:/tmp/ssh_key.pub"
fi

# Install in container
echo "3. Installing in container..."
ssh "root@${PROXMOX_HOST}" << 'EOF'
  set -e
  
  # Install APK
  pct exec $PROXMOX_CT -- apk add --allow-untrusted /tmp/$APK_NAME
  
  # Copy SSH key if available
  if [ -f /tmp/ssh_key.pub ]; then
    pct exec $PROXMOX_CT -- sh -c "cat /tmp/ssh_key.pub > /root/.ssh/authorized_keys"
    pct exec $PROXMOX_CT -- chmod 600 /root/.ssh/authorized_keys
    rm /tmp/ssh_key.pub
  fi
  
  # Enable and start services
  pct exec $PROXMOX_CT -- rc-update add modbus2mqtt default
  pct exec $PROXMOX_CT -- rc-service modbus2mqtt start
  
  # Get container IP
  CT_IP=\$(pct exec $PROXMOX_CT -- hostname -i | awk '{print \$1}')
  
  echo ""
  echo "Installation complete!"
  echo "Container IP: \$CT_IP"
  echo ""
  echo "Test with:"
  echo "  curl http://\$CT_IP:3000"
  echo "  ssh root@\$CT_IP"
  
  # Cleanup
  rm /tmp/$APK_NAME
EOF
