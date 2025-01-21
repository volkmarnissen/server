
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
if pgrep mosquitto
then 
  pkill mosquitto
fi
if [ "$1" == "stop" ]
then
  exit 0
fi
# Wait for kill 100ms
sleep 0.1
echo homeasistant:homeassistant >e2e/mosquitto/password.txt 
mosquitto_passwd -U e2e/mosquitto/password.txt 
(nohup /usr/sbin/mosquitto -c e2e/mosquitto/homeassistant.conf  2>&1 >e2e/temp/mosquitto.log & )
checkservice 3001 "mosquitto service"
exit $?
