
#!/usr/bin/bash 
if pgrep mosquitto
then 
  pkill mosquitto
fi
# Wait for kill 100ms
sleep 0.1
cp /dev/null e2e/mosquitto/password.txt 
mosquitto_passwd -b e2e/mosquitto/password.txt homeasistant homeassisstant 
nohup /usr/sbin/mosquitto -c e2e/mosquitto/homeassistant.conf  2>&1 >e2e/temp/mosquitto.log &