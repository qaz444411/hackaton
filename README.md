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
