#!/bin/sh
# ports: localhost:
# 3000 modbus2mqtt
# 3001 mqtt
# 3002 Modbus Tcp
# 3003 mqtt allow anonymous
# 80 homeassistant supervisor
BASEDIR=$(dirname "$0")
# .../server/e2e
cd $BASEDIR
# Root part START
sudo apt-get install -y nginx mosquitto mosquitto-clients
sudo rm /etc/nginx/sites-enabled/default
WWWROOT=temp/www-root
mkdir -p $WWWROOT/services/mqtt
echo configure nginx
bash -c 'cat >'$WWWROOT'/services/mqtt/mqtt.json <<EOF
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
sudo systemctl daemon-reload
sudo systemctl stop mosquitto.service
sudo systemctl restart nginx.service
# Root part END

rm -rf temp/yaml-dir

YAMLDIR=temp/yaml-dir-tcp
BUSSES=$YAMLDIR/local/busses/bus.0
mkdir -p $BUSSES
mkdir -p temp/yaml-dir
export SERVICES=~/.config/systemd/user/
mkdir -p $SERVICES
mkdir -p temp/ssl
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

export CWD=`pwd`
export MOSQUITTO_DIR=${CWD}/mosquitto
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
Description=Modbus <=> MQTT e2e test server
After=network.target
StartLimitIntervalSec=1
[Service]
Type=simple
ExecStart=/usr/bin/env sh -c "|script|" 
[Install]
WantedBy=multi-user.target
EOF7'  | sed -e "s:|script|:${CWD}/modbus2mqtt-server.sh:g"| bash -c 'cat >'$SERVICES'/modbus2mqtt-e2e.service'
bash -c '
cat <<EOF8
[Unit]
Description=Modbus <=> MQTT e2e test server
After=network.target
StartLimitIntervalSec=1
[Service]
Type=simple
ExecStart=/usr/bin/env sh -c "|script|" 
[Install]
WantedBy=multi-user.target
EOF8'  | sed -e "s:|script|:${CWD}/modbus2mqtt-tcp-server.sh:g" | bash -c 'cat >'$SERVICES'/modbus2mqtt-tcp-server.service'

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
ExecStart=/usr/sbin/mosquitto -c |mosquittodir|/homeassistant .conf
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
ExecStartPre=/bin/mkdir -m 740 -p |mosquittodir|/log/mosquitto
[Install]
EOF9' | sed -e "s:|mosquittodir|:${MOSQUITTO_DIR}:g" >$SERVICES'/mosquitto.service'

systemctl --user daemon-reload
systemctl --user restart modbus2mqtt-tcp-server.service
systemctl --user restart modbus2mqtt-e2e.service
systemctl --user restart mosquitto.service

# sudo systemctl stop nginx.service
# systemctl --user status mosquitto.service
# systemctl --user status modbus2mqtt-tcp-server.service
# systemctl --user status modbus2mqtt-e2e.service
