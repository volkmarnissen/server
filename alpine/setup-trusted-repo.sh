#!/bin/sh
# Setup Alpine repository for trusted installation
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$SCRIPT_DIR/repo"

if [ ! -d "$REPO_DIR" ]; then
  echo "ERROR: Repository directory not found: $REPO_DIR" >&2
  echo "Run package/modbus2mqtt/package.sh first" >&2
  exit 1
fi

# The repository is already signed by abuild during package creation
# We just need to make the public key available

echo "Alpine Repository Setup"
echo "======================"
echo ""
echo "Repository location: $REPO_DIR"
echo ""

# Find public key
PUBKEY=$(find "$REPO_DIR" -name "*.pub" | head -1)
if [ -n "$PUBKEY" ]; then
  PUBKEY_NAME=$(basename "$PUBKEY")
  echo "Public signing key: $PUBKEY_NAME"
  echo ""
  echo "For trusted installation, users need to:"
  echo "1. Download the public key:"
  echo "   wget https://github.com/modbus2mqtt/server/releases/download/vX.X.X/$PUBKEY_NAME -P /etc/apk/keys/"
  echo ""
  echo "2. Add repository (if hosting via HTTP):"
  echo "   echo 'http://your-server:8080/\$(uname -m)' >> /etc/apk/repositories"
  echo ""
  echo "3. Install package:"
  echo "   apk update"
  echo "   apk add modbus2mqtt"
else
  echo "WARNING: No public key found in repository"
  echo "Make sure PACKAGER_PRIVKEY is set when running package.sh (public key is derived automatically)"
fi
