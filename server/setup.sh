#!/bin/bash
# Установка сайта ev.news на сервер Ubuntu 24.04: nginx + бесплатный SSL (Let's Encrypt)
# + автообновление сайта и новостей с GitHub каждые 5 минут.
#
# Запуск на сервере под root:   bash setup-evnews.sh
# ВАЖНО: перед запуском A-записи домена (и www) уже должны указывать на IP этого сервера.
set -euo pipefail

# ==== Настройки ====
DOMAIN="evnews.site"                      # твой домен (без www)
EMAIL="daniil.sedykh@list.ru"             # почта для уведомлений Let's Encrypt
REPO_URL="https://github.com/dsdsnfdjndfjhbhgfd-ops/country-news.git"
# ===================

WEB=/var/www/evnews
GITDIR=/opt/evnews/repo.git
UPDATER=/usr/local/bin/evnews-update

echo "==> Ставлю nginx, git, certbot"
apt-get update -q
DEBIAN_FRONTEND=noninteractive apt-get install -y -q nginx git rsync certbot python3-certbot-nginx

echo "==> Скрипт обновления сайта"
cat > "$UPDATER" <<EOF
#!/bin/bash
# Берёт свежий код (ветка main) и новости (ветка data) с GitHub и собирает сайт в $WEB
set -euo pipefail
exec 9>/run/evnews-update.lock; flock -n 9 || exit 0
G="$GITDIR"
[ -d "\$G" ] || { git init -q --bare "\$G"; git -C "\$G" remote add origin "$REPO_URL"; }
git -C "\$G" fetch -q --depth 1 origin +refs/heads/main:refs/heads/main
git -C "\$G" fetch -q --depth 1 origin +refs/heads/data:refs/heads/data 2>/dev/null || true

T=\$(mktemp -d); trap 'rm -rf "\$T"' EXIT
git -C "\$G" archive main index.html news.html account.html article.html ratings.html chat.html admin.html assets | tar -x -C "\$T"
mkdir -p "\$T/data"
if git -C "\$G" rev-parse -q --verify refs/heads/data >/dev/null; then
  git -C "\$G" archive data | tar -x -C "\$T/data"
elif git -C "\$G" cat-file -e main:data 2>/dev/null; then
  git -C "\$G" archive main data | tar -x -C "\$T"
fi
rm -rf "\$T/data/full"
# Версия в ссылках на скрипты и стили, чтобы браузеры сразу брали новый код (как на GitHub Pages)
SHA=\$(git -C "\$G" rev-parse --short=8 main)
sed -i -E "s#(src|href)=\"(assets/[^\"?]+\.(js|css))\"#\1=\"\2?v=\$SHA\"#g" "\$T"/*.html

mkdir -p "$WEB"
rsync -a --delete-delay "\$T/" "$WEB/"
chmod -R a+rX "$WEB"
EOF
chmod +x "$UPDATER"
"$UPDATER"
echo "    Сайт собран в $WEB"

echo "==> Настройка nginx"
cat > /etc/nginx/sites-available/evnews <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;
    root $WEB;
    index index.html;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    location / { try_files \$uri \$uri/ =404; }
    location ~ \.html?\$ { add_header Cache-Control "no-cache"; }
    location /assets/ { expires 30d; }
    location /data/ { expires 1m; }
}
EOF
ln -sf /etc/nginx/sites-available/evnews /etc/nginx/sites-enabled/evnews
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> Файрвол"
if command -v ufw >/dev/null; then
  ufw allow OpenSSH >/dev/null; ufw allow 'Nginx Full' >/dev/null; ufw --force enable >/dev/null
fi

echo "==> Автообновление: каждые 5 минут + ежедневная чистка"
cat > /etc/cron.d/evnews <<EOF
*/5 * * * * root $UPDATER >/dev/null 2>&1
17 4 * * * root git -C $GITDIR gc -q --prune=now >/dev/null 2>&1
EOF

echo "==> SSL-сертификат Let's Encrypt"
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect

echo
echo "Готово! Открой https://$DOMAIN"
echo "Сертификат продлевается сам (certbot.timer). Новости обновляются каждые 5 минут."
