# Kiro 자동 실행 지시서 — 랜덤 밥친구 풀스택 기동

> **사용법**: 이 파일 전체를 Kiro CLI 프롬프트로 넘긴다.
> `kiro "KIRO_AUTORUN.md 를 읽고 지시대로 끝까지 실행해줘"` 또는 파일 내용을 그대로 붙여넣는다.

---

## 0. 너의 임무 (AGENT GOAL)

이 저장소를 **처음 클론한 상태**에서 시작해서, 브라우저에 랜덤 밥친구 앱이 실제로 렌더링되는 상태까지 **사람 개입 없이** 도달한다.

완료 조건은 아래 4개를 **전부 실측으로 확인**했을 때만 충족된다. 명령이 오류 없이 끝난 것은 성공의 근거가 아니다.

| # | 검증 항목 | 통과 기준 |
|---|---|---|
| G1 | `GET http://localhost:4000/api/health` | HTTP 200, 본문 `{"ok":true}` |
| G2 | `GET http://localhost:4000/api/codes` | HTTP 200, `food=5 talk=3 meal=3 mbti=16 interest=12 region=7` |
| G3 | `GET http://localhost:5173/` | HTTP 200, HTML 응답 |
| G4 | `npm run build` (client) | exit 0, 오류 0건 |

G2의 `region=7`은 **DB v2 패치가 적용됐다는 증거**다. 이 값이 0이면 DB 단계가 실패한 것이므로 되돌아가서 고친다.

전부 통과하면 마지막에 브라우저로 `http://localhost:5173` 을 열고 사용자에게 보고한다.

---

## 1. 환경 전제

- OS: Windows / 셸: PowerShell
- 프로젝트 루트: 이 파일이 있는 디렉터리 (이하 `<ROOT>`)
- 구조:

```
<ROOT>/
├── db/     01_schema_v1.sql        기본 스키마 (전체 생성)
│           02_schema_patch_v2.sql  v1 위에 얹는 패치
├── server/ Express + mysql2 + Socket.IO   (포트 4000)
└── client/ React 18 + Vite                (포트 5173)
```

---

## 2. 절대 하지 말 것 (HARD CONSTRAINTS)

이 규칙을 어기면 데이터가 깨지거나 비밀정보가 유출된다.

1. **`01_schema_v1.sql` 을 조건 없이 실행하지 말 것.**
   이 파일의 `CREATE TABLE` 에는 `IF NOT EXISTS` 가 없다. 이미 적용된 DB에 다시 돌리면 에러로 중단된다.
   반드시 §5의 판정 절차를 먼저 수행하고, 필요할 때만 실행한다.

2. **`02_schema_patch_v2.sql` 을 두 번 실행하지 말 것.**
   `ALTER TABLE ... ADD COLUMN` / `ADD CONSTRAINT` 가 들어 있어 재실행 시 중복 오류가 난다.

3. **`.env` 파일을 커밋하지 말 것.** DB 비밀번호와 JWT 시크릿이 들어 있다. `.gitignore` 에 이미 등록돼 있으니 그 규칙을 해제하지 말 것.

4. **비밀번호를 화면에 출력하지 말 것.** DB 비밀번호는 `MYSQL_PWD` 환경변수로만 넘긴다. `-p<비밀번호>` 형태로 명령줄에 쓰지 말 것.

5. **기존 데이터를 지우지 말 것.** `DROP DATABASE`, `DROP TABLE`, `TRUNCATE` 는 사용자가 명시적으로 요청하지 않으면 실행하지 않는다.

6. **개발 서버를 포그라운드로 실행하지 말 것.** `npm run dev` 는 종료되지 않으므로 반드시 백그라운드 프로세스로 띄운다.

---

## 3. PowerShell 작업 규칙 (중요)

이 환경에서 실제로 부딪히는 함정들이다. 그대로 따르면 시간을 낭비하지 않는다.

### 3-1. `npm` 대신 `npm.cmd`

PowerShell 실행 정책 때문에 `npm.ps1` 로드가 차단된다.

```
npm : 이 시스템에서 스크립트를 실행할 수 없으므로 ... npm.ps1 파일을 로드할 수 없습니다.
```

→ 항상 `npm.cmd` 를 쓴다. 사용자의 실행 정책을 임의로 변경하지 말 것.

### 3-2. 설치 직후에는 PATH를 수동 갱신

winget 으로 설치한 직후에는 현재 셸의 PATH에 반영되지 않는다. 명령 앞에 이걸 붙인다.

```powershell
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
```

### 3-3. 긴 출력은 파일로 받아서 읽기

이 환경의 콘솔은 긴 명령의 출력이 깨지거나 잘린다. 결과 판정이 필요한 명령은 로그 파일로 리다이렉트한 뒤 파일을 읽어서 확인한다.

```powershell
$out = <명령> 2>&1 | Out-String
$out | Set-Content "$env:TEMP\step.log" -Encoding UTF8
```

### 3-4. 보조 `.ps1` 스크립트는 ASCII로만 작성

Windows PowerShell 5.1 은 BOM 없는 UTF-8 `.ps1` 을 ANSI로 읽어서 한글 주석·문자열이 파서 오류를 낸다.
스크립트 파일을 만들 때 **내용은 영문/ASCII만** 사용한다. (사용자에게 보고하는 텍스트는 한글로 한다.)

### 3-5. MySQL 은 PATH에 없다

풀 경로로 호출한다.

```
C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe
```

버전이 다르면 `Get-ChildItem "C:\Program Files\MySQL" -Directory -Name` 으로 실제 폴더명을 먼저 확인한다.

---

## 4. PHASE 1 — 런타임 준비

### 4-1. Node.js 확인 / 설치

```powershell
Test-Path "C:\Program Files\nodejs\node.exe"
```

- `True` → 다음 단계
- `False` → 설치한다. **관리자 권한(UAC) 창이 뜬다는 점을 사용자에게 먼저 알린다.**

```powershell
winget install --id OpenJS.NodeJS.LTS --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity
```

> winget 이 "이미 설치된 패키지를 찾았습니다 / 업그레이드 없음" 이라고 답해도 실제로는 설치되지 않았을 수 있다.
> 메시지를 믿지 말고 `Test-Path` 로 `node.exe` 존재를 다시 확인한다.

설치 후 §3-2로 PATH를 갱신하고 `node --version` 으로 확정한다.

### 4-2. MySQL 서버 확인

```powershell
Get-Service -Name "MySQL*" | Select-Object Name, Status
```

- `Running` → 다음 단계
- `Stopped` → `Start-Service MySQL80`
- 서비스가 아예 없음 → **여기서 멈추고 사용자에게 MySQL 8.0 설치를 요청한다.** 임의로 설치하지 말 것.

### 4-3. 의존성 설치

```powershell
# server
npm.cmd install --no-fund --no-audit    # cwd: <ROOT>/server
# client
npm.cmd install --no-fund --no-audit    # cwd: <ROOT>/client
```

검증 (설치 로그를 믿지 말고 실물 확인):

```powershell
Test-Path "<ROOT>\server\node_modules\express"
Test-Path "<ROOT>\client\node_modules\vite"
```

---

## 5. PHASE 2 — 환경변수 파일

`.env` 는 저장소에 없다(의도된 것). `.env.example` 을 복사해서 만든다.

```powershell
Copy-Item "<ROOT>\server\.env.example" "<ROOT>\server\.env"
Copy-Item "<ROOT>\client\.env.example" "<ROOT>\client\.env"
```

### server/.env 에서 반드시 고칠 값

| 키 | 처리 |
|---|---|
| `DB_USER` | 로컬 개발이면 `root` |
| `DB_PASSWORD` | **사용자에게 물어본다.** 추측하거나 빈 값으로 두지 말 것 |
| `JWT_SECRET` | 임의의 긴 문자열을 생성해서 채운다 (로컬 개발용) |
| `KAKAO_REST_API_KEY` | 비워도 됨 (음식점 검색만 비활성) |
| `GEMINI_API_KEY` | 비워도 됨 (추천 질문이 FALLBACK 3개로 동작) |

### client/.env — 이 값을 바꾸지 말 것

```
VITE_API_BASE=/api
VITE_SOCKET_URL=/
```

**반드시 상대 경로여야 한다.** `http://localhost:4000` 같은 절대 주소로 바꾸면 PC에서는 되지만 **휴대폰 접속 시 무조건 실패한다** (휴대폰이 자기 자신의 localhost를 찾는다). 상대 경로면 Vite 프록시를 타서 어느 기기에서든 동작하고 CORS 설정도 불필요하다.

`VITE_KAKAO_JS_KEY` 는 비워도 앱은 뜬다. 지도 화면만 동작하지 않는다.

### DB 접속 확인 (다음 단계 전 필수)

```powershell
$env:MYSQL_PWD = <server/.env 에서 읽은 DB_PASSWORD>
& $mysql -u root -h 127.0.0.1 -P 3306 -e "SELECT VERSION();"
```

실패하면 비밀번호가 틀린 것이다. 사용자에게 다시 확인하고, 스키마 단계로 넘어가지 말 것.

---

## 6. PHASE 3 — DB 스키마 (가장 실수하기 쉬운 단계)

### 6-1. 먼저 현재 상태를 판정한다

```sql
-- A: DB 존재 여부
SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='bapfriend';
-- B: v1 적용 여부 (16개 테이블 중 대표)
SELECT COUNT(*) FROM information_schema.tables
 WHERE table_schema='bapfriend' AND table_name IN ('users','restaurant','matching_request','meal_match','chat_room');
-- C: v2 적용 여부
SELECT COUNT(*) FROM information_schema.tables
 WHERE table_schema='bapfriend' AND table_name='region_code';
```

### 6-2. 판정 결과에 따라 분기

| A | B | C | 상태 | 할 일 |
|---|---|---|---|---|
| 0 | - | - | DB 없음 | `01` 실행 → `02` 실행 |
| 1 | <5 | 0 | 비정상/부분 적용 | **멈추고 사용자에게 보고.** 임의로 복구하지 말 것 |
| 1 | 5 | 0 | v1만 적용됨 | **`01` 은 건너뛰고 `02` 만 실행** |
| 1 | 5 | 1 | v1+v2 완료 | 둘 다 건너뛰고 PHASE 4로 |

### 6-3. 실행 전 데이터 건수를 기록한다

```sql
SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'restaurant', COUNT(*) FROM restaurant
UNION ALL SELECT 'matching_request', COUNT(*) FROM matching_request
UNION ALL SELECT 'meal_match', COUNT(*) FROM meal_match;
```

건수가 0이 아니면 사용자에게 알린 뒤 진행 여부를 확인한다.

### 6-4. 실행 방법

`DELIMITER` 구문(트리거·프로시저·함수)이 들어 있으므로 **`mysql` CLI 로 파일 리다이렉트**해야 한다. 쿼리를 한 줄씩 쪼개서 보내면 깨진다.

PowerShell의 `<` 리다이렉트는 지원되지 않으니 `cmd` 를 경유한다.

```powershell
& cmd /c "`"$mysql`" -u root -h 127.0.0.1 -P 3306 --default-character-set=utf8mb4 < `"$sqlFile`" 2>&1"
```

`--default-character-set=utf8mb4` 를 빼면 한글 코드값이 깨진다.

### 6-5. 적용 후 검증

아래가 모두 `1` 이어야 한다.

```sql
SELECT 'users.email',        COUNT(*) FROM information_schema.columns WHERE table_schema='bapfriend' AND table_name='users' AND column_name='email'
UNION ALL SELECT 'restaurant.rating',  COUNT(*) FROM information_schema.columns WHERE table_schema='bapfriend' AND table_name='restaurant' AND column_name='rating'
UNION ALL SELECT 'match_proposal.read_at', COUNT(*) FROM information_schema.columns WHERE table_schema='bapfriend' AND table_name='match_proposal' AND column_name='read_at'
UNION ALL SELECT 'region_code',        COUNT(*) FROM information_schema.tables   WHERE table_schema='bapfriend' AND table_name='region_code'
UNION ALL SELECT 'fn_taste_match_rate',COUNT(*) FROM information_schema.routines WHERE routine_schema='bapfriend' AND routine_name='fn_taste_match_rate'
UNION ALL SELECT 'sp_accept_proposal', COUNT(*) FROM information_schema.routines WHERE routine_schema='bapfriend' AND routine_name='sp_accept_proposal';
```

추가로 뷰 6개가 있어야 한다: `v_home_confirmed_match`, `v_inbox`, `v_chat_list`, `v_restaurant_recruiting`, `v_restaurant_buddy`, `v_user_stats`

---

## 7. PHASE 4 — 서버 기동

### 7-1. 백엔드 (포트 4000)

```powershell
# cwd: <ROOT>/server, 백그라운드
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User"); npm.cmd run dev
```

로그에 `API on http://localhost:4000` 또는 nodemon 시작 메시지가 보일 때까지 기다린다(약 10초).

**G1 검증** — 통과할 때까지 다음으로 넘어가지 않는다.

```powershell
(Invoke-WebRequest "http://localhost:4000/api/health" -UseBasicParsing).Content   # {"ok":true} 여야 함
```

**G2 검증** — DB 연결까지 확인하는 관문이다.

```powershell
$r = Invoke-RestMethod "http://localhost:4000/api/codes"
"food=$($r.food.Count) talk=$($r.talk.Count) meal=$($r.meal.Count) mbti=$($r.mbti.Count) interest=$($r.interest.Count) region=$($r.region.Count)"
# 기대값: food=5 talk=3 meal=3 mbti=16 interest=12 region=7
```

`region=0` 이면 v2 패치 미적용이다. PHASE 3으로 되돌아간다.

### 7-2. 프론트엔드 (포트 5173)

```powershell
# cwd: <ROOT>/client, 백그라운드
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User"); npm.cmd run dev
```

`vite.config.js` 에 이미 아래가 설정돼 있어야 한다. 없으면 추가한다.

```js
server: {
  port: 5173,
  host: true,                                   // LAN 노출 (휴대폰 접속용)
  proxy: {
    '/api': 'http://localhost:4000',
    '/socket.io': { target: 'http://localhost:4000', ws: true },   // ws: true 필수
  },
}
```

`/socket.io` 프록시가 없으면 채팅 실시간 전송이 동작하지 않는다.

**G3 검증**

```powershell
(Invoke-WebRequest "http://localhost:5173/" -UseBasicParsing).StatusCode   # 200
```

프록시가 실제로 붙었는지도 확인한다.

```powershell
(Invoke-WebRequest "http://localhost:5173/api/health" -UseBasicParsing).StatusCode   # 200
```

---

## 8. PHASE 5 — 전체 컴파일 검증 (G4)

dev 서버는 요청된 모듈만 변환하므로, 열지 않은 페이지의 오류를 놓친다. 프로덕션 빌드로 전 페이지를 한 번에 검사한다.

```powershell
npm.cmd run build    # cwd: <ROOT>/client
```

`N modules transformed` 가 나오고 오류가 없어야 한다. 확인 후 검증용 `dist/` 는 삭제한다.

오류가 나면 고치고 다시 빌드한다. **빌드가 깨진 상태로 완료 보고하지 말 것.**

---

## 9. PHASE 6 — 화면 띄우기

```powershell
Start-Process "http://localhost:5173"
```

---

## 10. 선택 단계 — 휴대폰에서 열기

사용자가 요청할 때만 수행한다. **방화벽 인바운드 개방은 보안 영향이 있으므로 반드시 사전 승인을 받는다.**

### 10-1. PC의 LAN IP 확인

```powershell
Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi" | ForEach-Object { "$($_.IPAddress)/$($_.PrefixLength)" }
Get-NetConnectionProfile | ForEach-Object { "$($_.Name) / $($_.NetworkCategory)" }
```

### 10-2. 방화벽 규칙 (관리자 권한 필요)

```powershell
New-NetFirewallRule -DisplayName "Vite dev 5173 (LocalSubnet)" `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173 `
  -RemoteAddress LocalSubnet -Profile Any
```

- `RemoteAddress LocalSubnet` 로 범위를 제한한다. 전체 개방하지 말 것.
- **5173만 연다.** 4000번은 Vite 프록시가 대신 처리하므로 열 필요가 없다.
- 규칙은 서브넷을 자동으로 따라가므로 와이파이가 바뀌어도 재생성이 불필요하다. IP만 다시 확인하면 된다.

### 10-3. 사용자에게 반드시 알릴 것

- 같은 서브넷의 모든 기기가 개발 서버에 접근할 수 있다. 회원가입/로그인 API는 인증 없이 열려 있고 rate limiting 도 없다.
- 되돌리기: `Remove-NetFirewallRule -DisplayName "Vite dev 5173 (LocalSubnet)"`
- 공용 와이파이(호텔·학교 등)는 단말 격리로 막힐 수 있다. 이때는 휴대폰 핫스팟을 쓰는 게 확실하다.
- 지도 화면은 카카오 콘솔 > 플랫폼 > Web 에 접속 주소를 등록해야 동작한다.

---

## 11. 실패 대응 (FAILURE PLAYBOOK)

| 증상 | 원인 | 조치 |
|---|---|---|
| `'node'/'git' 용어가 인식되지 않습니다` | PATH 미갱신 | §3-2 적용 |
| `npm.ps1 파일을 로드할 수 없습니다` | 실행 정책 | `npm.cmd` 사용 (§3-1) |
| `ER_ACCESS_DENIED_ERROR` | 비밀번호 불일치 | `server/.env` 의 `DB_PASSWORD` 를 사용자에게 재확인 |
| `Table 'xxx' already exists` | `01` 재실행 | 중단. §6-1 판정으로 복귀 |
| `Duplicate column name 'email'` | `02` 재실행 | 중단. 이미 적용된 상태이므로 건너뛴다 |
| `ERROR 1046 No database selected` | `-D bapfriend` 누락 | DB 지정 후 재실행 |
| `region=0` (G2) | v2 패치 미적용 | PHASE 3 복귀 |
| `EADDRINUSE :4000` / `:5173` | 포트 점유 | `netstat -ano \| Select-String ":4000"` 로 PID 확인 후 사용자에게 확인받고 정리 |
| 휴대폰에서 접속 불가 | 방화벽 또는 단말 격리 | §10-2 규칙 확인 → 없으면 격리 문제 |
| 휴대폰에서 화면은 뜨지만 데이터 없음 | `VITE_API_BASE` 가 절대 주소 | `/api` 로 수정 후 Vite 재시작 |
| 한글이 `?????` 로 저장됨 | charset 누락 | `--default-character-set=utf8mb4` 추가 |
| `.ps1` 파서 오류 | 스크립트에 한글 | ASCII로 재작성 (§3-4) |

`.env` 나 `vite.config.js` 를 수정하면 **해당 서버를 재시작**해야 반영된다.

---

## 12. 완료 보고 양식

모든 관문을 통과한 뒤, 아래를 채워서 사용자에게 보고한다. 추측값을 쓰지 말고 실측값만 넣는다.

```
접속 주소: http://localhost:5173   (휴대폰: http://<LAN IP>:5173)

[검증 결과]
G1 /api/health         200  {"ok":true}
G2 /api/codes          200  food=5 talk=3 meal=3 mbti=16 interest=12 region=7
G3 /                   200
G4 vite build          N modules, 오류 0

[환경]
Node            vX.Y.Z
MySQL           8.0.x (서비스 Running)
DB 스키마       v1 / v2 적용 여부
API 키          KAKAO_REST(o/x)  GEMINI(o/x)  KAKAO_JS(o/x)

[동작하지 않는 기능]
- (키 미설정 등으로 비활성된 기능을 명시)
```

**미검증 항목은 "확인하지 못했다"고 명시한다.** 통과하지 못한 관문을 통과한 것으로 보고하지 말 것.
