
#!/usr/bin/bash 
if pgrep -f runModbusTCPserver
then 
  echo killing
  pkill -f runModbusTCPserver
fi
# Wait for kill 100ms
sleep 0.1
mkdir -p e2e/temp
nohup node dist/runModbusTCPserver.js -y e2e/modbusTCP/yaml-dir  --busid 2>&1 0 >e2e/temp/serverModbusTCP.log &