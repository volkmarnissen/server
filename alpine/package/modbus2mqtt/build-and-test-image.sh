#!/bin/sh
set -eu

# Parse command line options
KEEP_CONTAINER=false
SKIP_BUILD=false

for arg in "$@"; do
  case "$arg" in
    --keep|-k)
      KEEP_CONTAINER=true
      echo "Container will be kept running for debugging"
      ;;
    --skip-build|-s)
      SKIP_BUILD=true
      echo "Skipping APK build (using existing repository)"
      ;;
    *)
      echo "Usage: $0 [--keep|-k] [--skip-build|-s]"
      echo "  --keep|-k      Keep containers running for debugging"
      echo "  --skip-build|-s Skip APK build if repository exists"
      exit 1
      ;;
  esac
done

# Determine absolute script directory to allow running from any CWD
SCRIPT_DIR="$(cd "$(dirname "$0")" >/dev/null 2>&1 && pwd -P)"
REPO_DIR="$SCRIPT_DIR/../../repo"
PKG_DIR="$SCRIPT_DIR/packages"

# ALPINE_VERSION wird nun innerhalb von build.sh ermittelt und persistiert

# Check if we should skip the build
if [ "$SKIP_BUILD" = "true" ]; then
  echo "Checking for existing APK repository..."
  # Check if any APK and public key files exist
  APK_FOUND=false
  KEY_FOUND=false
  
  for apk_file in "$REPO_DIR"/*/modbus2mqtt-*.apk; do
    if [ -f "$apk_file" ]; then
      APK_FOUND=true
      break
    fi
  done
  
  for key_file in "$REPO_DIR"/*/packager.rsa.pub; do
    if [ -f "$key_file" ]; then
      KEY_FOUND=true
      break
    fi
  done
  
  if [ "$APK_FOUND" = "true" ] && [ "$KEY_FOUND" = "true" ]; then
    echo "✓ Found existing APK packages and public key - skipping build"
  else
    echo "ERROR: --skip-build specified but no valid APK repository found in $REPO_DIR" >&2
    echo "Expected: modbus2mqtt-*.apk and packager.rsa.pub files" >&2
    exit 2
  fi
else
  # Ensure required abuild keys are present in environment (caller / CI must set them)
  if [ -z "${PACKAGER_PRIVKEY:-}" ]; then
    echo "ERROR: PACKAGER_PRIVKEY must be set in the environment" >&2
    exit 2
  fi
fi

# Cleanup any existing test containers and check ports
echo "Cleaning up any existing test containers..."
docker stop modbus2mqtt-test-instance modbus2mqtt-standalone-test >/dev/null 2>&1 || true
docker rm modbus2mqtt-test-instance modbus2mqtt-standalone-test >/dev/null 2>&1 || true

# Check if ports are still in use after cleanup
if lsof -i -P | grep LISTEN | grep -qE ':(3010|3011|3022|3023)'; then
  echo "Port conflicts detected after container cleanup:"
  lsof -i :3010 -i :3011 -i :3022 -i :3023 2>/dev/null || true
  echo "Waiting for ports to be released..."
  sleep 5
  if lsof -i -P | grep LISTEN | grep -qE ':(3010|3011|3022|3023)'; then
    echo "ERROR: Ports still in use - cannot run test" >&2
    echo "Run: docker ps -a | grep modbus2mqtt or lsof -i :3010 -i :3011 -i :3022 -i :3023 to investigate" >&2
    exit 1
  fi
fi

# Build APK or use existing repository
if [ "$SKIP_BUILD" = "true" ]; then
  echo "Using existing APK repository (build skipped)"
  # Try to determine Alpine version from existing packages
  for apk_file in "$REPO_DIR"/*/modbus2mqtt-*.apk; do
    if [ -f "$apk_file" ]; then
      # Extract architecture from path (e.g., /repo/x86_64/modbus2mqtt-*.apk)
      ARCH_DIR=$(dirname "$apk_file")
      ARCH=$(basename "$ARCH_DIR")
      echo "Found existing APK for architecture: $ARCH"
      break
    fi
  done
  # Set a default Alpine version if build metadata isn't available
  if [ ! -f "$SCRIPT_DIR/build/alpine.env" ]; then
    echo "ALPINE_VERSION=3.22" > "$SCRIPT_DIR/build/alpine.env"
    echo "Set default ALPINE_VERSION=3.22 for Docker build"
  fi
else
  # build the apk using build.sh (this will copy produced packages/ into ../../repo)
  "$SCRIPT_DIR/build.sh"
fi

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

# Detect host architecture and map to Docker platform
HOST_ARCH=$(uname -m)
case "$HOST_ARCH" in
  x86_64) DOCKER_PLATFORM="linux/amd64" ;;
  aarch64|arm64) DOCKER_PLATFORM="linux/arm64" ;;
  armv7l) DOCKER_PLATFORM="linux/arm/v7" ;;
  *) echo "WARNING: Unknown arch $HOST_ARCH, using linux/amd64" >&2; DOCKER_PLATFORM="linux/amd64" ;;
esac
echo "Building for platform: $DOCKER_PLATFORM (host arch: $HOST_ARCH)"

# build test docker image (use project root as build context, point to docker/Dockerfile)
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../" >/dev/null 2>&1 && pwd -P)"
docker build --platform "$DOCKER_PLATFORM" --build-arg ALPINE_VERSION="$ALPINE_VERSION" -t modbus2mqtt-test -f "$PROJECT_ROOT/docker/Dockerfile" "$PROJECT_ROOT"

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

# Set correct permissions for mount point (modbus2mqtt user = UID 1000)
echo "Setting correct permissions for test data directory..."
chmod 755 "$TEST_DATA_DIR"
# Make files readable for modbus2mqtt user (fallback for different systems)
chmod 644 "$TEST_DATA_DIR"/* 2>/dev/null || true

# Start container with shared data volume
docker run -d -p 3010:3000 -p 3022:22 -v "$TEST_DATA_DIR:/data" --name modbus2mqtt-test-instance modbus2mqtt-test 

# wait for service with retry limit
attempts=0
max_attempts=4

while [ "$(docker inspect -f '{{.State.Running}}' modbus2mqtt-test-instance)" = "true" ]; do
  attempts=$((attempts + 1))
  echo "Attempt $attempts of $max_attempts..."
  
  if curl -s -f -o /dev/null http://localhost:3010/; then
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
    
    echo "Cleaning up first test container..."
    docker stop modbus2mqtt-test-instance >/dev/null 2>&1
    docker rm modbus2mqtt-test-instance >/dev/null 2>&1
    
    # Test 2: Standalone mode (no volume mounts, no options.json)
    echo ""
    echo "=== Testing Standalone Mode (no volumes) ==="
    echo "Starting standalone container without volume mounts..."
    
    docker run -d -p 3011:3000 -p 3023:22 --name modbus2mqtt-standalone-test modbus2mqtt-test
    
    # Wait for standalone service 
    standalone_attempts=0
    while [ "$(docker inspect -f '{{.State.Running}}' modbus2mqtt-standalone-test)" = "true" ]; do
      standalone_attempts=$((standalone_attempts + 1))
      echo "Standalone test attempt $standalone_attempts of $max_attempts..."
      
      if curl -s -f -o /dev/null http://localhost:3011/; then
        echo "✓ Standalone service is running on port 3011!"
        
        # Test SSH port (should be open but no authorized_keys)
        if nc -z -w 2 localhost 3023 >/dev/null 2>&1; then
          echo "✓ SSH service is running on port 3023 (no keys configured)"
        else
          echo "⚠ SSH service not responding on port 3023"
        fi
        
        if [ "$KEEP_CONTAINER" = true ]; then
          echo ""
          echo "Both containers are running for debugging:"
          echo "  docker logs modbus2mqtt-standalone-test"
          echo "  docker exec -it modbus2mqtt-standalone-test sh"
          echo "  docker stop modbus2mqtt-standalone-test && docker rm modbus2mqtt-standalone-test"
          exit 0
        fi
        
        echo "Cleaning up standalone test container..."
        docker stop modbus2mqtt-standalone-test >/dev/null 2>&1
        docker rm modbus2mqtt-standalone-test >/dev/null 2>&1
        echo ""
        echo "=== All Tests Passed ==="
        echo "✓ Test 1: Container with volume mount and SSH keys"
        echo "✓ Test 2: Standalone container without volumes"
        exit 0
      fi
      
      if [ "$standalone_attempts" -ge "$max_attempts" ]; then
        echo "ERROR: Standalone service failed to respond after $max_attempts attempts" >&2
        docker logs modbus2mqtt-standalone-test >&2
        if [ "$KEEP_CONTAINER" = false ]; then
          docker stop modbus2mqtt-standalone-test >/dev/null 2>&1
          docker rm modbus2mqtt-standalone-test >/dev/null 2>&1
        fi
        exit 1
      fi
      
      sleep 2
    done
    
    echo "ERROR: Standalone container stopped unexpectedly" >&2
    docker logs modbus2mqtt-standalone-test >&2
    if [ "$KEEP_CONTAINER" = false ]; then
      docker rm modbus2mqtt-standalone-test >/dev/null 2>&1
    fi
    exit 1
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

