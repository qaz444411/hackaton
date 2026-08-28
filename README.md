# 랜덤 밥친구 — React + Node.js + MySQL 연동 프로젝트

요구사항_최종.pdf / 랜덤밥친구_schema_mysql.sql / css파일_최종.zip 기준으로 만든 풀스택 스캐폴드.

> 현재 진행 상황·설치 모듈·검증 결과·트러블슈팅은 **[PROGRESS.md](PROGRESS.md)** 에 정리돼 있다.

```
bapfriend/
├── db/     01_schema_v1.sql        # 기존 스키마(첨부 원본)
│           02_schema_patch_v2.sql  # 요구사항 최종본 반영 패치
│           03_schema_patch_v3.sql  # 지도 임의 좌표 마커(map_spot) ★신규 · 재실행 안전
├── server/ Node.js(Express) + mysql2 + Socket.IO
└── client/ React 18 + Vite + React Router + React Query
```

## 1. 실행 순서

```bash
# ① DB
mysql -u root -p < db/01_schema_v1.sql
mysql -u root -p bapfriend < db/02_schema_patch_v2.sql

# ② 백엔드
cd server && cp .env.example .env   # DB/JWT/KAKAO/GEMINI 키 입력
npm install && npm run dev          # http://localhost:4000

# ③ 프론트
cd client && cp .env.example .env   # VITE_KAKAO_JS_KEY 입력
npm install && npm run dev          # http://localhost:5173
```

## 2. 스키마 업데이트(02_schema_patch_v2.sql) 요약

| 구분 | 내용 |
|---|---|
| users | email / age / gender / region_code / profile_image / signup_step 추가 |
| region_code | 선호 지역 코드 테이블 신규 |
| restaurant | rating / review_count / category_name / phone / place_url / synced_at (카카오 캐시) + 좌표 인덱스 |
| match_proposal | read_at 추가 → 보관함 NEW 배지 |
| chat_suggested_question | 제미나이 추천 질문 로그 (신규) |
| user_report | 신고하고 나가기 (신규) |
| user_notification_setting | 마이페이지 알림 설정 (신규) |
| 뷰 | v_restaurant_recruiting / v_restaurant_buddy / v_inbox / v_chat_list / v_user_stats |
| 함수 | fn_taste_match_rate(a,b) — MBTI30 + 맛30 + 관심사25 + 조건15 = 취향 일치율 |

기존 트리거·프로시저(sp_accept_proposal 등)는 그대로 사용하며,
meal_match / match_participant 는 **직접 INSERT 하지 않고 반드시 sp_accept_proposal 을 호출**한다.

## 3. 화면 ↔ API ↔ 테이블 매핑

| 화면 (client/src/pages) | API | 주요 테이블/뷰 |
|---|---|---|
| IntroPage | – | – |
| SignUpPage | `GET /auth/check`, `POST /auth/signup` | users, region_code |
| ProfileSetupPage | `POST /users/profile` | user_profile, user_interest |
| LoginPage | `POST /auth/login` | users |
| HomePage | `GET /matching/home`, `GET /assistant/starters` | v_home_confirmed_match, v_inbox |
| AssistantPage ★ | `GET /assistant/status`, `POST /assistant/chat` | – (제미나이, 이력은 localStorage) |
| PreferencePage | `POST /matching/draft`, `POST /matching/:id/start` | matching_request |
| MatchingProgressPage | `GET /matching/:id/candidates` (폴링) | matching_request, matching_status_history |
| MatchResultPage | `POST /proposals` | match_proposal + fn_taste_match_rate |
| MapPage | `GET /restaurants?lat&lng`, `GET/POST /spots` | v_restaurant_recruiting, v_spot_recruiting |
| RestaurantListPage / RecruitPage | `GET/POST /restaurants` | restaurant |
| BuddyListPage | `GET /restaurants/:id/buddies` 또는 `/spots/:id/buddies` | v_restaurant_buddy, v_spot_buddy |
| ProposalWaitPage | `GET /proposals/:id` (폴링) | match_proposal |
| InboxPage | `GET /proposals`, `/accept`, `/decline`, `/read` | v_inbox, sp_accept_proposal |
| ChatListPage | `GET /chat/rooms` | v_chat_list |
| ChatRoomPage | `GET/POST /chat/rooms/:id/messages`, Socket.IO | chat_room, chat_message |
| MyPage | `GET /users/me/mypage`, `/history` | v_user_stats, user_notification_setting |

## 4. 카카오 지도 API — 어디에 넣나

키가 **두 종류**이고 넣는 위치가 다르다.

1. **JavaScript 키 (프론트)** — 지도 렌더링·핀 전용
   - `client/.env` → `VITE_KAKAO_JS_KEY`
   - `client/index.html` 의 SDK `<script ...appkey=%VITE_KAKAO_JS_KEY%&libraries=services,clusterer&autoload=false>`
   - 사용처: `client/src/hooks/useKakaoMap.js` (지도 생성, `renderPins` 로 모집 인원 핀 오버레이)
     → `MapPage.jsx` 에서 호출
   - 카카오 developers 콘솔에서 **플랫폼 > Web 사이트 도메인**에 `http://localhost:5173` 등록 필수.

2. **REST API 키 (서버 전용, 절대 프론트에 두지 말 것)** — 장소 검색
   - `server/.env` → `KAKAO_REST_API_KEY`
   - 사용처: `server/src/services/kakao.service.js` (`/v2/local/search/keyword|category`, `category_group_code=FD6`)
   - 호출 경로: `GET /api/restaurants` → 우리 DB 조회 → 결과 부족 시 카카오 검색 → `restaurant` 테이블에 upsert(캐시).
     즉 프론트는 카카오를 직접 호출하지 않고, 검색은 항상 서버 프록시를 탄다.

## 5. 제미나이 챗봇 API — 어디에 넣나

제미나이는 **두 곳**에서 쓴다. ① 홈 화면 AI 도우미(자유 대화) ② 채팅방 추천 질문.

### 5-0. 키 발급과 모델 설정

1. https://aistudio.google.com/apikey → 구글 계정 로그인
2. **API 키 만들기** → 새 프로젝트 또는 기존 프로젝트 선택
3. 키를 `server/.env` 의 `GEMINI_API_KEY` 에 붙여넣기
4. `npm.cmd run gemini:check` 로 **실제 되는 모델**을 확인하고 `GEMINI_MODEL` 에 넣기
5. **서버 재시작** (nodemon 은 `.env` 를 감시하지 않는다)

> 구글이 모델을 수시로 종료한다. `gemini-2.0-flash` / `gemini-2.5-flash` 는 신규 발급 키에서
> 404 가 난다. 현재 확인된 동작 모델은 `gemini-3.6-flash`.
> 설정 모델이 404/503 이면 코드가 자동으로 다음 후보로 폴백하므로 챗봇이 죽지는 않는다.

### 5-1. 홈 화면 AI 도우미

- 구현: `server/src/services/gemini.service.js` 의 `chatWithAssistant()`
- 라우트: `server/src/routes/assistant.routes.js`
  - `GET /api/assistant/status` — 키 설정 여부(UI 배너용)
  - `GET /api/assistant/starters` — 상황별 추천 질문 3개
  - `POST /api/assistant/chat` — 대화 (`message` + `history`)
- 화면: `client/src/pages/AssistantPage.jsx` (홈 하단 카드 → `/assistant`)
- 대화 이력은 브라우저 `localStorage` 에 두고 매번 함께 보낸다 → **서버 무상태, DB 변경 없음**
- 시스템 프롬프트에 앱 기능 사실관계를 넣어 없는 기능을 지어내지 않게 했다
- 키가 없으면 `source:'NO_KEY'` 로 "키를 넣어달라"는 안내를 화면에 그대로 띄운다

### 5-2. 채팅방 추천 질문

- 키: `server/.env` → `GEMINI_API_KEY`, `GEMINI_MODEL`
- 구현: `server/src/services/gemini.service.js` (`@google/generative-ai`, JSON 응답 강제, 실패 시 FALLBACK 질문 3개)
- 라우트: `GET /api/chat/rooms/:matchId/suggestions` (`?refresh=1` = "다른 질문 보기")
  - 두 사람의 **공통 관심사 / 음식 종류 / 식당명만** 프롬프트로 전달 (대화 원문은 보내지 않음 = 개인정보 최소화)
  - 결과를 `chat_suggested_question` 에 저장 → 캐시 및 사용 로그(`used_at`)
- 화면: `client/src/pages/ChatRoomPage.jsx` 의 ✨ 버튼 → `.suggest` 패널 → "입력창에 넣기"
- 프론트에는 제미나이 키가 존재하지 않는다.

## 6. 현재 위치 + 지도 마커 매칭 (v3)

### 6-1. 흐름

```
지도 길게 누르기 → 마커 이름 입력 → map_spot 생성
   → 취향 선택(PreferencePage) → matching_request(matching_type='SPOT', spot_id)
   → 다른 사람 지도에 "N명 모집 중" 핀으로 노출 (v_spot_recruiting)
   → 핀 탭 → 밥친구 목록(v_spot_buddy, 취향 일치율 순)
   → 매칭 요청 → 수락(sp_accept_proposal) → meal_match.spot_id 보존 + 채팅방 자동 생성
```

식당에 붙이는 기존 흐름(`matching_type='MAP'`, `restaurant_id`)은 그대로 살아 있다.
둘은 같은 지도에 색만 다른 핀으로 함께 뜬다 (식당=주황, 내 마커=파랑).

| API | 용도 |
|---|---|
| `GET /api/spots?lat&lng&radius` | 주변 마커 + 모집 인원 |
| `POST /api/spots` | 마커 생성 (15m 이내 동명 마커는 재사용해 난립 방지) |
| `GET /api/spots/:id` | 마커 상세 + 참여자 미리보기 |
| `GET /api/spots/:id/buddies` | 마커별 밥친구 + `fn_taste_match_rate` |

### 6-2. 위치 권한 — **https 가 필수다**

모바일 브라우저는 `http://` 를 secure context 로 치지 않아서 **권한 창조차 띄우지 않고**
`geolocation` 을 차단한다. `http://<PC IP>:5173` 으로 열면 현재 위치가 조용히 실패한다.

그래서 휴대폰 테스트는 HTTPS 터널로 한다.

```powershell
# ① Vite 를 터널 모드로 재시작 (HMR 소켓을 443/wss 로 맞춘다)
cd client; $env:VITE_TUNNEL='1'; npm.cmd run dev

# ② 터널 열기 — 실행하면 https://xxxx.trycloudflare.com 주소를 찍어 준다
powershell -ExecutionPolicy Bypass -File .\start-tunnel.ps1
```

`useMyLocation()` ([client/src/hooks/useKakaoMap.js](client/src/hooks/useKakaoMap.js)) 이
권한 상태를 `granted / denied / insecure / unavailable` 로 구분해서 화면에 이유를 띄운다.
원인을 모른 채 기본 좌표로 폴백되는 일을 없애기 위한 것이다.

> **터널 주소는 실행할 때마다 바뀐다.** 바뀐 주소를 카카오 콘솔 > 플랫폼 > Web 에
> 다시 등록하지 않으면 지도 SDK 가 로드되지 않는다.

### 6-3. 맛집 데이터 — 크롤링이 아니라 공식 API

카카오맵 웹페이지 HTML 파싱은 약관 위반이고 차단된다.
[server/src/services/kakao.service.js](server/src/services/kakao.service.js) 의
**카카오 로컬 API**(`category_group_code=FD6`)를 쓰고, 결과를 `restaurant` 테이블에 캐시한다.

- `GET /api/restaurants` → DB 조회 → 5건 미만이면 카카오 검색(최대 3페이지 45건) → upsert
- **제약: 로컬 API 는 평점/리뷰수를 주지 않는다.** `restaurant.rating` 은 항상 `NULL` 이라
  화면의 `⭐` 는 `-` 로 뜬다. "인기" 판정은 `v_restaurant_recruiting.is_popular`
  (모집 3명 이상)로 대신하고, 상세 평점이 필요하면 `place_url` 로 카카오맵을 연다.

### 6-4. 점검 명령

```powershell
cd server
npm.cmd run db:patch     # v3 패치 적용 (몇 번 돌려도 안전)
npm.cmd run db:check     # v1/v2/v3 적용 상태 실측
npm.cmd run smoke        # 마커→모집→요청→수락→채팅방까지 16개 항목 E2E 검증 후 정리
npm.cmd run smoke:keep   # 검증만 하고 테스트 데이터를 남김(화면에서 눈으로 확인용)
npm.cmd run smoke:clean  # 남은 스모크 데이터만 삭제
```

## 7. 디자인 토큰
`client/src/styles/theme.css` 는 css파일_최종.zip(Figma export)에서 추출한 컬러·라운드·폰트를 CSS 변수로 정리한 것.
페이지 컴포넌트는 모두 이 변수와 `app.css` 의 공통 클래스(.card/.btn/.chip/.bubble 등)를 사용한다.

---

# AWS 배포 (8~12)

여기부터는 EC2에 실제로 올려서 돌아가고 있는 구성이다.
[DEPLOY.md](DEPLOY.md)가 "앱이 서버에 무엇을 요구하는가"를 적은 인수인계 문서라면,
아래는 그 요구사항을 **어떻게 구현했는지**에 대한 기록이다.

## 8. EC2 + Docker 배포

### 8-1. 서비스 주소

| 용도 | 주소 |
|---|---|
| 서비스 | **https://35.86.162.39.nip.io** |
| 헬스체크 | `https://35.86.162.39.nip.io/api/health` → `{"ok":true}` |
| SSH | `ssh -i kiro_package/hackathon-e1-t06-key.pem ubuntu@35.86.162.39` |
| 배포 경로 | `/home/ubuntu/bapfriend` |

### 8-2. 컨테이너 구성

```
        인터넷
          │  :80 / :443
   ┌──────▼───────────────────────────────────┐
   │ web (nginx)                              │
   │   /            → React 빌드 정적파일       │
   │   /api/        → api:4000                │
   │   /socket.io/  → api:4000 (WS 업그레이드)  │
   └──────┬───────────────────────────────────┘
          │ 도커 내부 네트워크 (외부 노출 없음)
   ┌──────▼──────┐      ┌──────────────┐      ┌───────────┐
   │ api (Node)  │─────▶│ db (MySQL 8) │      │ certbot   │
   │   :4000     │      │   :3306      │      │ 인증서 갱신 │
   └─────────────┘      └──────┬───────┘      └───────────┘
                               │ 볼륨 mysql-data
```

**외부에 열리는 포트는 web 의 80/443 뿐이다.** api(4000)·db(3306)은 `expose` 만 써서
도커 내부망에 갇혀 있고, EC2 보안그룹에도 열려 있지 않다.

`nginx.conf` 의 프록시를 [client/vite.config.js](client/vite.config.js)의 개발용 프록시와
같은 모양으로 맞췄다. 덕분에 `VITE_API_BASE=/api`, `VITE_SOCKET_URL=/` 를 그대로 두고
**프론트 코드를 한 줄도 고치지 않고** 배포된다.

### 8-3. 배포 관련 파일

| 파일 | 역할 |
|---|---|
| `docker-compose.yml` | web / api / db / certbot 4개 서비스 + 볼륨 3개 |
| `server/Dockerfile` | `node:20-alpine`, `npm ci --omit=dev`, 비root 실행 |
| `client/Dockerfile` | 멀티스테이지 — node 빌드 → nginx 서빙 |
| `client/nginx.conf` | 80 포트 (앱 서빙 + ACME 챌린지) |
| `client/nginx-redirect.conf.template` | 80 포트 (https 리다이렉트 모드) |
| `client/nginx-ssl.conf.template` | 443 포트 |
| `client/app-locations.conf` | 80/443 이 **함께 include** 하는 공통 location |
| `client/docker-entrypoint.d/40-enable-ssl.sh` | 인증서 유무에 따라 설정을 조립 |
| `deploy.sh` | 수동 배포 스크립트 |
| `.github/workflows/deploy.yml` | 자동 배포 |
| `.env.production.example` | 배포용 환경변수 템플릿 |

> `app-locations.conf` 를 80/443 이 공유하는 이유: `/socket.io` 의 `Upgrade` 헤더가
> 한쪽에만 빠지면 **채팅 실시간 전송만 조용히 죽는다.** 설정을 한 곳에만 두어
> 구조적으로 막았다. `conf.d` 가 아니라 `snippets` 에 두는 이유는 nginx 가
> `conf.d/*.conf` 를 최상위로 읽어서 location 만 있는 파일은 오류가 나기 때문이다.

### 8-4. 환경변수

서버의 `.env.production` 은 **git 이 추적하지 않는다**(`.gitignore`). 그래서
`git reset --hard` 를 해도, 재배포를 해도 살아남는다. 값을 바꿀 때는 서버에서 직접 고친다.

```bash
ssh -i kiro_package/hackathon-e1-t06-key.pem ubuntu@35.86.162.39
cd ~/bapfriend
cp .env.production.example .env.production   # 최초 1회만
vi .env.production && chmod 600 .env.production
```

`VITE_*` 는 **런타임이 아니라 빌드 시점에 번들로 구워진다.** 값을 바꾸면 반드시 재빌드해야 한다.
프론트에 들어가는 키는 카카오 JS 키 하나뿐이고(도메인 제한이 걸려 있어 노출돼도 무방),
`GEMINI_API_KEY` / `KAKAO_REST_API_KEY` 는 서버 컨테이너에만 주입된다.
`.dockerignore` 로 `.env` 가 이미지에 들어가는 것도 막았다.

### 8-5. DB 초기화와 패치

`db/*.sql` 을 MySQL 컨테이너의 `/docker-entrypoint-initdb.d` 에 마운트해서
`01` → `02` → `03` → `04` 순으로 **자동 실행**된다(최초 1회, 데이터가 없을 때만).
공식 이미지가 `mysql` CLI 로 돌리므로 `DELIMITER` 블록(트리거·프로시저)도 그대로 동작한다.

**이미 데이터가 있는 DB 는 자동 적용되지 않는다.** 새 패치는 직접 돌린다.

```bash
docker compose --env-file .env.production exec api npm run db:patch4
```

`01_schema_v1.sql` 의 `ev_expire_pending` 이벤트 때문에 compose 에서
`--event-scheduler=ON` 을 켜 두었다. 이게 없으면 만료된 요청이 정리되지 않는다.

## 9. HTTPS

### 9-1. 왜 nip.io 인가

모바일 브라우저는 `http://` 를 secure context 로 치지 않아 **권한 창도 띄우지 않고**
geolocation 을 차단한다(README 6-2 참고). 지도의 "현재 위치"를 쓰려면 https 가 필수다.

그런데 **IP 주소로는 인증서를 발급받을 수 없다.** 도메인이 필요하다.
`nip.io` 는 `<IP>.nip.io` 를 그 IP 로 해석해 주는 무료 와일드카드 DNS다.

```
35.86.162.39.nip.io  →  35.86.162.39
```

안 되면 `sslip.io` 로 대체할 수 있다(`35.86.162.39.sslip.io`).

### 9-2. 인증서 없이도 사이트가 죽지 않는 구조

nginx 는 `ssl_certificate` 파일이 없으면 **기동 자체를 못 한다.** 443 블록을 이미지에
고정으로 넣으면 발급 전에 컨테이너가 부팅 루프에 빠지고 **80 까지 같이 내려간다.**

그래서 443 블록을 템플릿으로 두고, 진입 스크립트가 인증서 존재를 확인했을 때만 켠다.

| 상태 | 결과 |
|---|---|
| 인증서 없음 | 80 앱 서빙만. 443 없음 |
| 인증서 있음 + `REDIRECT_HTTP_TO_HTTPS=0` | 80 앱 + 443 앱 (전환기) |
| 인증서 있음 + `REDIRECT_HTTP_TO_HTTPS=1` | 80 은 301 + 443 앱 ← **현재** |

발급이 실패해도, 새 서버에 처음 배포해도 **http 로는 항상 뜬다.**

### 9-3. 발급과 갱신

certbot webroot 방식이다. 발급 전에 `--staging` 으로 먼저 시험한다
(Let's Encrypt 는 실패 횟수 제한이 있다).

```bash
# 최초 발급
docker compose --env-file .env.production run --rm --entrypoint certbot certbot \
  certonly --webroot -w /var/www/certbot -d 35.86.162.39.nip.io \
  --register-unsafely-without-email --agree-tos --no-eff-email --non-interactive

# 갱신 시뮬레이션
docker compose --env-file .env.production run --rm --entrypoint certbot certbot \
  renew --webroot -w /var/www/certbot --dry-run
```

갱신은 자동이다. certbot 컨테이너가 12시간마다 `renew` 를 시도하고,
nginx 는 6시간마다 `reload` 해서 갱신된 인증서를 무중단으로 집어든다.
인증서는 `certbot-conf` 볼륨에 영속화된다.

ACME 챌린지 경로는 리다이렉트 모드에서도 `^~` 로 먼저 매칭돼 80 에서 직접 응답한다.
이게 없으면 갱신이 깨진다.

### 9-4. 롤백

**HSTS 는 일부러 넣지 않았다.** 한 번 걸리면 브라우저가 http 접속을 거부해서 되돌릴 수 없다.

```bash
# 서버에서
sed -i 's/^REDIRECT_HTTP_TO_HTTPS=.*/REDIRECT_HTTP_TO_HTTPS=0/' .env.production
docker compose --env-file .env.production up -d --force-recreate web
```

인증서·데이터에 영향 없이 80 이 다시 앱을 서빙한다.

### 9-5. 카카오 콘솔 도메인 등록

JS 키는 **등록된 도메인에서만** 동작한다. 콘솔 > 플랫폼 > Web 에 아래를 모두 등록해야 한다
(뒤에 슬래시 없이).

```
https://35.86.162.39.nip.io
http://35.86.162.39
http://localhost:5173          ← Vite 개발 서버 (3000 아님)
```

등록이 안 되어 있으면 다 띄워놓고 **지도만 빈 화면**으로 뜬다.

## 10. CI/CD — main push 시 자동 배포

`.github/workflows/deploy.yml`. **main 에 push 하면 EC2 로 자동 배포된다.**
Actions 탭에서 수동 실행(`workflow_dispatch`)도 가능하다.

### 10-1. 동작

```
push(main) → 시크릿 확인 → SSH 키 준비 → ./deploy.sh -y → 배포 검증 → 키 삭제
```

서버에서 하는 일은 `deploy.sh` 와 **완전히 동일하다**(같은 스크립트를 호출한다).
로직이 두 벌로 갈라져 한쪽만 고쳐지는 상황을 만들지 않기 위해서다.

```
git fetch --depth 1 → reset --hard → compose build → up -d → 헬스체크
```

동시 배포는 `concurrency` 로 막는다. `cancel-in-progress: false` — 진행 중인 배포를
중간에 죽이면 이미지가 반쯤 바뀐 상태로 남을 수 있어 반드시 끝까지 보낸다.

### 10-2. GitHub Secrets

이 저장소는 **공개(public)** 다. 값은 워크플로우 파일 어디에도 하드코딩하지 않는다.

| 이름 | 값 |
|---|---|
| `EC2_HOST` | `35.86.162.39` |
| `EC2_SSH_KEY` | `.pem` 파일 전체 내용 (BEGIN/END 줄 포함, 마지막 줄바꿈까지) |

키는 작업 디렉토리가 아니라 `RUNNER_TEMP` 에 쓰고 성공/실패와 무관하게 지운다.
호스트 키는 `ssh-keyscan` 으로 `~/.ssh/known_hosts` 에 고정한다
(임시 경로에 두면 `deploy.sh` 안의 ssh 가 기본 경로를 봐서 검증에 쓰이지 않는다).

### 10-3. 조용한 실패를 막는 검증

배포 후 아래를 모두 확인하고, 하나라도 어긋나면 워크플로우를 실패시킨다.

- `/api/health` 200
- 사이트 200
- TLS 인증서 검증 결과 0
- **서버의 `git rev-parse HEAD` == `GITHUB_SHA`**

마지막 항목이 중요하다. `git fetch` 가 조용히 실패해도 사이트는 **예전 코드로 계속 200** 을
주기 때문에, 헬스체크만으로는 "배포가 안 됐는데 성공"을 잡아낼 수 없다.

### 10-4. 수동 배포

```bash
./deploy.sh                 # origin/main 배포
./deploy.sh -b feature/x    # 다른 브랜치
./deploy.sh -y              # 확인 프롬프트 없이 (CI 용)
./deploy.sh --status        # 배포된 커밋 + 컨테이너 상태만 확인
./deploy.sh --logs --no-cache
```

Windows 는 **Git Bash** 에서 실행한다(PowerShell 아님).
푸시되지 않은 커밋이 있으면 경고하고 확인을 받는다 — 서버는 GitHub 에서 받으므로
로컬에만 있는 코드는 배포되지 않기 때문이다.

서버의 `.env.production` 은 어느 경로로도 건드리지 않는다.
DB 볼륨을 지우는 명령(`down -v` 등)도 들어 있지 않다.

### 10-5. ⚠ 알려진 문제 — 브랜치 배포와 자동 배포가 충돌한다

`./deploy.sh -b feature/x` 로 브랜치를 올려둔 상태에서 **누군가 main 에 push 하면
자동 배포가 그 위를 덮어쓴다.** 실제로 겪었고, 동시에 빌드가 돌면서 이런 것들이 났다.

- 컨테이너 이름 충돌 (`The container name "/bapfriend-api" is already in use`)
- **git 은 main 인데 실행 중 이미지는 feature 브랜치**인 불일치
  (10-3 의 커밋 검증은 git HEAD 만 보므로 이건 못 잡는다)

지금 구조에서 **브랜치를 이 서버에 배포하는 것은 안전하지 않다.** 필요하면 아래를 먼저 붙인다.

| 방안 | 막아주는 것 |
|---|---|
| 배포 락 (`flock`) — `deploy.sh` 와 워크플로우가 같은 락을 잡는다 | 동시 실행. `concurrency` 는 Actions 끼리만 막는다 |
| 이미지에 커밋 심기 — 빌드 시 `GIT_SHA` 를 넣고 `/api/health` 로 검증 | git/이미지 불일치 |
| 스테이징 분리 | 근본 해결. 비용·시간이 든다 |
| main 브랜치 보호 + PR 필수 | 배포 타이밍 예측 가능 |

## 11. AI 제공자 — Gemini ↔ Bedrock

두 구현을 모두 두고 환경변수로 고른다. **되돌릴 수 있게 하기 위해서다.**

```
AI_PROVIDER=gemini     제미나이 API 키로 호출
AI_PROVIDER=bedrock    AWS Bedrock (Claude). 현재 운영 설정
```

라우트는 항상 [server/src/services/ai.service.js](server/src/services/ai.service.js) 만 본다.
제공자별 구현을 직접 import 하지 않는다.

| 파일 | 역할 |
|---|---|
| `services/ai.service.js` | 제공자 선택기 |
| `services/ai.prompts.js` | 두 구현이 **공유**하는 시스템 프롬프트 |
| `services/gemini.service.js` | 제미나이 (404/503/429 모델 폴백 포함) |
| `services/bedrock.service.js` | Bedrock (Claude) |

> 프롬프트를 공유하는 이유: 각자 사본을 들면 한쪽만 고쳐져서 제공자를 바꿨을 때
> 답변 성격이 달라진다.

### 11-1. Bedrock — 겪은 것들

**모델 ID 에 `global.` 접두사가 반드시 필요하다.**

```
global.anthropic.claude-sonnet-5   OK
anthropic.claude-sonnet-5          ValidationException:
                                   on-demand throughput 미지원
```

**`temperature` 를 보내면 거부된다.**

```
ValidationException: `temperature` is deprecated for this model
```

`invoke-model` 직접 테스트는 temperature 없이 해서 통과했고, **실제 대화 경로에서만**
드러났다. 지금은 보내지 않고 모델 기본값을 쓴다.

**요청/응답 구조가 제미나이와 완전히 다르다.**

| | 제미나이 | Bedrock (Claude) |
|---|---|---|
| 요청 | `startChat().sendMessage()` | `{ anthropic_version, max_tokens, system, messages }` |
| role | `user` / `model` | `user` / `assistant` |
| 응답 | `response.text()` | `content[0].text` |

Claude 는 role 이 **교대**해야 한다. 첫 턴이 user 가 되도록 앞을 자르고,
같은 role 이 연속되면 합친다.

**인증은 EC2 인스턴스 프로파일이 처리한다. Access Key 를 넣지 않는다.**
`BedrockRuntimeClient({})` 에 region 을 넘기지 않아 SDK 기본 탐색
(`AWS_REGION`/`AWS_DEFAULT_REGION` → IMDS)에 맡긴다. **리전은 코드에 하드코딩하지 않는다.**
배정 리전 밖은 IAM 이 전부 막아둬서 다른 값을 넣으면 100% AccessDenied 다.
리전은 `docker-compose.yml` 의 `api.environment` 에서만 정한다.

### 11-2. 전환 방법

```bash
# 서버에서
sed -i 's/^AI_PROVIDER=.*/AI_PROVIDER=bedrock/' .env.production
docker compose --env-file .env.production up -d --force-recreate api
```

`gemini` 로 되돌릴 때도 같다. **코드 변경 없이 즉시 원복된다.**

> Bedrock 으로 바꾸기 전에 `npm run db:patch4` 를 먼저 돌려야 한다.
> `ck_csq_source` CHECK 가 `('GEMINI','FALLBACK')` 만 허용해서
> 채팅 추천 질문 저장이 CHECK 위반으로 실패한다.

### 11-3. AccessDeniedException 이 나면

순서대로 본다.

1. **리전** — `AWS_DEFAULT_REGION` 이 배정 리전(`us-west-2`)인가
2. **모델 ID** — `global.` 접두사가 붙은 추론 프로파일인가
3. **권한** — EC2 인스턴스 프로파일이 인스턴스에 붙어 있는가

`npm run bedrock:check` 가 이 순서대로 진단한다(리전 → 모델 ID → 자격증명 → 실제 호출).

### 11-4. 제미나이 무료 쿼터

`gemini-3.6-flash` 무료 티어는 **하루 20건**이다(`GenerateRequestsPerDayPerProjectPerModel-FreeTier`).
심사 중에 몇 명만 챗봇을 눌러도 소진된다. 429 가 나면 다른 모델로 폴백하지만
(모델마다 쿼터 버킷이 다르다) 근본 해결은 아니다.
Bedrock 에는 이런 일일 무료 캡이 없다 — 전환한 이유 중 하나다.

## 12. 점검 명령 (배포 관련)

```bash
# 로컬에서
./deploy.sh --status                    # 배포된 커밋 + 컨테이너 + 응답

# 서버에서 (cd ~/bapfriend)
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f api
docker compose --env-file .env.production exec api npm run bedrock:check
docker compose --env-file .env.production exec api npm run db:check
docker compose --env-file .env.production exec api npm run db:patch4
docker compose --env-file .env.production exec api node scripts/smoke-spot.js --cleanup
docker compose --env-file .env.production exec api node scripts/smoke-assistant.js
```

> `docker compose down -v` 는 **절대 쓰지 않는다.** DB 볼륨이 지워져 실사용자 데이터가 날아간다.
