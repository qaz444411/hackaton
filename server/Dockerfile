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

# uploads-data 볼륨이 붙는 경로를 이미지 안에 미리 만들어 둔다.
# 도커는 "이미지에 그 경로가 있을 때만" 소유권/권한을 새 named volume 에 복사한다.
# 이게 없으면 빈 볼륨이 root:root 로 생기고, USER node(uid 1000) 가
# user.routes.js 의 mkdirSync('/app/uploads/avatars') 에서 EACCES 로 죽는다.
# (실제로 배포 후 api 가 107회 재시작하며 502 를 냈다)
RUN mkdir -p /app/uploads/avatars

# 루트로 돌리지 않는다 (node 이미지에 이미 있는 계정)
RUN chown -R node:node /app
USER node

EXPOSE 4000
CMD ["node", "src/app.js"]
