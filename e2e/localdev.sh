#!/bin/sh
BASEDIR=$(dirname "$0")
# .../server/e2e
cd $BASEDIR
sudo apt-get install -y nginx mosquitto mosquitto-clients
sudo rm /etc/nginx/sites-enabled/default
WWWROOT=temp/www-root
sudo mkdir -p $WWWROOT/services/mqtt
echo configure nginx
sudo bash -c 'cat >'$WWWROOT'/services/mqtt/mqtt.json <<EOF
"mqttconnect": {
  "host" : "localhost",
  "port" : 3001,
  "username" : "homeassistant",
  "password" : "homeassistant"
}
EOF'
if ! grep supervisor /etc/hosts >/dev/null
then
  sudo echo "127.0.0.1 supervisor" >>/etc/hosts
fi
sudo bash -c ' cat >/etc/nginx/conf.d/modbus2mqtt-addon-e2e.conf <<EOF2
server {
  listen 80 default_server;
  listen [::]:80 default_server;
  location  /services/mqtt {
     root temp/www-root;
     index mqtt.json;
  }
  location /modbus2mqtt/ {
        proxy_pass http://localhost:3000;
  }

}
EOF2'
sudo systemctl restart nginx.service
YAMLDIR=temp/yaml-dir-tcp
BUSSES=$YAMLDIR/local/busses/bus.0
mkdir -p $BUSSES
mkdir -p temp/yaml-dir
mkdir -p temp/ssl
cat >$BUSSES/bus.yaml <<EOF3
host: localhost
port: 502
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

sudo bash -c 'cat >/etc/mosquitto/conf.d/homeassistant.conf <<EOF6
listener 3001
allow_anonymous false 
password_file /etc/mosquitto/password.txt
EOF6'
sudo chmod 700  /etc/mosquitto/password.txt
sudo chown mosquitto /etc/mosquitto/password.txt
sudo mosquitto_passwd -b /etc/mosquitto/password.txt homeassistant homeassistant

sudo systemctl restart mosquitto.service
export CWD=`pwd`
bash -c '
cat <<EOF7
[Unit]
Description=Modbus <=> MQTT e2e test server
After=network.target
StartLimitIntervalSec=1
[Service]
Type=simple
User=|user|
ExecStart=/usr/bin/env sh -c "|script|" 
[Install]
WantedBy=multi-user.target
EOF7'  | sed -e "s:|script|:${CWD}/modbus2mqtt-server.sh:g" | sed -e "s/|user|/${USER}/g"| sudo bash -c 'cat >/etc/systemd/system/modbus2mqtt-e2e.service'
