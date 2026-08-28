# AWS 배포 인수인계

인프라 담당자에게 넘기는 문서. 앱이 서버에서 뭘 기대하는지, 무엇만 맞춰주면 되는지 정리한다.

관련 문서: [PROGRESS.md](PROGRESS.md)(현재 상태·설치 모듈), [README.md](README.md)(기능·API 매핑)

---

## 1. 구성 요약

```
브라우저 ──HTTPS──> [리버스 프록시] ──┬── /            → 정적 파일 (client/dist)
                                      ├── /api/*      → Node API (:4000)
                                      └── /socket.io/ → Node API (:4000)  ※ WebSocket 업그레이드 필요
                                                          │
                                                          └── MySQL 8.0 (:3306)
```

- **API**: Node.js(Express) 단일 프로세스, 기본 포트 `4000`
- **프론트**: Vite 빌드 산출물(정적 파일). 런타임 서버 불필요
- **DB**: MySQL **8.0** (뷰 · 트리거 · 저장 프로시저 · CHECK 제약 · 생성 컬럼 사용)

### 런타임 요구사항

| 항목 | 버전 | 비고 |
|---|---|---|
| Node.js | 20 이상 (개발은 24.19.0) | ESM(`"type": "module"`) 사용 |
| MySQL | **8.0** | 5.7 불가 — CHECK 제약·생성 컬럼·CTE 사용 |

---

## 2. 가장 중요한 제약 — 같은 오리진으로 서빙할 것

프론트는 API 를 **상대 경로**로 호출한다.

```
client/.env  →  VITE_API_BASE=/api
                VITE_SOCKET_URL=/
```

즉 정적 파일과 API 가 **같은 도메인**에서 서빙되면 CORS 설정이 아예 필요 없고,
`server/.env` 의 `CLIENT_ORIGIN` 도 신경 쓸 필요가 없다. 이 구성을 권장한다.

도메인을 분리해야 한다면 아래 둘을 반드시 함께 바꾼다.

```
client/.env  VITE_API_BASE=https://api.example.com/api
             VITE_SOCKET_URL=https://api.example.com
server/.env  CLIENT_ORIGIN=https://app.example.com
```

> `VITE_*` 는 **빌드 시점에 코드로 구워진다.** 런타임 환경변수가 아니므로
> 값을 바꾸면 `npm run build` 를 다시 해야 한다.

---

## 3. HTTPS 는 선택이 아니라 필수

지도 화면이 **현재 위치(Geolocation)** 를 쓴다.
모바일 브라우저는 `http://` 를 secure context 로 취급하지 않아 **권한 창조차 띄우지 않고** 차단한다.

→ ALB + ACM 인증서, 또는 nginx + certbot 으로 HTTPS 를 반드시 붙일 것.
HTTP 로 서비스하면 휴대폰에서 위치 기능이 조용히 실패한다(앱은 기본 좌표로 폴백돼 동작은 함).

---

## 4. 리버스 프록시 설정

`/socket.io` 는 **WebSocket 업그레이드**가 필요하다. 이게 빠지면 채팅 실시간 전송만 조용히 실패한다
(REST 폴백이 있어 메시지는 가지만 상대 메시지가 즉시 안 뜬다).

### nginx 예시

```nginx
server {
    listen 443 ssl http2;
    server_name app.example.com;

    # ssl_certificate / ssl_certificate_key ...

    root /var/www/bapfriend;          # client/dist 를 배포한 위치
    index index.html;

    # SPA — 새로고침·딥링크가 404 나지 않도록
    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;   # ★ 필수
        proxy_set_header Connection "upgrade";       # ★ 필수
        proxy_set_header Host       $host;
        proxy_read_timeout 3600s;                    # 유휴 연결 조기 종료 방지
    }
}
```

### ALB 를 쓸 경우

- 대상 그룹: `4000` 포트, 헬스체크 경로 **`/api/health`** (200 `{"ok":true}` 반환)
- 유휴 제한시간을 기본 60초보다 늘릴 것 (WebSocket 유지)
- 스티키 세션 불필요 — 서버는 JWT 기반 무상태.
  단, **Socket.IO 를 2대 이상으로 확장하면 Redis 어댑터가 필요하다**
  (현재 인메모리라 인스턴스 간 메시지 브로드캐스트가 안 됨). 1대면 그대로 사용 가능.

---

## 4-1. SPA 라우팅

React Router 를 쓰므로 `/map`, `/assistant` 같은 경로로 **직접 접속·새로고침**해도
`index.html` 을 돌려줘야 한다. nginx 는 위 `try_files`, S3+CloudFront 면 403/404 를
`/index.html` 200 으로 응답하도록 설정한다.

---

## 5. 환경변수

### server/.env (서버에만 둘 것. 절대 프론트로 노출 금지)

```
PORT=4000
CLIENT_ORIGIN=https://app.example.com    # 같은 오리진 서빙이면 미사용

DB_HOST=<RDS 엔드포인트>
DB_PORT=3306
DB_USER=<앱 전용 계정>
DB_PASSWORD=<비밀번호>
DB_NAME=bapfriend

JWT_SECRET=<충분히 긴 랜덤 문자열 — 개발값 절대 재사용 금지>
JWT_EXPIRES=7d

KAKAO_REST_API_KEY=<카카오 REST 키>        # 장소 검색. 서버 전용
GEMINI_API_KEY=<제미나이 키>               # AI 도우미
GEMINI_MODEL=gemini-3.6-flash              # §8 참고
```

### client/.env (빌드 시점에만 사용)

```
VITE_API_BASE=/api
VITE_SOCKET_URL=/
VITE_KAKAO_JS_KEY=<카카오 JavaScript 키>   # 브라우저에 노출되는 값이라 정상
```

> `.env` 는 `.gitignore` 로 제외돼 있다. 저장소에는 `.env.example` 만 있다.
> 운영값은 Secrets Manager / Parameter Store 로 주입하는 것을 권장한다.

---

## 6. DB 초기화

`db/` 아래 순서대로 적용한다. **순서와 재실행 가능 여부가 파일마다 다르다.**

| 파일 | 재실행 | 설명 |
|---|---|---|
| `01_schema_v1.sql` | **불가** | `CREATE TABLE` 에 `IF NOT EXISTS` 없음. 빈 DB 에 1회만 |
| `02_schema_patch_v2.sql` | **불가** | `ADD COLUMN` 중복 오류. 1회만 |
| `03_schema_patch_v3.sql` | 가능 | 모든 ALTER 를 information_schema 로 가드함 |

```bash
mysql -h <RDS> -u root -p --default-character-set=utf8mb4 < db/01_schema_v1.sql
mysql -h <RDS> -u root -p bapfriend --default-character-set=utf8mb4 < db/02_schema_patch_v2.sql
mysql -h <RDS> -u root -p bapfriend --default-character-set=utf8mb4 < db/03_schema_patch_v3.sql
```

- `--default-character-set=utf8mb4` 를 빼면 한글 코드값이 깨진다
- 트리거·프로시저의 `DELIMITER` 때문에 **파일 리다이렉트로 실행**해야 한다.
  쿼리를 쪼개 보내면 깨진다
- mysql CLI 가 없는 환경이면: `cd server && node scripts/run-sql.js ../db/03_schema_patch_v3.sql`

### 적용 검증

```bash
cd server && npm run db:check
```

기대: v1/v2/v3 항목이 모두 `1`, 뷰 6개 조회 성공.

추가 확인 — `GET /api/codes` 가 `region=7` 을 반환해야 v2 가 제대로 들어간 것이다.

### DB 계정

앱은 **DDL 권한이 필요 없다**(스키마는 위에서 수동 적용).
런타임 계정은 `SELECT, INSERT, UPDATE, DELETE, EXECUTE` 만 주면 된다.
`EXECUTE` 는 `sp_accept_proposal` 호출 때문에 반드시 필요하다.

### 타임존 — 주의

스키마가 `DATETIME` 기준이고, 커넥션 풀이 세션 타임존을 **`+09:00`** 으로 고정한다
([server/src/db/pool.js](server/src/db/pool.js)). RDS 파라미터 그룹의 `time_zone` 과
무관하게 앱은 KST 로 동작하므로 별도 설정은 불필요하다.

### sql_mode

뷰가 `ONLY_FULL_GROUP_BY` 하에서 동작하도록 작성돼 있다(PK 기준 그룹핑).
MySQL 8.0 기본 sql_mode 를 그대로 두면 된다.

---

## 7. 빌드 · 기동

```bash
# 프론트 — 정적 파일 생성
cd client
npm ci
npm run build          # → client/dist/  (이 디렉터리를 웹서버 root 로)

# 백엔드
cd server
npm ci --omit=dev
node src/app.js        # 또는 pm2 / systemd
```

- 백엔드는 `npm start`(= `node src/app.js`)로 기동. `npm run dev` 는 nodemon 이라 운영에 쓰지 말 것
- 프로세스 관리는 pm2 또는 systemd 권장. 앱에 자체 재시작 로직 없음
- 로그는 stdout(morgan). CloudWatch 로 수집하면 됨

### 헬스체크

```
GET /api/health   →  200 {"ok":true}          (DB 미접속이어도 200)
GET /api/codes    →  200 (DB 접속까지 확인됨)
```

ALB 헬스체크는 `/api/health`, 배포 후 수동 확인은 `/api/codes` 를 쓰면 DB 연결까지 검증된다.

---

## 8. 외부 API — 도메인 등록이 필요하다

### 카카오 (필수 작업)

**JavaScript 키는 오리진마다 등록이 필요하다.** 배포 도메인을 등록하지 않으면
지도만 흰 화면이 되고 나머지 기능은 정상 동작해서 원인을 찾기 어렵다.

```
https://developers.kakao.com > 내 애플리케이션 > 앱 키
  > JavaScript 키 > [JS SDK 도메인] > 배포 도메인 추가
```

등록 여부는 배포 없이도 확인 가능하다(401 = 미등록):

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Referer: https://app.example.com/" \
  "https://dapi.kakao.com/v2/maps/sdk.js?appkey=<JS키>&libraries=services,clusterer&autoload=false"
```

REST API 키는 서버에서 호출하므로 도메인 등록이 필요 없다.

### 제미나이 (주의)

구글이 모델을 수시로 종료한다. `gemini-2.0-flash` / `gemini-2.5-flash` 는
현재 신규 키에서 **404 (no longer available to new users)** 가 난다.

배포 후 한 번 확인할 것:

```bash
cd server && npm run gemini:check     # 실제로 되는 모델 목록을 출력
```

설정 모델이 404/503/429 면 코드가 자동으로 다음 후보로 폴백하므로 챗봇이 죽지는 않는다.

---

## 9. 배포 후 점검

```bash
cd server
npm run db:check      # 스키마 v1/v2/v3
npm run kakao:check   # 카카오 API 연결 + 캐시 상태
npm run gemini:check  # 제미나이 키 + 사용 가능 모델
npm run smoke         # 마커→매칭 E2E 16항목 (테스트 데이터 자동 정리)
npm run smoke:ai      # AI 도우미 E2E 12항목
```

> `smoke` 계열은 **테스트 계정을 만들고 지운다.** 운영 DB 에서 돌려도 정리되지만,
> 되도록 스테이징에서 실행할 것. 남은 게 있으면 `npm run smoke:clean`.

브라우저 확인 체크리스트:

- [ ] `/` 접속 후 새로고침 → 404 안 남 (SPA 라우팅)
- [ ] 로그인 → 홈
- [ ] 지도 화면에 지도가 렌더링됨 (카카오 도메인 등록 확인)
- [ ] 휴대폰에서 위치 권한 창이 뜸 (HTTPS 확인)
- [ ] 채팅방에서 메시지가 상대에게 즉시 도착 (WebSocket 업그레이드 확인)
- [ ] 홈 AI 도우미 응답 (제미나이 키·모델 확인)

---

## 10. 보안 체크리스트

- [ ] `JWT_SECRET` 을 운영용 랜덤값으로 교체 (개발값 재사용 금지)
- [ ] DB 계정을 `root` 가 아닌 앱 전용 계정으로 (DDL 권한 불필요, `EXECUTE` 는 필요)
- [ ] RDS 보안 그룹을 앱 서버에서만 접근 가능하도록 제한
- [ ] `KAKAO_REST_API_KEY` / `GEMINI_API_KEY` 가 프론트 번들에 들어가지 않았는지 확인
      (`grep -r "KakaoAK\|GEMINI" client/dist/` → 결과 없어야 정상)
- [ ] `.env` 가 배포 산출물에 포함되지 않았는지 확인

### 아직 없는 것 (필요하면 별도 작업)

- **rate limiting 없음** — 회원가입/로그인 포함 전 엔드포인트. 공개 서비스면 필수
- **비밀번호 재설정 없음**
- **파일 업로드 없음** (프로필 이미지는 URL 문자열만 저장)
- Socket.IO **다중 인스턴스 미지원** (Redis 어댑터 필요)
