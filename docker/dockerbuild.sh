#!/bin/sh
set -e
export BUILD_VERSION="$1"
docker build -t modbus2mqtt.latest:latest -t modbus2mqtt.latest:"$BUILD_VERSION"  \
 -f docker/Dockerfile \
 --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
 --build-arg BUILD_DESCRIPTION="modbus2mqtt Docker Image" \
 --build-arg BUILD_NAME="modbus2mqtt" \
 --build-arg BUILD_REPOSITORY="modbus2mqtt" \
 --build-arg BUILD_VERSION="$BUILD_VERSION" \
 docker 
