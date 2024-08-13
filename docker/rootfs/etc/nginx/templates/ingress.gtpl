server {
    listen {{ .interface }}:{{ .port }} default_server;

    include /etc/nginx/includes/server_params.conf;
    include /etc/nginx/includes/proxy_params.conf;

    location / {
        allow   172.30.32.2;
        deny    all;

        proxy_pass http://backend;
    }
    location {{ .ingress_entry }} {
        allow   172.30.32.2;
        deny    all;

        proxy_pass http://backend;
        proxy_pass_header Content-Type; 
        rewrite  ^{{ .ingress_entry }}(.*)  /$1 break;
        try_files $uri$args $uri$args/ $uri/ /index.html;
        
    }        

}
