#!/bin/sh
# Simple HTTP server for Alpine repository
# Serves alpine/repo/ on port 8080

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$SCRIPT_DIR/repo"

if [ ! -d "$REPO_DIR" ]; then
  echo "ERROR: Repository directory not found: $REPO_DIR" >&2
  echo "Run build.sh first to create packages" >&2
  exit 1
fi

echo "Serving Alpine repository from: $REPO_DIR"
echo "Access at: http://$(hostname -I | awk '{print $1}'):8080"
echo ""
echo "Add to LXC /etc/apk/repositories:"
echo "  http://$(hostname -I | awk '{print $1}'):8080/\$(uname -m)"
echo ""
echo "Then install with: apk update && apk add modbus2mqtt"
echo ""

cd "$REPO_DIR"
python3 -m http.server 8080
