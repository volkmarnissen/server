
#!/usr/bin/bash 
if pgrep nginx
then 
  pkill nginx
fi
# Wait for kill 100ms
sleep 0.1
if [ ! -w "/var/lib/nginx" ]
then
  echo "/var/lib/nginx must be writable for the current user"
else
  nohup /usr/sbin/nginx -c e2e/nginx/nginx.conf  -p . 2>&1 >e2e/temp/nginx.log &
fi