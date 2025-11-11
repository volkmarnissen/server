#!/bin/sh
set -e
export BUILD_VERSION="$1"

# Build the Docker image
docker build -t modbus2mqtt \
 -f docker/Dockerfile \
 --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
 --build-arg BUILD_DESCRIPTION="modbus2mqtt Docker Image" \
 --build-arg BUILD_NAME="modbus2mqtt" \
 --build-arg BUILD_REPOSITORY="modbus2mqtt" \
 --build-arg BUILD_VERSION="$BUILD_VERSION" \
 .

# Optional SSH test with --test-ssh flag
if [ "$2" = "--test-ssh" ]; then
  echo "===================================="
  echo "Testing SSH configuration..."
  echo "===================================="
  
  # Create temporary directory for test data
  TEST_DIR=$(mktemp -d)
  trap 'rm -rf "$TEST_DIR"' EXIT
  
  # Generate test SSH key pair
  ssh-keygen -t ed25519 -f "$TEST_DIR/test_key" -N "" -C "modbus2mqtt-test" >/dev/null 2>&1
  TEST_PUBKEY=$(cat "$TEST_DIR/test_key.pub")
  
  # Create options.json with test public key
  cat > "$TEST_DIR/options.json" << EOF
{
  "ssh_port": 22,
  "user_pubkey": "$TEST_PUBKEY"
}
EOF
  
  echo "✓ Generated test SSH key pair"
  echo "✓ Created options.json with public key"
  
  # Start container with shared data volume
  CONTAINER_ID=$(docker run -d \
    -v "$TEST_DIR:/data" \
    -p 2222:22 \
    modbus2mqtt)
  
  echo "✓ Started container: $CONTAINER_ID"
  
  # Wait for SSH service to be ready
  echo "Waiting for SSH service..."
  for i in $(seq 1 30); do
    if docker exec "$CONTAINER_ID" pgrep sshd >/dev/null 2>&1; then
      echo "✓ SSH service is running"
      break
    fi
    sleep 1
    if [ "$i" -eq 30 ]; then
      echo "✗ SSH service failed to start"
      docker logs "$CONTAINER_ID"
      docker stop "$CONTAINER_ID" >/dev/null 2>&1
      docker rm "$CONTAINER_ID" >/dev/null 2>&1
      exit 1
    fi
  done
  
  # Check if authorized_keys was created correctly
  echo "Checking authorized_keys configuration..."
  docker exec "$CONTAINER_ID" cat /root/.ssh/authorized_keys > "$TEST_DIR/container_authorized_keys"
  
  if grep -q "modbus2mqtt-test" "$TEST_DIR/container_authorized_keys"; then
    echo "✓ authorized_keys contains test public key"
  else
    echo "✗ authorized_keys does not contain test public key"
    echo "Expected:"
    cat "$TEST_DIR/test_key.pub"
    echo "Actual:"
    cat "$TEST_DIR/container_authorized_keys"
    docker stop "$CONTAINER_ID" >/dev/null 2>&1
    docker rm "$CONTAINER_ID" >/dev/null 2>&1
    exit 1
  fi
  
  # Test SSH connection
  echo "Testing SSH connection..."
  sleep 2
  if ssh -i "$TEST_DIR/test_key" \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    -o ConnectTimeout=10 \
    -p 2222 \
    root@localhost \
    "echo 'SSH connection successful'" >/dev/null 2>&1; then
    echo "✓ SSH connection successful"
  else
    echo "✗ SSH connection failed"
    echo "Container logs:"
    docker logs "$CONTAINER_ID"
    docker stop "$CONTAINER_ID" >/dev/null 2>&1
    docker rm "$CONTAINER_ID" >/dev/null 2>&1
    exit 1
  fi
  
  # Cleanup
  docker stop "$CONTAINER_ID" >/dev/null 2>&1
  docker rm "$CONTAINER_ID" >/dev/null 2>&1
  
  echo "===================================="
  echo "✓ SSH test completed successfully!"
  echo "===================================="
fi 
