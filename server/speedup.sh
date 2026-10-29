#!/bin/bash
# Ускорение evnews.site для России: HTTP/2, сжатие, прокси к Supabase и dns.google через сервер.
set -uo pipefail
SB=bsgidggxlzinntgdnxgt.supabase.co
CONF=/etc/nginx/sites-available/evnews
LE=/etc/letsencrypt/live/evnews.site

echo "==> Проверяю, доступен ли Supabase и dns.google с сервера"
SBCODE=$(curl -s -o /dev/null -m 10 -w "%{http_code} %{time_total}s" https://$SB/auth/v1/health)
DNSCODE=$(curl -s -o /dev/null -m 10 -w "%{http_code} %{time_total}s" "https://dns.google/resolve?name=mail.ru&type=MX")
echo "    supabase: $SBCODE    dns.google: $DNSCODE"

echo "==> Скачиваю шрифт Inter на сервер (вместо Google Fonts)"
FONTS=/var/www/evnews-fonts
mkdir -p "$FONTS"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
if curl -sf -m 30 -A "$UA" "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" -o "$FONTS/google.css"; then
  for u in $(grep -o 'https://fonts.gstatic.com/[^)]*\.woff2' "$FONTS/google.css" | sort -u); do
    curl -sf -m 30 -o "$FONTS/$(basename "$u")" "$u" || echo "    не скачался $u"
  done
  sed -E 's#https://fonts.gstatic.com/[^)]*/([^/)]+\.woff2)#/fonts/\1#g' "$FONTS/google.css" > "$FONTS/inter.css"
  chmod -R a+rX "$FONTS"
  echo "    шрифтов: $(ls "$FONTS"/*.woff2 2>/dev/null | wc -l), размер $(du -sh "$FONTS" | cut -f1)"
else
  echo "    !!! Google Fonts с сервера не скачался"
fi

cp "$CONF" /root/evnews.nginx.bak

cat > "$CONF" <<EOF
map \$http_upgrade \$evn_upgrade { default upgrade; '' close; }

server {
    listen 80;
    listen [::]:80;
    server_name evnews.site www.evnews.site;
    location /.well-known/acme-challenge/ { root /var/www/evnews; }
    location / { return 301 https://evnews.site\$request_uri; }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name evnews.site www.evnews.site;

    ssl_certificate     $LE/fullchain.pem;
    ssl_certificate_key $LE/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    if (\$host = www.evnews.site) { return 301 https://evnews.site\$request_uri; }

    root /var/www/evnews;
    index index.html;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 512;
    gzip_types text/css text/plain application/javascript application/json image/svg+xml;

    location / { try_files \$uri \$uri/ =404; }
    location ~ \.html?\$ { add_header Cache-Control "no-cache"; }
    location /assets/ { expires 30d; }
    location /fonts/ { alias /var/www/evnews-fonts/; expires 365d; }
    location /data/ { expires 1m; }

    resolver 1.1.1.1 8.8.8.8 valid=300s ipv6=off;
    resolver_timeout 5s;

    # Supabase через сервер: аккаунты, чат, ИИ-пересказы (и вебсокеты)
    location /sb/ {
        set \$sb_up https://$SB;
        rewrite ^/sb/(.*)\$ /\$1 break;
        proxy_pass \$sb_up;
        proxy_ssl_server_name on;
        proxy_ssl_name $SB;
        proxy_set_header Host $SB;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$evn_upgrade;
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        client_max_body_size 10m;
    }

    # Проверка почты при регистрации (DNS-запросы) через сервер
    location = /dns/resolve {
        set \$dns_up https://dns.google;
        rewrite ^ /resolve break;
        proxy_pass \$dns_up;
        proxy_ssl_server_name on;
        proxy_ssl_name dns.google;
        proxy_set_header Host dns.google;
        proxy_read_timeout 10s;
    }
}
EOF

if nginx -t 2>/dev/null; then
  systemctl reload nginx && echo "==> nginx обновлён: HTTP/2, сжатие, /sb/ и /dns/resolve"
else
  nginx -t; cp /root/evnews.nginx.bak "$CONF"; systemctl reload nginx
  echo "!!! Ошибка в настройке, вернул старую. Пришли вывод выше."; exit 1
fi

# Размер пакетов 1400 и после перезагрузки
echo "@reboot root /usr/sbin/ip link set dev eth0 mtu 1400" > /etc/cron.d/evnews-mtu
ip link set dev eth0 mtu 1400

echo "==> Проверка через сайт"
curl -s -o /dev/null -w "    сайт: %{http_code} %{http_version}\n" --resolve evnews.site:443:127.0.0.1 https://evnews.site/
curl -s -o /dev/null -w "    /sb/: %{http_code}\n" --resolve evnews.site:443:127.0.0.1 https://evnews.site/sb/auth/v1/health
curl -s -o /dev/null -w "    /fonts/: %{http_code}\n" --resolve evnews.site:443:127.0.0.1 https://evnews.site/fonts/inter.css
curl -s -o /dev/null -w "    /dns/: %{http_code}\n" --resolve evnews.site:443:127.0.0.1 "https://evnews.site/dns/resolve?name=mail.ru&type=MX"
echo "Готово"
