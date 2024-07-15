#!/bin/bash
DEBUG='#'
while getopts d flag
do
    case "${flag}" in
        d) DEBUG="      - --inspect-brk=0.0.0.0";;
    esac
done
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
sed  '/\- \${PORT_MODBUS2MQTT}\:3000\/tcp/a\ \ \ \ \ \ \- "9229:9229"' <${SCRIPT_DIR}/modbus2mqtt-compose.yaml 
echo '    command:
      - node'
echo "$DEBUG"
echo '      - "node_modules/@modbus2mqtt/server/dist/modbus2mqtt.js"
      - "--ssl"
      - "/ssl"
      - "--yaml"
      - "/data" ' 
