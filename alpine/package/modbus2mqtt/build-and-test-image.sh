#!/bin/bash
set -e

# build-and-test-image.sh
# Orchestrates the complete build and test flow using the new separated scripts
# Usage: ./build-and-test-image.sh [--keep|-k] [--skip-build|-s]

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

# Determine absolute script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" >/dev/null 2>&1 && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../" >/dev/null 2>&1 && pwd -P)"

echo "=== modbus2mqtt Build and Test ==="
echo "Project root: $PROJECT_ROOT"

# Step 1: Build APK (unless skipped)
if [ "$SKIP_BUILD" = "false" ]; then
  echo ""
  echo "Step 1/3: Building APK package..."
  "$SCRIPT_DIR/package.sh"
  echo "✓ APK build completed"
else
  echo ""
  echo "Step 1/3: Skipping APK build (using existing repository)"
fi

# Step 2: Build Docker image
echo ""
echo "Step 2/3: Building Docker image..."
cd "$PROJECT_ROOT"
./docker/build.sh

# Step 3: Test Docker image
echo ""
echo "Step 3/3: Testing Docker image..."
if [ "$KEEP_CONTAINER" = "true" ]; then
  ./docker/test.sh --keep
else
  ./docker/test.sh
fi

echo ""
echo "=== Build and Test Complete ==="
echo "✓ APK package built"
echo "✓ Docker image built: modbus2mqtt"
echo "✓ Docker image tested successfully"