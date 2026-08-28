# ---------------------------------------------------------------
# 1단계: React 빌드
#   VITE_* 값은 런타임이 아니라 "빌드 시점"에 번들에 박힌다.
#   그래서 반드시 build arg 로 넘겨야 한다. (index.html 의 %VITE_KAKAO_JS_KEY% 치환 포함)
# ---------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE=/api
ARG VITE_SOCKET_URL=/
ARG VITE_KAKAO_JS_KEY
ENV VITE_API_BASE=$VITE_API_BASE \
    VITE_SOCKET_URL=$VITE_SOCKET_URL \
    VITE_KAKAO_JS_KEY=$VITE_KAKAO_JS_KEY

RUN npm run build

# ---------------------------------------------------------------
# 2단계: nginx 로 정적 서빙 + API/소켓 프록시
#   443 블록은 인증서가 실제로 있을 때만 켜진다 (40-enable-ssl.sh).
#   덕분에 인증서 발급 전이나 새 서버에서도 80 으로는 항상 뜬다.
# ---------------------------------------------------------------
FROM nginx:1.27-alpine

ENV TZ=Asia/Seoul

# 80 / 443 이 공유하는 location 설정. conf.d 가 아닌 snippets 에 둔다
# (conf.d/*.conf 는 nginx 가 최상위로 읽어서 location 만 있는 파일은 오류가 난다)
COPY app-locations.conf        /etc/nginx/snippets/app-locations.conf
COPY nginx.conf                /etc/nginx/conf.d/default.conf
# 인증서가 있을 때만 conf.d 로 복사되는 443 템플릿
COPY nginx-ssl.conf.template   /etc/nginx/ssl-available/nginx-ssl.conf.template
# nginx 공식 이미지는 기동 전에 /docker-entrypoint.d/*.sh 를 실행한다
COPY docker-entrypoint.d/40-enable-ssl.sh /docker-entrypoint.d/40-enable-ssl.sh
RUN chmod +x /docker-entrypoint.d/40-enable-ssl.sh

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80 443
