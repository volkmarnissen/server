#!/bin/bash
sed  '/\- \${PORT_MODBUS2MQTT}\:3000\/tcp/a\ \ \ \ \ \ \- "9229:9229"' <modbus2mqtt-compose.yaml  >modbus2mqtt-dbg-compose.yaml
echo '    command:
      - node
      - "--inspect-brk=0.0.0.0"
      - "node_modules/@modbus2mqtt/server/dist/modbus2mqtt.js"
      - "--ssl"
      - "/ssl"
      - "--yaml"
      - "/data" ' >>modbus2mqtt-dbg-compose.yaml
cat modbus2mqtt-dbg-compose.yaml
