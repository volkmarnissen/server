#!/bin/sh
set -eu

# test-build.sh
# Local testing script for package.sh and docker/build.sh
# This script validates the modular build components locally before CI/CD

echo "=== Local Build Test ==="
echo "Testing modular build components..."

# Get script path and source utilities
script_path="$(readlink -f "$0")"
script_dir="$(dirname "$script_path")"

# shellcheck source=./package/modbus2mqtt/arch-utils.sh
. "$script_dir/package/modbus2mqtt/arch-utils.sh"
find_repo_root "$script_path"

echo "Repository root: $REPO_ROOT"
cd "$REPO_ROOT"

# Check required environment variables
if [ -z "${PACKAGER_PRIVKEY:-}" ]; then
    echo "ERROR: PACKAGER_PRIVKEY environment variable must be set" >&2
    echo "This should contain the private APK signing key" >&2
    exit 1
fi

echo ""
echo "=== Step 1: Testing APK Package Build ==="
echo "Running alpine/package/modbus2mqtt/package.sh..."

if alpine/package/modbus2mqtt/package.sh; then
    echo "✓ APK package build successful"
    
    # Verify APK was created
    apk_count=$(find alpine/repo -name "modbus2mqtt-*.apk" | wc -l)
    if [ "$apk_count" -gt 0 ]; then
        echo "✓ APK file created successfully ($apk_count files)"
        find alpine/repo -name "modbus2mqtt-*.apk" -exec ls -lh {} \;
    else
        echo "ERROR: APK file not found" >&2
        exit 1
    fi
else
    echo "ERROR: APK package build failed" >&2
    exit 1
fi

echo ""
echo "=== Step 2: Testing Docker Image Build ==="
echo "Running docker/build.sh..."

if docker/build.sh; then
    echo "✓ Docker image build successful"
    
    # Show created image
    echo "Docker images:"
    docker images | grep modbus2mqtt | head -5
else
    echo "ERROR: Docker image build failed" >&2
    exit 1
fi

echo ""
echo "=== Step 3: Testing Docker Image ==="
echo "Running docker/test.sh --quick..."

if docker/test.sh --quick; then
    echo "✓ Docker image test successful"
else
    echo "ERROR: Docker image test failed" >&2
    exit 1
fi

echo ""
echo "=== Build Test Summary ==="
echo "✓ APK package build: PASSED"
echo "✓ Docker image build: PASSED" 
echo "✓ Docker image test: PASSED"
echo ""
echo "All build components are working correctly!"
echo ""
echo "Built artifacts:"
echo "- APK packages in: alpine/repo/"
echo "- Docker image: $(docker images --format "table {{.Repository}}:{{.Tag}}" | grep modbus2mqtt | head -1)"