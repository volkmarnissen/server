    #!/command/with-contenv sh
    [ ! -d "/config/modbus2mqtt" ] && { 
        mkdir -p /config/modbus2mqtt; 
        [ -d /data/local ] && cp -R /data/local/* /config/modbus2mqtt/; 
    }
    [ ! -d "/data/public" ] && mkdir -p /data/public; 
    chown -R modbus2mqtt:dialout /config/modbus2mqtt
    chown -R modbus2mqtt:dialout /data/public
    touch /ssl/secrets.txt
    chown -R modbus2mqtt:dialout /ssl/secrets.txt

 