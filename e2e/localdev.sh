#!/usr/bin/bash
# ports: localhost:
# 3005 modbus2mqtt
# 3001 mqtt
# 3002 Modbus Tcp
# 3003 mqtt allow anonymous
# 3004 modbus2mqtt Home Assistant Addon
# 80 homeassistant supervisor
set -e

export SERVICES=~/.config/systemd/user/
function services(){
    echo modbus2mqtt-tcp-server.service 3002
    echo mosquitto.service 3001
    echo mosquitto.service 3003
    echo modbus2mqtt-e2e.service 3005
    echo modbus2mqtt-addon.service 3004
}
function checkServices(){
  sleep 2
  services | while read service port
  do
    if ! systemctl --user is-active --quiet $service
    then
      systemctl --user status $service 
      cat $SERVICES/$service
      echo $service is not active!!!
      exit 1
    fi
  done
  sleep 2
  services | timeout 22 bash -c 'while read service port
  do
      until printf \"\" >>/dev/tcp/localhost/$port; 
      do sleep 1; 
      done 2>/dev/null
      echo $port is available
  done'
  echo Success
  exit 0

}
if [ "$1" == "stop" ]
then
  systemctl --user stop modbus2mqtt-tcp-server.service
  systemctl --user stop modbus2mqtt-e2e.service
  systemctl --user stop modbus2mqtt-addon.service
  systemctl --user stop mosquitto.service
  exit 1
fi

export BASEDIR="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"
export SERVERDIR=$(dirname "$BASEDIR")
YAMLDIR=${BASEDIR}/temp/yaml-dir-tcp
BUSSES=$YAMLDIR/local/busses/bus.0
#clear /init yamldirs
rm -rf ${BASEDIR}/temp/yaml-dir ${BASEDIR}/temp/yaml-dir-addon 
mkdir -p ${BASEDIR}/temp/yaml-dir/local
echo 'httpport: 3005' >${BASEDIR}/temp/yaml-dir/local/modbus2mqtt.yaml
mkdir -p ${BASEDIR}/temp/yaml-dir-addon/local
(echo "httpport: 3004" &&  echo "supervisor_host: localhost" )>${BASEDIR}/temp/yaml-dir-addon/local/modbus2mqtt.yaml
# reset: init yaml-dir and restart modbus2mqtt services
if [ "$1" == "reset" ]
then
  #daemon reload is not required: No changes to service
  systemctl --user restart modbus2mqtt-e2e.service
  systemctl --user restart modbus2mqtt-addon.service
  checkServices
fi

# .../server/e2e

# Root part START
set +e
sudo apt-get install -y nginx mosquitto mosquitto-clients >/dev/null 2>&1
sudo rm /etc/nginx/sites-enabled/default >/dev/null 2>&1
set -e

WWWROOT=/usr/share/nginx/temp/www-root
mkdir -p $WWWROOT/services/mqtt $WWWROOT/addons/self/info $WWWROOT/hardware/info

echo configure nginx 
sudo bash -c 'cat >'$WWWROOT'/services/mqtt/mqtt.json <<EOF
{
  "data":{
    "mqttconnect": {
      "host" : "localhost",
      "port" : 3001,
      "username" : "homeassistant",
      "password" : "homeassistant"
    }
  }
}
EOF'

sudo bash -c 'cat >'$WWWROOT'/addons/self/info/info.json <<EOF
{
  "data":{
    "slug": "slugtest",
    "ingress": true,
    "ingress_entry": "modbus2mqtt",
    "ingress_panel" : true,
    "ingress_port": 1234,
    "ingress_url": "modbus2mqtt"
  }
}
EOF'

sudo bash -c 'cat >'$WWWROOT'/hardware/info/hardware.json <<EOF
{
  "data":{
   "devices": [
   {
     "subsystem": "tty",
     "dev_path": "/dev/ttyUSB0"
   }
   ]
  }
}
EOF'

bash -c ' cat <<EOF2
server {
  listen 80;
  listen [::]:80;
  location  /services/mqtt {
     root |wwwroot|;
     index mqtt.json;
  }
  location  /addons/self/info {
     root |wwwroot|;
     index info.json;
  }
  location /addons/hardware/info {
     root |wwwroot|;
     index hardware.json;
  }

  location /modbus2mqtt/ {
        proxy_pass http://localhost:3004/;
        proxy_pass_header Content-Type; 
  }
  

}
EOF2' | sed -e "s:|wwwroot|:${WWWROOT}:g" | sudo sh -c "cat >/etc/nginx/conf.d/modbus2mqtt-addon-e2e.conf"
sudo systemctl daemon-reload
sudo systemctl stop mosquitto.service
sudo systemctl restart nginx.service
# Root part END

mkdir -p $SERVICES
mkdir -p ${BASEDIR}/temp/ssl
mkdir -p $BUSSES
cat >$BUSSES/bus.yaml <<EOF3
host: localhost
port: 3002
timeout: 500
EOF3
cat >$BUSSES/s3.yaml <<EOF4
slaveid: 3
specificationid: dimplexpco5
EOF4
cat >$BUSSES/s4.yaml <<EOF5
slaveid: 4
specificationid: eastronsdm720-m
EOF5

export MOSQUITTO_DIR=${BASEDIR}/temp/mosquitto
mkdir -p ${MOSQUITTO_DIR}/log
touch ${MOSQUITTO_DIR}/password.txt
chmod 700  ${MOSQUITTO_DIR}/password.txt
mosquitto_passwd -b ${MOSQUITTO_DIR}/password.txt homeassistant homeassistant

bash -c 'cat >'${MOSQUITTO_DIR}'/homeassistant.conf <<EOF6
per_listener_settings true
listener 3001
allow_anonymous false 
password_file '${MOSQUITTO_DIR}'/password.txt
listener 3003
allow_anonymous true
EOF6'

bash -c '
cat <<EOF7
[Unit]
Description=Modbus <=> Modbus TCP test server
After=network.target
StartLimitIntervalSec=1
[Service]
Type=simple
ExecStart=|node| |cwd|/dist/runModbusTCPserver.js -y |cwd|/e2e/temp/yaml-dir-tcp  --busid 0 
[Install]
WantedBy=multi-user.target
EOF7' | sed -e "s:|cwd|:${SERVERDIR}:g" | sed -e "s:|node|:"`which node`":g" | bash -c 'cat >'$SERVICES'modbus2mqtt-tcp-server.service'
echo SERVERDIR: $SERVERDIR
ls /home/runner/work/server/server/dist
ls /home/runner/work/server/server/dist/modbus2mqtt.js
ls ${SERVERDIR}
bash -c '
cat <<EOF8
[Unit]
Description=Modbus <=> MQTT e2e test server Stand alone  |cwd|
After=network.target
StartLimitIntervalSec=1
[Service]
Type=simple
WorkingDirectory=|cwd|
ExecStart=|node| |cwd|/dist/modbus2mqtt.js -y |cwd|/e2e/temp/yaml-dir -s |cwd|/e2e/temp/ssl 
[Install]
WantedBy=multi-user.target
EOF8'  | sed -e "s:|cwd|:"${SERVERDIR}":g" | sed -e "s:|node|:"`which node`":g" | bash -c 'cat >'$SERVICES'modbus2mqtt-e2e.service'

bash -c '
cat <<EOF10
[Unit]
Description=Modbus <=> MQTT e2e test server Home Assistant Addon
After=network.target
StartLimitIntervalSec=1
[Service]
Type=simple
WorkingDirectory=|cwd|
Environment="HASSIO_TOKEN=abcd1234"
ExecStart=|node| dist/modbus2mqtt.js -y e2e/temp/yaml-dir-addon -s e2e/temp/ssl 
[Install]
WantedBy=multi-user.target
EOF10'  | sed -e "s:|cwd|:${SERVERDIR}:g" | sed -e "s:|node|:"`which node`":g" | bash -c 'cat >'$SERVICES'/modbus2mqtt-addon.service'

bash -c '
cat <<EOF9
[Unit]
Description=Mosquitto MQTT Broker
Documentation=man:mosquitto.conf(5) man:mosquitto(8)
After=network.target
Wants=network.target

[Service]
Type=notify
NotifyAccess=main
ExecStart=/usr/sbin/mosquitto -c |mosquittodir|/homeassistant.conf
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
ExecStartPre=/bin/mkdir -m 740 -p |mosquittodir|/log/mosquitto
[Install]
EOF9' | sed -e "s:|mosquittodir|:${MOSQUITTO_DIR}:g" >$SERVICES'/mosquitto.service'

systemctl --user daemon-reload
sleep 1
systemctl --user restart modbus2mqtt-tcp-server.service
systemctl --user restart modbus2mqtt-e2e.service
systemctl --user restart modbus2mqtt-addon.service
systemctl --user restart mosquitto.service
checkServices

