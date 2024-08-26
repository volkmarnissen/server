#!/bin/sh 

{
   echo hassio-addon-repository
   echo specification.shared
   echo server.shared
   echo angular
   echo specification
}| while read NAME
do
   git clone git@github.com:modbus2mqtt/$NAME.git
done
if [ $# -ge 1 ] ; then
  echo Use $1
  git clone git@github.com:$1/server.git
else
  echo Use modbus2mqtt
	git clone git@github.com:modbus2mqtt/server.git
fi
