# 랜덤 밥친구 — React + Node.js + MySQL 연동 프로젝트

요구사항_최종.pdf / 랜덤밥친구_schema_mysql.sql / css파일_최종.zip 기준으로 만든 풀스택 스캐폴드.

```
bapfriend/
├── db/     01_schema_v1.sql        # 기존 스키마(첨부 원본)
│           02_schema_patch_v2.sql  # 요구사항 최종본 반영 패치 ★신규
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
| HomePage | `GET /matching/home` | v_home_confirmed_match, v_inbox |
| PreferencePage | `POST /matching/draft`, `POST /matching/:id/start` | matching_request |
| MatchingProgressPage | `GET /matching/:id/candidates` (폴링) | matching_request, matching_status_history |
| MatchResultPage | `POST /proposals` | match_proposal + fn_taste_match_rate |
| MapPage | `GET /restaurants?lat&lng` | v_restaurant_recruiting |
| RestaurantListPage / RecruitPage | `GET/POST /restaurants` | restaurant |
| BuddyListPage | `GET /restaurants/:id/buddies` | v_restaurant_buddy |
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

- 키: `server/.env` → `GEMINI_API_KEY`, `GEMINI_MODEL`
- 구현: `server/src/services/gemini.service.js` (`@google/generative-ai`, JSON 응답 강제, 실패 시 FALLBACK 질문 3개)
- 라우트: `GET /api/chat/rooms/:matchId/suggestions` (`?refresh=1` = "다른 질문 보기")
  - 두 사람의 **공통 관심사 / 음식 종류 / 식당명만** 프롬프트로 전달 (대화 원문은 보내지 않음 = 개인정보 최소화)
  - 결과를 `chat_suggested_question` 에 저장 → 캐시 및 사용 로그(`used_at`)
- 화면: `client/src/pages/ChatRoomPage.jsx` 의 ✨ 버튼 → `.suggest` 패널 → "입력창에 넣기"
- 프론트에는 제미나이 키가 존재하지 않는다.

## 6. 디자인 토큰
`client/src/styles/theme.css` 는 css파일_최종.zip(Figma export)에서 추출한 컬러·라운드·폰트를 CSS 변수로 정리한 것.
페이지 컴포넌트는 모두 이 변수와 `app.css` 의 공통 클래스(.card/.btn/.chip/.bubble 등)를 사용한다.
