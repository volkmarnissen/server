#!/bin/sh
set -eu

# Ensure required abuild keys are present in environment (caller / CI must set them)
if [ -z "${PACKAGER_PRIVKEY:-}" ] || [ -z "${PACKAGER_PUBKEY:-}" ]; then
  echo "ERROR: PACKAGER_PRIVKEY and PACKAGER_PUBKEY must be set in the environment" >&2
  exit 2
fi
lsof -i -P | grep LISTEN | grep :3000 && { echo "Port 3000 is already in use - cannot run test" >&2; exit 1; }
# build the apk using build.sh (this will copy produced packages/ into this dir)
./build.sh

# check packages exist
if [ ! -d packages ]; then
  echo "packages/ not found - build.sh didn't produce it" >&2
  exit 1
fi

# build test docker image
docker build -t modbus2mqtt-test -f Dockerfile.test .
if docker ps -a --format '{{.Names}}' | grep -xq "modbus2mqtt-test-instance"; then
  echo "ERROR: container 'modbus2mqtt-test-instance' still exists after startup - removing and aborting" >&2
  docker rm -f modbus2mqtt-test-instance >/dev/null 2>&1 || true
  exit 1
fi

echo "Running container to perform runtime healthcheck..."
container=$(docker run -d -p 3000:3000 --name modbus2mqtt-test-instance modbus2mqtt-test)

# wait a bit for service
sleep 3


if wget --quiet --spider http://localhost:3000/ >/dev/null 2>&1; then
  echo "HTTP check succeeded"
  docker logs "$container" --tail 50
  docker stop "$container" >/dev/null
  docker rm "$container" >/dev/null
  exit 0
else
  echo "HTTP check failed - container logs:" >&2
  docker logs "$container" >&2
  docker stop "$container" >/dev/null || true
  docker rm "$container" >/dev/null || true
  exit 1
fi
