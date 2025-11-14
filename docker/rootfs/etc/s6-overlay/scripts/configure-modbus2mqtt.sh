#!/command/with-contenv sh
# the shared volumes may not be mounted when this script runs
# if they are mounted, ensure required directories have correct ownership as 
# this script runs as root
# Migration from old config location /data/local to /config/modbus2mqtt
# If /config/modbus2mqtt does not exist, copy configuration from /data/local
[ ! -d "/config/modbus2mqtt" ] && { 
    mkdir -p /config/modbus2mqtt; 
    [ -d /data/local ] && cp -R /data/local/* /config/modbus2mqtt/; 
}
[ ! -d "/data/public" ] && mkdir -p /data/public; 
chown -R modbus2mqtt:dialout /config/modbus2mqtt
chown -R modbus2mqtt:dialout /data/public
touch /ssl/secrets.txt
chown -R modbus2mqtt:dialout /ssl/secrets.txt

 