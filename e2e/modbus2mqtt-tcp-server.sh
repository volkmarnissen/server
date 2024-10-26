#!/bin/sh
BASEDIR=$(dirname "$0")
# .../server/e2e
cd $BASEDIR/..
echo starting tcp server
# git is not happy when a repository was checked out by another user
rm -rf e2e/temp/yaml-dir-tcp/public
# --inspect-brk=9229 for debugging
node  ./dist/runModbusTCPserver.js -y e2e/temp/yaml-dir-tcp  --busid 0 --port 3002