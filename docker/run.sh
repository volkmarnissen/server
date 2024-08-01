#!/usr/bin/sh
cd /usr/app
if [ ! -r /ssl ]
then
    echo ERROR: /ssl directory does not exist or is not readable, but it is required. Check your docker compose file.
fi
export HOME=/data/home
cd /usr/app
npx $DEBUG_OPT modbus2mqtt --yaml /data --ssl /ssl
DEBUG_OPT="--node-options=--inspect-brk=0.0.0.0 "
DEBUG="config.addon"
TERMINATE="false"
while [ "$TERMINATE" == "false" ]
do
   echo starting app 

   echo $HASSIO_TOKEN
   npx $DEBUG_OPT modbus2mqtt --yaml /data --ssl /ssl
   if [ -d /docker ]
   then
      npm uninstall @modbus2mqtt/server @modbus2mqtt/specification @modbus2mqtt/angular  
      {
        echo specification.shared-
        echo server.shared-
        echo specification-
        echo angular-
        echo server-
      } | while read app 
      do
         echo $app
         npm install /docker/*$app*.tgz
	 rm -r /docker
      done      
   else
     TERMINATE="true" 
   fi
done


