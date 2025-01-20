
#!/usr/bin/bash 
if pgrep -f e2e/temp/yaml-dir
then 
  pkill -f e2e/temp/yaml-dir
fi
# Wait for kill 100ms
sleep 0.1
rm -rf e2e/temp/yaml-dir e2e/temp/yaml-dir-addon 
mkdir -p e2e/temp/yaml-dir/local
mkdir -p e2e/temp/log
echo 'httpport: 3005' >e2e/temp/yaml-dir/local/modbus2mqtt.yaml
mkdir -p e2e/temp/yaml-dir-addon/local
(echo "httpport: 3004" &&  echo "supervisor_host: localhost" ) >e2e/temp/yaml-dir-addon/local/modbus2mqtt.yaml
nohup node dist/modbus2mqtt.js -y e2e/temp/yaml-dir -s e2e/temp/ssl  2>&1 >e2e/temp/modbus2mqtt-local.log &
nohup node dist/modbus2mqtt.js -y e2e/temp/yaml-dir-addon -s e2e/temp/ssl 2>&1 >e2e/temp/modbus2mqtt-addon.log &