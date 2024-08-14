#!/bin/sh
set +e
APPDIR=/usr/app
cd $APPDIR
DEBUG_OPT="--node-options=--inspect-brk=0.0.0.0 "
DEBUG="m2mgithub config.addon"
TERMINATE="false"
export HASSIO_TOKEN
while [ "$TERMINATE" = "false" ]
do
   echo starting modbus2mqtt
   exec npx $DEBUG_OPT modbus2mqtt --yaml /data --ssl /ssl --term 0
done