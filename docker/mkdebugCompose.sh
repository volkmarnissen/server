#!/bin/bash
TEMP=$(getopt -o dm: --long debug,modules:  -- "$@")

if [ $? != 0 ] ; then echo "Terminating..." >&2 ; exit 1 ; fi

# Note the quotes around '$TEMP': they are essential!
eval set -- "$TEMP"

DEBUG_OPT='#'
DEBUG="httpserver"
while true; do
    case "$1" in
        -d | --debug ) DEBUG_OPT="      - --inspect-brk=0.0.0.0";shift;;
        -m | modules ) shift; DEBUG=$1;shift;;
    -- ) shift; break ;;
    * ) break ;;
  esac
done
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
sed  '/\- \${PORT_MODBUS2MQTT}\:3000\/tcp/a\ \ \ \ \ \ \- "9229:9229"' <${SCRIPT_DIR}/modbus2mqtt-compose.yaml |
sed  "s/DEBUG=.*$/DEBUG=${DEBUG}/g"
echo '    command:
      - node'
echo "$DEBUG_OPT"
echo '      - "node_modules/@modbus2mqtt/server/dist/modbus2mqtt.js"
      - "--ssl"
      - "/ssl"
      - "--yaml"
      - "/data" ' 
