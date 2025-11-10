#!/bin/sh
set -eu

# Determine absolute script directory to allow running from any CWD
SCRIPT_DIR="$(cd "$(dirname "$0")" >/dev/null 2>&1 && pwd -P)"
REPO_DIR="$SCRIPT_DIR/../../repo"
PKG_DIR="$SCRIPT_DIR/packages"

# ALPINE_VERSION wird nun innerhalb von build.sh ermittelt und persistiert

# Ensure required abuild keys are present in environment (caller / CI must set them)
if [ -z "${PACKAGER_PRIVKEY:-}" ] || [ -z "${PACKAGER_PUBKEY:-}" ]; then
  echo "ERROR: PACKAGER_PRIVKEY and PACKAGER_PUBKEY must be set in the environment" >&2
  exit 2
fi

# Check if port 3000 is in use and attempt cleanup
if lsof -i -P | grep LISTEN | grep -q :3000; then
  echo "Port 3000 is in use - attempting to stop old test container..."
  docker stop modbus2mqtt-test-instance >/dev/null 2>&1 || true
  docker rm modbus2mqtt-test-instance >/dev/null 2>&1 || true
  sleep 2
  # Verify port is now free
  if lsof -i -P | grep LISTEN | grep -q :3000; then
    echo "ERROR: Port 3000 is still in use after cleanup - cannot run test" >&2
    echo "Run: docker ps -a | grep 3000 or lsof -i :3000 to investigate" >&2
    exit 1
  fi
fi
# build the apk using build.sh (this will copy produced packages/ into ../../repo)
"$SCRIPT_DIR/build.sh"

# Read chosen Alpine version from build metadata
if [ -f "$SCRIPT_DIR/build/alpine.env" ]; then
  # shellcheck source=/dev/null
  . "$SCRIPT_DIR/build/alpine.env"
fi
if [ -z "${ALPINE_VERSION:-}" ]; then
  echo "ERROR: ALPINE_VERSION konnte nicht ermittelt werden. Stelle sicher, dass build.sh erfolgreich gelaufen ist oder setze ALPINE_VERSION explizit." >&2
  exit 5
fi

# check packages exist
if [ ! -d "$REPO_DIR" ]; then
  echo "$REPO_DIR not found - build.sh didn't produce it" >&2
  exit 1
fi

# Copy repo to local packages for Docker build context (inside script directory)
rm -rf "$PKG_DIR"
cp -r "$REPO_DIR" "$PKG_DIR"

# Remove old test container if it exists
if docker ps -a --format '{{.Names}}' | grep -xq "modbus2mqtt-test-instance"; then
  echo "Removing existing test container..."
  docker rm -f modbus2mqtt-test-instance >/dev/null 2>&1 || true
fi

# build test docker image (use script directory as build context)
docker build --build-arg ALPINE_VERSION="$ALPINE_VERSION" -t modbus2mqtt-test -f "$SCRIPT_DIR/Dockerfile.test" "$SCRIPT_DIR"

echo "Running container to perform runtime healthcheck..."
docker run -d -p 3000:3000 --name modbus2mqtt-test-instance modbus2mqtt-test 

# wait for service with retry limit
attempts=0
max_attempts=4

while [ "$(docker inspect -f '{{.State.Running}}' modbus2mqtt-test-instance)" = "true" ]; do
  attempts=$((attempts + 1))
  echo "Attempt $attempts of $max_attempts..."
  
  if curl -s -f -o /dev/null http://localhost:3000/; then
    echo "Service is up and running!"
    echo "Cleaning up test container..."
    docker stop modbus2mqtt-test-instance >/dev/null 2>&1
    docker rm modbus2mqtt-test-instance >/dev/null 2>&1
    exit 0
  fi
  
  if [ "$attempts" -ge "$max_attempts" ]; then
    echo "Service failed to respond after $max_attempts attempts - aborting" >&2
    docker logs modbus2mqtt-test-instance >&2
    docker stop modbus2mqtt-test-instance >/dev/null
    docker rm modbus2mqtt-test-instance >/dev/null
    exit 1
  fi
  
  sleep 2
done

