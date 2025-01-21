
#!/usr/bin/bash 
set -e
if pgrep nginx
then 
  pkill nginx
fi

if [ "$1" == "stop" ]; then
  exit 0
fi
if [ ! -w "/var/lib/nginx" ]
then
  echo "/var/lib/nginx must be writable for the current user"
else
  # Wait for kill 100ms
  sleep 0.1
  nohup /usr/sbin/nginx -c e2e/nginx/nginx.conf  -p . 2>&1 >e2e/temp/nginx.log &
fi