#!/bin/sh
# ---------------------------------------------------------------
# 인증서가 있으면 443 블록을 켜고, 없으면 80 만으로 기동한다.
#
# nginx 는 ssl_certificate 파일이 없으면 아예 시작을 못 한다.
# 443 블록을 이미지에 고정으로 넣어두면 인증서 발급 전에는 컨테이너가
# 부팅 루프에 빠지고, 그 사이 80 까지 죽어 사이트 전체가 내려간다.
# 그래서 "있으면 켠다" 방식으로 둔다. 새 서버에 처음 배포할 때도
# HTTP 로는 항상 뜬다.
# ---------------------------------------------------------------
set -eu

CONF_D=/etc/nginx/conf.d
TEMPLATE=/etc/nginx/ssl-available/nginx-ssl.conf.template
CERT="/etc/letsencrypt/live/${DOMAIN:-}/fullchain.pem"

if [ -z "${DOMAIN:-}" ]; then
  echo "[ssl] DOMAIN 이 비어 있다 — HTTP(80) 로만 기동한다"
  exit 0
fi

if [ ! -f "$CERT" ]; then
  echo "[ssl] 인증서 없음 ($CERT) — HTTP(80) 로만 기동한다"
  rm -f "$CONF_D/ssl.conf"
  exit 0
fi

echo "[ssl] 인증서 확인됨 — HTTPS(443) 활성화: $DOMAIN"
export DOMAIN
envsubst '${DOMAIN}' < "$TEMPLATE" > "$CONF_D/ssl.conf"

# HTTPS 가 확인된 뒤에만 80 -> 443 리다이렉트를 켠다.
# ACME 챌린지 경로(^~)는 nginx.conf 에서 먼저 매칭되므로 갱신에는 영향이 없다.
if [ "${REDIRECT_HTTP_TO_HTTPS:-0}" = "1" ]; then
  echo "[ssl] 80 -> 443 리다이렉트 활성화"
  cat > "$CONF_D/redirect.conf" <<REDIR
server {
    listen 80;
    server_name ${DOMAIN};
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type "text/plain";
        try_files \$uri =404;
    }
    location / { return 301 https://\$host\$request_uri; }
}
REDIR
else
  rm -f "$CONF_D/redirect.conf"
fi
