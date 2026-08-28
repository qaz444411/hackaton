#!/bin/sh
# ---------------------------------------------------------------
# 인증서 유무와 REDIRECT 설정에 따라 nginx 설정을 조립한다.
#
#   인증서 없음            -> 80 앱 서빙만. 443 없음.
#   인증서 있음 + REDIRECT=0 -> 80 앱 서빙 + 443 앱 서빙 (전환기)
#   인증서 있음 + REDIRECT=1 -> 80 은 https 로 301 + 443 앱 서빙
#
# nginx 는 ssl_certificate 파일이 없으면 기동 자체를 못 한다. 443 블록을
# 이미지에 고정으로 넣으면 발급 전에 컨테이너가 부팅 루프에 빠지고 80 까지
# 같이 내려간다. 그래서 "있으면 켠다" 방식으로 둔다.
# ---------------------------------------------------------------
set -eu

CONF_D=/etc/nginx/conf.d
AVAIL=/etc/nginx/http-available
CERT="/etc/letsencrypt/live/${DOMAIN:-}/fullchain.pem"

# 매번 깨끗한 상태에서 다시 조립한다 (이전 기동의 잔재를 남기지 않는다)
rm -f "$CONF_D/default.conf" "$CONF_D/ssl.conf"

if [ -z "${DOMAIN:-}" ] || [ ! -f "$CERT" ]; then
  echo "[ssl] 인증서 없음 (DOMAIN='${DOMAIN:-}') — HTTP(80) 로 앱만 서빙한다"
  cp "$AVAIL/app.conf" "$CONF_D/default.conf"
  exit 0
fi

echo "[ssl] 인증서 확인됨 — HTTPS(443) 활성화: $DOMAIN"
export DOMAIN
envsubst '${DOMAIN}' < "$AVAIL/ssl.conf.template" > "$CONF_D/ssl.conf"

if [ "${REDIRECT_HTTP_TO_HTTPS:-0}" = "1" ]; then
  echo "[ssl] 80 -> https://$DOMAIN 리다이렉트 활성화 (IP 접속 포함)"
  envsubst '${DOMAIN}' < "$AVAIL/redirect.conf.template" > "$CONF_D/default.conf"
else
  echo "[ssl] 리다이렉트 꺼짐 — 80 도 앱을 그대로 서빙한다"
  cp "$AVAIL/app.conf" "$CONF_D/default.conf"
fi
