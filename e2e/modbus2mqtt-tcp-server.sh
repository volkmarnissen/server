#!/bin/sh
BASEDIR=$(dirname "$0")
# .../server/e2e
cd $BASEDIR/..
echo starting tcp server
rm -rf e2e/temp/yaml-dir-tcp/public
# --inspect-brk=9229 for debugging
node  ./dist/runModbusTCPserver.js -y e2e/temp/yaml-dir-tcp  --busid 0