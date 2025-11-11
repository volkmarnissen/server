#!/bin/bash
set -euo pipefail

# Build and push multi-arch SSH test helper image
# Usage: ./build.sh [--push] [TAG]

PUSH=false
TAG="${1:-latest}"

if [ "$TAG" = "--push" ]; then
  PUSH=true
  TAG="${2:-latest}"
elif [ "${2:-}" = "--push" ]; then
  PUSH=true
fi

REGISTRY="ghcr.io/modbus2mqtt"
IMAGE_NAME="ssh-test-helper"
FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${TAG}"

echo "Building multi-arch image: ${FULL_IMAGE}"

cd "$(dirname "$0")"

# Create buildx builder if not exists
if ! docker buildx inspect multiarch-builder >/dev/null 2>&1; then
  echo "Creating buildx builder 'multiarch-builder'"
  docker buildx create --name multiarch-builder --use
else
  docker buildx use multiarch-builder
fi

# shellcheck disable=SC2054
BUILD_ARGS=(
  --platform linux/amd64,linux/arm64,linux/arm/v7
  --build-arg S6_OVERLAY_VERSION=3.2.0.0
  -t "${FULL_IMAGE}"
)

if [ "$PUSH" = true ]; then
  echo "Building and pushing to registry..."
  BUILD_ARGS+=(--push)
else
  echo "Building locally (use --push to push to registry)..."
  BUILD_ARGS+=(--load)
fi

docker buildx build "${BUILD_ARGS[@]}" .

echo "Done! Image: ${FULL_IMAGE}"
if [ "$PUSH" = false ]; then
  echo "To push: ./build.sh --push ${TAG}"
fi
