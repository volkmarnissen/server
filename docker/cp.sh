#!/bin/sh
set +e
CONTAINER=$(docker container ps | grep modbus2mqtt| awk '{print $1}')
echo Container: $CONTAINER
if [ "$CONTAINER" = "" ] 
then
    echo modbus2mqtt container is not running
    exit 2
fi
docker exec -i $CONTAINER updateModbus2mqtt
