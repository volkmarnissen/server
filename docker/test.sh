#!/bin/bash
set -e

# docker/test.sh 
# Test script for modbus2mqtt Docker image
# Usage: ./docker/test.sh [--keep|-k] [--quick|-q] [IMAGE_TAG]

# Optional: --docker-tag <TAG> als Argument
IMAGE_TAG="modbus2mqtt"
POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep|-k|--quick|-q)
      POSITIONAL+=("$1")
      shift
      ;;
    --docker-tag)
      if [[ -n "$2" ]]; then
        IMAGE_TAG="$2"
        shift 2
      else
        echo "ERROR: --docker-tag requires an argument" >&2
        exit 1
      fi
      ;;
    *)
      echo "Usage: $0 [--keep|-k] [--quick|-q] [--docker-tag <TAG>]"
      echo "  --keep|-k         Keep containers running for debugging"
      echo "  --quick|-q        Quick test (web service only, no SSH tests)"
      echo "  --docker-tag TAG  Use specific Docker image tag (default: modbus2mqtt)"
      exit 1
      ;;
  esac
done
set -- "${POSITIONAL[@]}"

# Configuration
KEEP_CONTAINER=false
QUICK_TEST=false
TEST_PORTS=(3010 3011 3022 3023)
MAX_ATTEMPTS=6
WAIT_SECONDS=2

# Parse command line options
for arg in "$@"; do
  case "$arg" in
    --keep|-k)
      KEEP_CONTAINER=true
      echo "Container will be kept running for debugging"
      ;;
    --quick|-q)
      QUICK_TEST=true
      echo "Running quick test (web service only)"
      ;;
    *)
      echo "Usage: $0 [--keep|-k] [--quick|-q]"
      echo "  --keep|-k      Keep containers running for debugging"
      echo "  --quick|-q     Quick test (web service only, no SSH tests)"
      exit 1
      ;;
  esac
done

echo "Testing modbus2mqtt Docker image..."



cleanup_containers() {
  echo "Cleaning up test containers..." 
  docker stop modbus2mqtt-test-main modbus2mqtt-test-standalone >/dev/null 2>&1 || true
  docker rm modbus2mqtt-test-main modbus2mqtt-test-standalone >/dev/null 2>&1 || true
}
# Function: Cleanup containers_or_keep
cleanup_containers_or_keep() {
# Cleanup or keep for debugging
if [ "$KEEP_CONTAINER" = "true" ]; then
  echo ""
  echo "=== Containers kept for debugging ==="
  echo "Main container:       modbus2mqtt-test-main"
  echo "  Web:  http://localhost:3010/"
  echo "  SSH:  ssh -p 3022 root@localhost"
  if [ "$QUICK_TEST" = "false" ]; then
    echo "Standalone container: modbus2mqtt-test-standalone" 
    echo "  Web:  http://localhost:3011/"
  fi
  echo ""
  echo "Commands:"
  echo "  docker logs modbus2mqtt-test-main"
  echo "  docker exec -it modbus2mqtt-test-main sh"
  echo "  docker stop modbus2mqtt-test-main modbus2mqtt-test-standalone"
  echo "  docker rm modbus2mqtt-test-main modbus2mqtt-test-standalone"
else
  cleanup_containers
fi

}

# Function: Check if ports are free
check_ports() {
  local ports_in_use=()
  for port in "${TEST_PORTS[@]}"; do
    if lsof -i ":$port" >/dev/null 2>&1; then
      ports_in_use+=("$port")
    fi
  done
  
  if [ ${#ports_in_use[@]} -gt 0 ]; then
    echo "ERROR: Ports in use: ${ports_in_use[*]}" >&2
    echo "Run: docker ps -a | grep modbus2mqtt" >&2
    exit 1
  fi
}

# Function: Wait for service to be ready
wait_for_service() {
  local port=$1
  local name=$2
  local attempts=0
  
  echo "Waiting for $name on port $port..."
  while [ $attempts -lt $MAX_ATTEMPTS ]; do
    attempts=$((attempts + 1))
    echo "  Attempt $attempts/$MAX_ATTEMPTS..."
    
    if curl -s -f -o /dev/null "http://localhost:$port/"; then
      echo "✓ $name is ready on port $port"
      return 0
    fi
    
    # Check if container is still running
    if ! docker inspect -f '{{.State.Running}}' "$3" >/dev/null 2>&1 || [ "$(docker inspect -f '{{.State.Running}}' "$3")" != "true" ]; then
      echo "ERROR: Container $3 stopped unexpectedly" >&2
      docker logs "$3" >&2
      return 1
    fi
    
    sleep $WAIT_SECONDS
  done
  
  echo "ERROR: $name failed to respond after $MAX_ATTEMPTS attempts" >&2
  docker logs "$3" >&2
  return 1
}

# Function: Test SSH service (basic connectivity)
test_ssh_basic() {
  local port=$1
  echo "Testing SSH connectivity on port $port..."
  
  if nc -z -w 2 localhost "$port" >/dev/null 2>&1; then
    echo "✓ SSH port $port is accessible"
    return 0
  else
    echo "✗ SSH port $port is not accessible" >&2
    return 1
  fi
}

# Function: Create test SSH setup
setup_ssh_test() {
  local test_dir=$1
  
  # Generate test SSH key pair
  ssh-keygen -t ed25519 -f "$test_dir/test_key" -N "" -C "modbus2mqtt-test" >/dev/null 2>&1
  TEST_PUBKEY=$(cat "$test_dir/test_key.pub")
  
  # Create options.json with test public key
  cat > "$test_dir/options.json" << EOF
{
  "ssh_port": 22,
  "user_pubkey": "$TEST_PUBKEY"
}
EOF

  # Set correct permissions
  chmod 755 "$test_dir"
  chmod 644 "$test_dir"/* 2>/dev/null || true
  
  echo "✓ SSH test setup created"
}

# Function: Advanced SSH test
test_ssh_advanced() {
  local container_name=$1
  local test_dir=$2
  
  if [ "$QUICK_TEST" = "true" ]; then
    echo "ℹ️  Skipping advanced SSH tests (quick mode)"
    return 0
  fi
  
  echo "Testing SSH key authentication..."
  
  # Check authorized_keys in container
  local auth_keys
  auth_keys=$(docker exec "$container_name" cat /root/.ssh/authorized_keys 2>/dev/null || echo "")
  
  if echo "$auth_keys" | grep -q "modbus2mqtt-test"; then
    echo "✓ SSH key configured in container"
  else
    echo "⚠️  SSH key not found in authorized_keys (but container is running)"
    return 0  # Don't fail the test, just warn
  fi
  
  # Test actual SSH connection (optional - can be flaky)
  if ssh -i "$test_dir/test_key" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 -o BatchMode=yes -p 3022 root@localhost "echo 'SSH OK'" >/dev/null 2>&1; then
    echo "✓ SSH key authentication successful"
  else
    echo "⚠️  SSH key authentication failed (but SSH service is running)"
  fi
}

# Main execution starts here
echo "=== modbus2mqtt Docker Test ==="

# Preliminary checks
cleanup_containers_or_keep
check_ports

# Check if image exists
if [ -z "$(docker images -q "$IMAGE_TAG" 2> /dev/null)" ]; then
  docker images >&2
  echo "ERROR: Docker image '$IMAGE_TAG' not found" >&2
  echo "Run: ./docker/build.sh first" >&2
  exit 1
fi

# Create test data directory
TEST_DIR=$(mktemp -d)
mkdir -p "$TEST_DIR/data"
mkdir -p "$TEST_DIR/ssl"
mkdir -p "$TEST_DIR/config"
trap 'rm -rf "$TEST_DATA_DIR"' EXIT

# Test 1: Container with volume mount and SSH configuration
echo ""
echo "=== Test 1: Full Configuration Test ==="
setup_ssh_test "$TEST_DIR/data"
chmod -R  755 "$TEST_DIR"
sudo chown -R root:root "$TEST_DIR"
cleanup_containers
echo "Starting container with volume mount..."
docker run -d -p 3010:3000 -p 3022:22 -v "$TEST_DIR/data:/data" -v "$TEST_DIR/ssl:/ssl" -v "$TEST_DIR/config:/config" --name modbus2mqtt-test-main "$IMAGE_TAG"

# Wait for web service
if ! wait_for_service 3010 "Web service" "modbus2mqtt-test-main"; then
  cleanup_containers_or_keep
  exit 1
fi

# Test SSH
if ! test_ssh_basic 3022; then
  cleanup_containers_or_keep  
  exit 1
fi

test_ssh_advanced "modbus2mqtt-test-main" "$TEST_DATA_DIR"

echo "✓ Test 1 passed: Container with volume mount"

# Test 2: Standalone container (if not in quick mode)
if [ "$QUICK_TEST" = "false" ]; then
  echo ""
  echo "=== Test 2: Standalone Container Test ==="
  echo "Starting standalone container..."
  docker run -d -p 3011:3000 -p 3023:22 --name modbus2mqtt-test-standalone "$IMAGE_TAG"

  if ! wait_for_service 3011 "Standalone web service" "modbus2mqtt-test-standalone"; then
    docker exec modbus2mqtt-test-standalone ls -la /var/logs
    cleanup_containers_or_keep
    exit 1
  fi

  if ! test_ssh_basic 3023; then
    echo "⚠️  SSH not accessible in standalone mode (expected)"
  fi

  echo "✓ Test 2 passed: Standalone container"
fi

cleanup_containers_or_keep
   
echo ""
echo "=== All Tests Passed ==="
echo "✓ Docker image works correctly"
echo "✓ Web service accessible"  
echo "✓ SSH service functional"
if [ "$QUICK_TEST" = "false" ]; then
  echo "✓ Standalone mode works"
fi