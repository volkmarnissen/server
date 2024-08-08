#!/usr/bin/bash
set +e
CONTAINER=$(docker container ps | grep modbus2mqtt| awk '{print $1}')
echo Container: $CONTAINER
if [ "$CONTAINER" == "" ] 
then
    echo modbus2mqtt container is not running
    exit 2
fi
if [ "$1" == "" ]
then
  docker exec -i $CONTAINER rm -r /usr/app/@modbus2mqtt </dev/null >/dev/null
  echo copy @modbus2mqtt
  docker cp  @modbus2mqtt $CONTAINER:/usr/app/@modbus2mqtt </dev/null >/dev/null
fi
echo  restart node modbus2mqtt
sleep 1
PID=`docker exec -i $CONTAINER ps | grep "node " | awk '{print $1}'` 
if [ "$PID" != "" ]
then
   echo node proceess id $PID
   docker exec -i $CONTAINER  "rm -rf node_modules/@modbus2mqtt && mv @modbus2mqtt node_modules && $CONTAINER kill $PID"
   docker exec -i $CONTAINER kill $PID
   while [ ! -r ~/killed ] 
   do
      sleep 5
      PID2=`docker exec -i $CONTAINER ps | grep "node " | awk '{print $1}'` 
      echo PID2 \"$PID2\" $PID
      if [ "$PID2" != "" -a "$PID2" != "$PID" ] 
      then
   	   touch ~/killed
      fi
   done
   rm ~/killed
   echo App started pid=\"$PID2\" $PID
   
else
   echo "node executable not found in container $CONTAINER"
   docker exec -i $CONTAINER  ps
fi

