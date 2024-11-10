#!/bin/sh
BASEDIR=$(dirname "$0")
# .../server/e2e
cd $BASEDIR/..
node dist/modbus2mqtt.js -y e2e/temp/yaml-dir -s e2e/temp/ssl 