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
docker run -d -p 3000:3000 --name modbus2mqtt-test-instance modbus2mqtt-test 

# wait for service with retry limit
attempts=0
max_attempts=4

while [ "$(docker inspect -f '{{.State.Running}}' modbus2mqtt-test-instance)" = "true" ]; do
  attempts=$((attempts + 1))
  echo "Attempt $attempts of $max_attempts..."
  
  if curl -s -f -o /dev/null http://localhost:3000/; then
    echo "Service is up and running!"
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

