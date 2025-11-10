#!/bin/sh
set -eu

# Parse command line options
KEEP_CONTAINER=false
if [ "${1:-}" = "--keep" ] || [ "${1:-}" = "-k" ]; then
  KEEP_CONTAINER=true
  echo "Container will be kept running for debugging"
fi

# Determine absolute script directory to allow running from any CWD
SCRIPT_DIR="$(cd "$(dirname "$0")" >/dev/null 2>&1 && pwd -P)"
REPO_DIR="$SCRIPT_DIR/../../repo"
PKG_DIR="$SCRIPT_DIR/packages"

# ALPINE_VERSION wird nun innerhalb von build.sh ermittelt und persistiert

# Ensure required abuild keys are present in environment (caller / CI must set them)
if [ -z "${PACKAGER_PRIVKEY:-}" ]; then
  echo "ERROR: PACKAGER_PRIVKEY must be set in the environment" >&2
  exit 2
fi

# Check if port 3000 or 3022 is in use and attempt cleanup
if lsof -i -P | grep LISTEN | grep -qE ':(3000|3022)'; then
  echo "Port 3000 or 3022 is in use - attempting to stop old test container..."
  docker stop modbus2mqtt-test-instance >/dev/null 2>&1 || true
  docker rm modbus2mqtt-test-instance >/dev/null 2>&1 || true
  sleep 3
  # Verify ports are now free
  if lsof -i -P | grep LISTEN | grep -qE ':(3000|3022)'; then
    echo "ERROR: Port 3000 or 3022 is still in use after cleanup - cannot run test" >&2
    echo "Run: docker ps -a | grep modbus2mqtt or lsof -i :3000 -i :3022 to investigate" >&2
    lsof -i :3000 -i :3022 >&2 || true
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

# build test docker image (use project root as build context, point to docker/Dockerfile)
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../" >/dev/null 2>&1 && pwd -P)"
docker build --build-arg ALPINE_VERSION="$ALPINE_VERSION" -t modbus2mqtt-test -f "$PROJECT_ROOT/docker/Dockerfile" "$PROJECT_ROOT"

echo "Running container to perform runtime healthcheck..."

# Create temporary directory for test data
TEST_DATA_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DATA_DIR"' EXIT

# Generate test SSH key pair
ssh-keygen -t ed25519 -f "$TEST_DATA_DIR/test_key" -N "" -C "modbus2mqtt-test" >/dev/null 2>&1
TEST_PUBKEY=$(cat "$TEST_DATA_DIR/test_key.pub")

# Create options.json with test public key
cat > "$TEST_DATA_DIR/options.json" << EOF
{
  "ssh_port": 22,
  "user_pubkey": "$TEST_PUBKEY"
}
EOF

echo "Created options.json with test SSH key"

# Start container with shared data volume
docker run -d -p 3000:3000 -p 3022:22 -v "$TEST_DATA_DIR:/data" --name modbus2mqtt-test-instance modbus2mqtt-test 

# wait for service with retry limit
attempts=0
max_attempts=4

while [ "$(docker inspect -f '{{.State.Running}}' modbus2mqtt-test-instance)" = "true" ]; do
  attempts=$((attempts + 1))
  echo "Attempt $attempts of $max_attempts..."
  
  if curl -s -f -o /dev/null http://localhost:3000/; then
    echo "Service is up and running!"
    
    # Test SSH service
    echo "Testing SSH service..."
    if nc -z -w 2 localhost 3022 >/dev/null 2>&1; then
      echo "SSH port 3022 is open"
      
      # Wait a moment for SSH service to fully initialize
      sleep 2
      
      # Check if authorized_keys was created correctly from options.json
      echo "Checking authorized_keys configuration..."
      CONTAINER_AUTHKEYS=$(docker exec modbus2mqtt-test-instance cat /root/.ssh/authorized_keys 2>/dev/null || echo "")
      
      if echo "$CONTAINER_AUTHKEYS" | grep -q "modbus2mqtt-test"; then
        echo "✓ authorized_keys contains test public key from options.json"
      else
        echo "ERROR: authorized_keys does not contain test public key" >&2
        echo "Expected key with comment: modbus2mqtt-test" >&2
        echo "Actual authorized_keys content:" >&2
        echo "$CONTAINER_AUTHKEYS" >&2
        echo "Container logs:" >&2
        docker logs modbus2mqtt-test-instance >&2
        if [ "$KEEP_CONTAINER" = false ]; then
          docker stop modbus2mqtt-test-instance >/dev/null 2>&1
          docker rm modbus2mqtt-test-instance >/dev/null 2>&1
        fi
        exit 1
      fi
      
      # Test SSH connection with the generated test key
      echo "Testing SSH connection with test key..."
      if ssh -i "$TEST_DATA_DIR/test_key" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o BatchMode=yes -p 3022 root@localhost "echo 'SSH connection successful'" 2>/dev/null; then
        echo "✓ SSH service is working correctly (successful key authentication via options.json)"
      else
        echo "ERROR: SSH connection with test key failed" >&2
        echo "Container logs:" >&2
        docker logs modbus2mqtt-test-instance >&2
        if [ "$KEEP_CONTAINER" = false ]; then
          docker stop modbus2mqtt-test-instance >/dev/null 2>&1
          docker rm modbus2mqtt-test-instance >/dev/null 2>&1
        fi
        exit 1
      fi
    else
      echo "ERROR: SSH service is not listening on port 3022" >&2
      docker logs modbus2mqtt-test-instance >&2
      if [ "$KEEP_CONTAINER" = false ]; then
        docker stop modbus2mqtt-test-instance >/dev/null 2>&1
        docker rm modbus2mqtt-test-instance >/dev/null 2>&1
      fi
      exit 1
    fi
    
    if [ "$KEEP_CONTAINER" = true ]; then
      echo ""
      echo "Container is still running for debugging:"
      echo "  docker logs modbus2mqtt-test-instance"
      echo "  docker exec -it modbus2mqtt-test-instance sh"
      echo "  docker stop modbus2mqtt-test-instance && docker rm modbus2mqtt-test-instance"
      exit 0
    fi
    
    echo "Cleaning up test container..."
    docker stop modbus2mqtt-test-instance >/dev/null 2>&1
    docker rm modbus2mqtt-test-instance >/dev/null 2>&1
    exit 0
  fi
  
  if [ "$attempts" -ge "$max_attempts" ]; then
    echo "Service failed to respond after $max_attempts attempts - aborting" >&2
    docker logs modbus2mqtt-test-instance >&2
    if [ "$KEEP_CONTAINER" = false ]; then
      docker stop modbus2mqtt-test-instance >/dev/null
      docker rm modbus2mqtt-test-instance >/dev/null
    fi
    exit 1
  fi
  
  sleep 2
done

