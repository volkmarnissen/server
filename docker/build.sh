#!/bin/bash
set -e

# docker/build.sh
# Local Docker build script - builds modbus2mqtt Docker image
# Usage: ./docker/build.sh [version]

# Determine script directory and project root
SCRIPT_DIR="$(cd "$(dirname "$0")" >/dev/null 2>&1 && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd -P)"

# Get version from parameter or package.json
BUILD_VERSION="${1:-$(cd "$PROJECT_ROOT" && node -p "require('./package.json').version" 2>/dev/null || echo "dev")}"

# Detect host architecture and map to Alpine naming
HOST_ARCH=$(uname -m)
case "$HOST_ARCH" in
    x86_64)
        BUILD_ARCH="x86_64"
        ;;
    aarch64|arm64)
        BUILD_ARCH="aarch64"
        ;;
    *)
        echo "WARNING: Unknown architecture $HOST_ARCH, defaulting to x86_64" >&2
        BUILD_ARCH="x86_64"
        ;;
esac

echo "Building modbus2mqtt Docker image"
echo "  Version: $BUILD_VERSION"
echo "  Architecture: $BUILD_ARCH"
echo "  Project root: $PROJECT_ROOT"

# Check if APK files exist
APK_DIR="$PROJECT_ROOT/alpine/repo/$BUILD_ARCH"
PUBLIC_KEY="$PROJECT_ROOT/alpine/repo/packager.rsa.pub"

if [ ! -d "$APK_DIR" ] || [ ! -f "$PUBLIC_KEY" ]; then
    echo ""
    echo "ERROR: APK repository not found!"
    echo "  Expected APK directory: $APK_DIR"
    echo "  Expected public key: $PUBLIC_KEY"
    echo ""
    echo "Please run one of these first:"
    echo "  cd alpine/package/modbus2mqtt && ./package.sh"
    echo "  cd alpine/package/modbus2mqtt && ./build-and-test-image.sh"
    echo ""
    exit 1
fi

APK_COUNT=$(find "$APK_DIR" -name "*.apk" | wc -l)
if [ "$APK_COUNT" -eq 0 ]; then
    echo "ERROR: No APK files found in $APK_DIR"
    echo "Available directories:"
    ls -la "$PROJECT_ROOT/alpine/repo/" 2>/dev/null || echo "  (none)"
    exit 1
fi

echo "Found APK repository:"
echo "  APK directory: $APK_DIR ($APK_COUNT files)"
echo "  Public key: $PUBLIC_KEY"

# Build the Docker image
cd "$PROJECT_ROOT"
docker build -t modbus2mqtt \
    -f docker/Dockerfile \
    --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    --build-arg BUILD_DESCRIPTION="modbus2mqtt Docker Image" \
    --build-arg BUILD_NAME="modbus2mqtt" \
    --build-arg BUILD_REPOSITORY="modbus2mqtt" \
    --build-arg BUILD_VERSION="$BUILD_VERSION" \
    --build-arg BUILD_ARCH="$BUILD_ARCH" \
    --build-arg ALPINE_VERSION="3.22" \
    .

echo ""
echo "✓ Docker image 'modbus2mqtt' built successfully"
echo "  Image: modbus2mqtt:latest"
echo "  Version: $BUILD_VERSION"
echo "  Architecture: $BUILD_ARCH"
echo ""
echo "Next steps:"
echo "  Test: ./docker/test.sh"
echo "  Run:  docker run -d -p 3000:3000 -p 22:22 modbus2mqtt"