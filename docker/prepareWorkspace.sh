#!/usr/bin/bash 
set -e
export basedir="$HOME/m2m"
cd $basedir
{
   echo hassio-addon-repository
   echo specification.shared
   echo server.shared
   echo angular
   echo specification
}| while read NAME
do
   set +e
   if [ ! -d $NAME ] ; then
     git clone git@github.com:modbus2mqtt/$NAME.git
   fi
   set -e
   if [ $NAME != "hassio-addon-repository" ] ; then
   	cd $basedir/$NAME
   	npm install
   fi
done
if [ $# -ge 1 ] ; then
  echo Use $1
  if [ ! -d server ] ; then
     git clone git@github.com:$1/server.git
  fi
  cd $basedir/server
  npm install
  git config --global user.name volkmarnissen
  git config --global user.email volkmar.nissen@gmail.com
else
  echo Use modbus2mqtt
  if [ ! -d server ] ; then
    git clone git@github.com:modbus2mqtt/server.git
  fi
  cd $basedir/server
  npm install
  git config --global user.name modbus2mqtt
  git config --global user.email info@carcam360.de
fi

cd ~/m2m/specification
npm install ../specification.shared
cd ~/m2m/angular
npm install ../specification.shared
cd ~/m2m/server
npm install ../specification.shared

cd ~/m2m/server.shared
npm install ../server.shared
cd ~/m2m/angular
npm install ../server.shared

cd ~/m2m/server
npm install ../server.shared
npm install ../angular
npm install ../specification

