
#!/usr/bin/bash 
checkservice() {
    port=$1
    service=$2
    timeout 12 bash -c '
    until printf \"\" >>/dev/tcp/localhost/'$port'; 
      do sleep 1; 
      done 2>/dev/null'
    if [ $? -eq 0 ] 
    then
      echo $service  is available at $port
      return 0
    else
      return 1
    fi
}

if pgrep -f e2e/temp/yaml-dir >/dev/null
then 
  pkill -f e2e/temp/yaml-dir
fi
if [ "$1" == "stop" ]
then
  echo stopping
  exit 0
fi
# Wait for kill 100ms
sleep 0.1
rm -rf e2e/temp/yaml-dir e2e/temp/yaml-dir-addon 
mkdir -p e2e/temp/yaml-dir/local
mkdir -p e2e/temp/log
echo 'httpport: 3005' >e2e/temp/yaml-dir/local/modbus2mqtt.yaml
mkdir -p e2e/temp/yaml-dir-addon/local
(echo "httpport: 3004" &&  echo "supervisor_host: localhost" ) >e2e/temp/yaml-dir-addon/local/modbus2mqtt.yaml
(nohup node dist/modbus2mqtt.js -y e2e/temp/yaml-dir -s e2e/temp/ssl  2>&1 >e2e/temp/modbus2mqtt-local.log &  )
(nohup node dist/modbus2mqtt.js -y e2e/temp/yaml-dir-addon -s e2e/temp/ssl 2>&1 >e2e/temp/modbus2mqtt-addon.log &) 
echo check services
if checkservice 3004 "addon service" 
then
  checkservice 3005 "modbus2mqtt service"
fi
exit $?
