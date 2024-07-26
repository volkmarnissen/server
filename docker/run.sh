#!/usr/bin/sh
cd /usr/app
if [ ! -r /ssl ]
then
    echo ERROR: /ssl directory does not exist or is not readable, but it is required. Check your docker compose file.
fi
export HOME=/data/home
cd /usr/app
#DEBUG_OPT="--node-options=--inspect-brk=0.0.0.0 "
DEBUG="config.addon"
npx $DEBUG_OPT modbus2mqtt --yaml /data --ssl /ssl

