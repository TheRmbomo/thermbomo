server {
  listen 80 default_server;
  listen [::]:80 default_server;
  server_name excelsiorindustries.com www.excelsiorindustries.com;
  return 302 https://$server_name$request_uri;
}

server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name excelsiorindustries.com www.excelsiorindustries.com;

  ssl_certificate  /etc/ssl/certs/www_excelsiorindustries_com.crt;
  ssl_certificate_key /etc/ssl/certs/excelsiorindustries.key;

  ssl_session_cache shared:SSL:20m;
  ssl_session_timeout 180m;
  ssl_protocols TLSv1 TLSv1.1 TLSv1.2;
  ssl_prefer_server_ciphers on;
  ssl_ciphers ECDH+AESGCM:ECDH+AES256:ECDH+AES128:DHE+AES128:!ADH:!AECDH:!MD5;
  ssl_dhparam /etc/nginx/cert/dhparam.pem;
  ssl_stapling on;
  ssl_stapling_verify on;
  resolver 8.8.8.8 8.8.4.4;

  add_header X-XSS-Protection "1; mode=block" always;
  add_header Strict-Transport-Security "max-age=31536000" always;
  add_header Content-Security-Policy "default-src 'self'; connect-src 'self' wss://*.excelsiorindustries.com; script-src 'self' 'sha256-skhUXqsFTUiU1ZzwAuz6RYm3TVIfaCjgbk2Pmh2XMPo=' https://code.jquery.com/ https://connect.facebook.com/en_US/messenger.Extensions.js; img-src 'self' data:; frame-src https://www.youtube.com/; frame-ancestors https://www.messenger.com/ https://www.facebook.com/;" always;

  location ~ ^/(assets/|images/|img/|javascript/|js/|css/|stylesheets/|flash/|media/|static/|robots.txt|humans.txt|favicon.ico) {
    root /srv/thermbomo/public/;
    access_log off;
    expires 24h;
  }

  location / {
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Host $http_host;
    proxy_set_header X-NginX-Proxy true;
    proxy_pass http://127.0.0.1:3000;
    proxy_redirect off;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    proxy_redirect off;
    proxy_set_header   X-Forwarded-Proto $scheme;
  }
}