# ---------------------------------------------------------------
# API 서버 (Express + Socket.IO)
# 외부에 포트를 열지 않는다. nginx 컨테이너만 도커 내부망으로 접근한다.
# ---------------------------------------------------------------
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV TZ=Asia/Seoul

# 의존성 레이어를 따로 둬야 소스만 고쳤을 때 npm ci 를 다시 안 한다
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# 루트로 돌리지 않는다 (node 이미지에 이미 있는 계정)
RUN chown -R node:node /app
USER node

EXPOSE 4000
CMD ["node", "src/app.js"]
