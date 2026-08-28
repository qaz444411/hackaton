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
#   node_modules 없이 정적 파일만 남으므로 이미지가 작다.
# ---------------------------------------------------------------
FROM nginx:1.27-alpine

ENV TZ=Asia/Seoul
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
