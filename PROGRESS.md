# 랜덤 밥친구 — 진행 상황

마지막 업데이트: 2026-08-28 · 이 문서의 수치는 전부 **실측값**이다(추정 없음).

---

## 1. 한눈에 보기

| 영역 | 상태 |
|---|---|
| DB 스키마 v1 / v2 / v3 | 적용 완료 |
| 백엔드 API (8개 라우터) | 동작 |
| 프론트 20개 화면 | 빌드 통과 (192 modules, 오류 0) |
| 카카오 지도 — 렌더링 | 동작 (localhost / LAN 등록됨) |
| 카카오 로컬 — 맛집 수집 | 동작 (캐시 90건) |
| 제미나이 — AI 도우미 챗봇 | 동작 (`gemini-3.6-flash`) |
| 제미나이 — 채팅 추천 질문 | 동작 |
| 현재 위치(Geolocation) | PC 동작 / 휴대폰은 https 필요 |
| 휴대폰 접속 | LAN(http) + Cloudflare 터널(https) — 둘 다 응답 확인 |
| **미해결 1건** | 휴대폰용 오리진이 카카오 콘솔에 미등록 → 휴대폰에서 지도만 안 뜸 (§4 참고) |

---

## 2. 실행 방법

### 2-1. 평소 (PC에서만)

```powershell
# ① API 서버 (포트 4000)
cd server;  npm.cmd run dev

# ② 프론트 (포트 5173)
cd client;  npm.cmd run dev

# ③ 브라우저
start http://localhost:5173
```

MySQL 서비스가 떠 있어야 한다: `Get-Service MySQL80`

### 2-2. 휴대폰에서 위치 권한까지 쓸 때

모바일 브라우저는 `http://` 를 secure context 로 치지 않아 **권한 창조차 띄우지 않고**
`geolocation` 을 차단한다. 그래서 https 터널이 필요하다.

```powershell
# ① Vite 를 터널 모드로 (HMR 소켓을 443/wss 로 맞춘다)
cd client;  $env:VITE_TUNNEL='1';  npm.cmd run dev

# ② 터널 열기 — 실행하면 https 주소를 찍어 준다
powershell -ExecutionPolicy Bypass -File .\start-tunnel.ps1
```

> **터널 주소는 실행할 때마다 바뀐다.** 바뀐 주소를 카카오 콘솔 > 플랫폼 > Web 에
> 다시 등록하지 않으면 지도 SDK 가 401 로 거부당해 흰 화면이 된다.

### 2-3. 접속 주소 3종 비교

| 주소 | 지도 | 현재 위치 | 비고 |
|---|---|---|---|
| `http://localhost:5173` | O | O | PC 전용. localhost 는 http 여도 secure context |
| `http://<PC IP>:5173` | 도메인 등록 시 O | **X** | 같은 Wi-Fi 휴대폰. http 라 위치 차단 |
| `https://<터널>.trycloudflare.com` | 도메인 등록 시 O | O | **휴대폰 권장.** 주소가 매번 바뀜 |

> **Wi-Fi 가 바뀌면 둘 다 다시 챙겨야 한다.**
> ① PC IP 가 바뀌므로 새 IP 를 확인한다 (`Get-NetIPAddress -AddressFamily IPv4`).
> ② 기존 quick tunnel 은 끊기므로 `start-tunnel.ps1` 을 다시 실행해 새 주소를 받는다.
> ③ 새 주소들을 카카오 콘솔 > 플랫폼 > Web 에 등록한다.
> 방화벽 규칙은 `LocalSubnet` 범위라 서브넷이 바뀌어도 자동으로 따라가므로 다시 만들 필요는 없다.

---

## 3. 설치된 것

### 3-1. 런타임 / 외부 도구

| 항목 | 버전 | 위치 · 비고 |
|---|---|---|
| Node.js | v24.19.0 | `C:\Program Files\nodejs\` |
| npm | 11.17.0 | PowerShell 정책 때문에 항상 **`npm.cmd`** 로 호출 |
| MySQL Server | 8.0.46 | 포트 3306, 서비스로 상주 |
| cloudflared | 2026.8.2 | `%USERPROFILE%\tools\cloudflared.exe` — 관리자 권한 없이 단독 exe 다운로드 |

> **주의: 이 PC에 `mysql.exe` CLI 가 없다.** `C:\Program Files\MySQL` 아래에 MySQL Router 만
> 있어서 `mysql -u root < file.sql` 이 불가능하다. 그래서 SQL 은 `mysql2` 드라이버를 쓰는
> 자체 러너([server/scripts/run-sql.js](server/scripts/run-sql.js))로 실행한다.
> 이 러너는 `DELIMITER` 블록(트리거·프로시저)까지 해석한다.

### 3-2. server 의존성 (실제 설치 버전)

| 패키지 | 버전 | 용도 |
|---|---|---|
| express | 4.22.2 | HTTP 서버 |
| mysql2 | 3.24.2 | DB 드라이버 (named placeholder 사용) |
| socket.io | 4.8.3 | 채팅 실시간 전송 |
| jsonwebtoken | 9.0.3 | 로그인 토큰 |
| bcryptjs | 2.4.3 | 비밀번호 해시 |
| zod | 3.25.76 | 요청 본문 검증 |
| @google/generative-ai | 0.21.0 | 제미나이 (AI 도우미 + 추천 질문) |
| cors | 2.8.6 | CORS |
| morgan | 1.11.0 | 요청 로그 |
| dotenv | 16.6.1 | `.env` 로드 |
| nodemon | 3.1.14 | dev 자동 재시작 (**`.env` 는 감시하지 않음**) |

### 3-3. client 의존성 (실제 설치 버전)

| 패키지 | 버전 | 용도 |
|---|---|---|
| react / react-dom | 18.3.1 | UI |
| react-router-dom | 6.30.6 | 라우팅 |
| @tanstack/react-query | 5.102.7 | 서버 상태 캐싱 |
| axios | 1.20.0 | HTTP 클라이언트 (토큰 인터셉터 포함) |
| socket.io-client | 4.8.3 | 채팅 소켓 |
| vite | 5.4.21 | 번들러 / dev 서버 |
| @vitejs/plugin-react | 4.7.0 | React 지원 |

카카오 지도는 npm 패키지가 아니라 [client/index.html](client/index.html) 의 `<script>` 로 로드한다
(`autoload=false` → [useKakaoMap.js](client/src/hooks/useKakaoMap.js) 에서 `kakao.maps.load`).

---

## 4. API 키 현황

| 키 | 위치 | 상태 |
|---|---|---|
| `VITE_KAKAO_JS_KEY` | `client/.env` | 설정됨 — 지도 렌더링 |
| `KAKAO_REST_API_KEY` | `server/.env` | 설정됨 — 장소 검색 (서버 전용) |
| `GEMINI_API_KEY` | `server/.env` | 설정됨 — AI 도우미 |
| `GEMINI_MODEL` | `server/.env` | `gemini-3.6-flash` |

### 카카오 콘솔 도메인 등록 현황 (실측)

같은 JS 키라도 **오리진마다** 등록이 필요하다.
아래 명령으로 Referer 를 바꿔가며 SDK 를 직접 요청하면 등록 여부를 실측할 수 있다
(401 = 미등록 → 그 주소에서는 지도가 흰 화면).

```powershell
$key = (Select-String -Path client\.env -Pattern '^VITE_KAKAO_JS_KEY=(.*)$').Matches.Groups[1].Value
$sdk = "https://dapi.kakao.com/v2/maps/sdk.js?appkey=$key&libraries=services,clusterer&autoload=false"
foreach ($ref in @('http://localhost:5173/', 'http://<PC IP>:5173/', 'https://<터널>.trycloudflare.com/')) {
  try { $r = Invoke-WebRequest $sdk -Headers @{ Referer = $ref } -UseBasicParsing -TimeoutSec 20
        "$ref -> $($r.StatusCode) 등록됨" }
  catch { "$ref -> $([int]$_.Exception.Response.StatusCode) 미등록" }
}
```

등록 위치: 카카오 콘솔 > 내 애플리케이션 > 앱 설정 > 플랫폼 > Web > 사이트 도메인.
포트까지 포함한 오리진을 그대로 넣고, 등록은 즉시 반영된다.

### 제미나이 모델 주의 — 여기서 한 번 막혔다

구글이 모델을 수시로 종료한다. 처음 설정값 `gemini-2.0-flash` 와 `gemini-2.5-flash` 는
이 계정에서 **404 (no longer available to new users)** 가 났다.

```
gemini-3.6-flash           OK
gemini-3-flash-preview     OK
gemini-flash-lite-latest   OK
gemini-flash-latest        503 (일시적 과부하)
gemini-2.5-flash-lite      404 (신규 사용자 종료)
gemini-pro-latest          429 (무료 쿼터 초과)
```

그래서 [gemini.service.js](server/src/services/gemini.service.js) 에 **모델 폴백**을 넣었다.
설정 모델이 404/503 이면 다음 후보로 자동으로 넘어가므로, 구글이 또 모델을 내려도 챗봇이 죽지 않는다.

되는 모델 확인: `cd server; npm.cmd run gemini:check`

---

## 5. 구현된 기능

### 5-1. 기존 (v1 · v2)

회원가입 → 프로필 → 랜덤/지도 매칭 → 제안 → 수락 → 채팅.
화면 ↔ API ↔ 테이블 매핑은 [README.md](README.md) 3장 참고.

### 5-2. 지도 마커 매칭 (v3, 신규)

```
지도 길게 누르기(550ms) → 마커 이름 입력 → map_spot 생성
  → 취향 선택 → matching_request(matching_type='SPOT', spot_id)
  → 다른 사람 지도에 "N명 모집 중" 핀 (v_spot_recruiting)
  → 핀 탭 → 밥친구 목록(v_spot_buddy, 취향 일치율 순)
  → 매칭 요청 → 수락(sp_accept_proposal) → meal_match.spot_id 보존 + 채팅방 자동 생성
```

- 식당 핀(주황)과 내 마커(파랑)가 같은 지도에 함께 뜬다
- 기존 `matching_type='MAP'`(식당에 붙는 모집)은 그대로 유지
- 15m 이내 같은 이름 마커는 새로 만들지 않고 재사용 → 핀 난립 방지
- 카카오 `rightclick` 이벤트가 기기별로 안 와서 포인터 이벤트로 롱프레스를 직접 구현
  (10px 슬롭으로 지도 드래그와 구분)

| API | 용도 |
|---|---|
| `GET /api/spots?lat&lng&radius` | 주변 마커 + 모집 인원 |
| `POST /api/spots` | 마커 생성 |
| `GET /api/spots/:id` | 마커 상세 + 참여자 미리보기 |
| `GET /api/spots/:id/buddies` | 마커별 밥친구 + 취향 일치율 |

### 5-3. 현재 위치

[useKakaoMap.js](client/src/hooks/useKakaoMap.js) 의 `useMyLocation()` 이 권한 상태를
`granted / denied / insecure / unavailable` 로 구분해 **화면에 이유를 띄운다**.
기존에는 실패해도 조용히 기본 좌표(군산)로 폴백돼서 원인을 알 수 없었다.
내 위치 점 + 정확도 원, `◎`(내 위치로) 버튼 포함.

### 5-4. AI 도우미 챗봇 (신규)

홈 화면 하단 카드 → 탭하면 전용 대화 화면(`/assistant`).
추천 질문을 누르면 그 질문으로 바로 대화가 시작된다.

- 앱 사용법, 오늘 뭐 먹지, 처음 만나는 사람과의 대화 요령을 답한다
- 시스템 프롬프트에 **앱 기능 사실관계**를 넣어 없는 기능을 지어내지 않게 했다
- 사용자 상황(확정 약속 / 진행 중 매칭 / 안 읽은 요청 수)을 문맥으로 넘겨 답이 구체적이다
- 대화 이력은 브라우저 `localStorage` 에 두고 매번 함께 전송 → **서버 무상태, DB 변경 없음**
- 다른 사용자와 주고받은 채팅 원문은 제미나이로 넘어가지 않는다
- 키가 없으면 `source:'NO_KEY'` 로 "키를 넣어달라"는 안내를 화면에 그대로 띄운다

| API | 용도 |
|---|---|
| `GET /api/assistant/status` | 키 설정 여부 (UI 배너용) |
| `GET /api/assistant/starters` | 상황별 추천 질문 3개 |
| `POST /api/assistant/chat` | 대화 (`message` + `history`) |

---

## 6. 검증 결과 (실측)

### 6-1. 게이트

| 항목 | 결과 |
|---|---|
| `GET /api/health` | 200 `{"ok":true}` |
| `GET /api/codes` | 200 `food=5 talk=3 meal=3 mbti=16 interest=12 region=7` |
| `GET /` (Vite) | 200 |
| `npm run build` | 192 modules, 오류 0 |
| 터널 `/`, `/api/health` | 200 |

### 6-2. E2E 스모크

**지도 마커 매칭 — 16/16 PASS** (`npm run smoke`)

마커 생성 · 15m 중복 재사용 · 모집 집계 · 거리 계산 · 밥친구 노출 · 취향 일치율 ·
매칭 요청 · 수락 · `meal_match.spot_id` 보존 · 채팅방 트리거 · 확정 후 인원 복귀 · 입력 검증

**AI 도우미 — 12/12 PASS** (`npm run smoke:ai`)

상태 조회 · 추천 질문 · 첫 대화 · 이력 문맥 유지 · 앱 사용법 정확도 · 입력 검증 · 비인증 401

실제 응답 예:

```
[Q] 지도에 마커 찍는 건 어떻게 해요?
[A] 지도 화면에서 원하시는 위치를 **길게 누르시면** "여기서 먹고싶어요" ...
```

### 6-3. 카카오 로컬

```
장소 검색      45건 (서울시청 반경 500m, 3페이지 페이지네이션)
좌표→주소      서울특별시 중구 세종대로 110
restaurant 캐시  90건 / 카카오 출처 90 / 상세링크 90 / 평점 0
```

두 스모크 테스트 모두 **테스트 데이터를 스스로 정리**한다.
현재 DB 사용자는 실제 계정 2개(`안녕`, `고운별`)뿐이다.

---

## 7. 점검 명령 모음

```powershell
cd server
npm.cmd run db:patch      # v3 패치 적용 (몇 번 돌려도 안전)
npm.cmd run db:check      # v1/v2/v3 적용 상태 실측
npm.cmd run kakao:check   # 카카오 API 연결 + 캐시 상태
npm.cmd run gemini:check  # 제미나이 키 유효성 + 실제 되는 모델 찾기
npm.cmd run smoke         # 마커→매칭 E2E 16항목 (정리 포함)
npm.cmd run smoke:keep    # 위와 같되 데이터를 남김 (화면 확인용)
npm.cmd run smoke:ai      # AI 도우미 E2E 12항목
npm.cmd run smoke:clean   # 남은 테스트 데이터만 삭제
```

---

## 8. 알려진 제약

**카카오 로컬 API 는 평점·리뷰수를 주지 않는다.**
캐시 90건 중 `rating` 이 있는 건 0건이라 화면의 `⭐` 는 계속 `-` 로 뜬다.
카카오맵 HTML 파싱은 약관 위반이라 쓰지 않는다. 선택지는 셋:
① `is_popular`(모집 3명 이상)를 인기 지표로 쓰기 ② 앱 자체 별점 쌓기
③ `place_url` 로 카카오맵 상세 열기(현재 이 방향으로 데이터는 다 갖춰져 있음).

**`v_home_confirmed_match` 에 `partner_image` 컬럼이 없다.**
홈 화면 확정 약속 카드의 프로필 사진이 항상 기본 이미지로 나온다.
뷰에 컬럼을 추가하면 해결되지만 v2 스키마를 건드려야 해서 보류했다.

**터널 주소는 재시작마다 바뀐다.**
매번 카카오 콘솔 재등록이 번거로우면 Cloudflare 계정을 붙인 named tunnel 로 고정할 수 있다.

**터널 주소는 공개된다.**
링크를 아는 누구나 개발 서버에 접근 가능하고 회원가입/로그인 API 에 rate limiting 이 없다.
시연이 끝나면 `Get-Process cloudflared | Stop-Process` 로 닫는다.

---

## 9. 트러블슈팅 — 실제로 겪은 것들

| 증상 | 원인 | 해결 |
|---|---|---|
| `npm.ps1 을 로드할 수 없습니다` | PowerShell 실행 정책 | `npm.cmd` 사용 |
| `mysql -u root < file.sql` 불가 | 이 PC 에 mysql CLI 없음 | `node scripts/run-sql.js` |
| 휴대폰에서 위치 권한 창이 안 뜸 | http 는 secure context 아님 | https 터널 |
| 휴대폰에서 지도만 흰 화면 | 카카오 콘솔에 그 오리진 미등록 | 플랫폼 > Web 에 주소 추가 |
| 터널 주소로 열면 `Blocked request` | Vite 5.4.12+ 의 Host 검사 | `vite.config.js` 의 `allowedHosts` |
| AI 도우미가 "응답하지 못했어요" | 설정 모델이 404 (종료됨) | `npm run gemini:check` 후 `GEMINI_MODEL` 교체 |
| `.env` 를 고쳐도 반영 안 됨 | nodemon 은 `.env` 를 감시 안 함 | 서버 수동 재시작 |
| 모집 시작 시 FK 위반 | 식당 종류 ≠ 사용자가 고른 음식 종류 | 서버가 식당 종류로 강제 정렬 (수정 완료) |
| 테스트 데이터 삭제 실패 | `trg_match_participant_del` 가 직접 삭제를 막음 | `meal_match` 를 지워 CASCADE 로 정리 (MySQL 은 CASCADE 시 트리거 미실행) |
| 확정 약속 카드가 빈칸 | 뷰 컬럼명이 `meal_time` 인데 `meal_time_label` 로 읽음 | 수정 완료 |
