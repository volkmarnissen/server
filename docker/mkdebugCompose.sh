#!/bin/bash
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
sed  '/\- \${PORT_MODBUS2MQTT}\:3000\/tcp/a\ \ \ \ \ \ \- "9229:9229"' <${SCRIPT_DIR}/modbus2mqtt-compose.yaml 
echo '    command:
      - node
      - "--inspect=0.0.0.0"
      - "node_modules/@modbus2mqtt/server/dist/modbus2mqtt.js"
      - "--ssl"
      - "/ssl"
      - "--yaml"
      - "/data" ' 
