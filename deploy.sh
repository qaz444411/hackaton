#!/usr/bin/env bash
# ---------------------------------------------------------------
# 랜덤 밥친구 — EC2 재배포 스크립트
#
#   사용법:  ./deploy.sh              코드 전송 + 빌드 + 재시작
#            ./deploy.sh --logs       배포 후 로그를 계속 따라감
#            ./deploy.sh --no-cache   캐시 없이 처음부터 다시 빌드
#            ./deploy.sh --status     배포하지 않고 현재 상태만 확인
#
#   Windows 는 Git Bash 에서 실행한다 (PowerShell 아님).
#
#   ※ 서버의 .env.production 은 절대 건드리지 않는다.
#      전송 아카이브에서 제외돼 있어서, 코드를 올려도 DB 비밀번호/키가
#      초기화되지 않는다.
# ---------------------------------------------------------------
set -euo pipefail

HOST="${DEPLOY_HOST:-35.86.162.39}"
USER="${DEPLOY_USER:-ubuntu}"
KEY="${DEPLOY_KEY:-kiro_package/hackathon-e1-t06-key.pem}"
REMOTE_DIR="${DEPLOY_DIR:-/home/ubuntu/bapfriend}"

FOLLOW_LOGS=0
NO_CACHE=""
STATUS_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --logs)     FOLLOW_LOGS=1 ;;
    --no-cache) NO_CACHE="--no-cache" ;;
    --status)   STATUS_ONLY=1 ;;
    *) echo "알 수 없는 옵션: $arg"; exit 1 ;;
  esac
done

cd "$(dirname "$0")"

# Windows(Git Bash)의 ssh 는 경로 해석이 갈리므로 OpenSSH 를 직접 지정한다
SSH_BIN="ssh"; SCP_BIN="scp"
if [ -x "/c/Windows/System32/OpenSSH/ssh.exe" ]; then
  SSH_BIN="/c/Windows/System32/OpenSSH/ssh.exe"
  SCP_BIN="/c/Windows/System32/OpenSSH/scp.exe"
fi
SSH="$SSH_BIN -i $KEY -o StrictHostKeyChecking=accept-new"

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

[ -f "$KEY" ] || die "SSH 키가 없다: $KEY  (DEPLOY_KEY 로 경로 지정 가능)"

# --- 상태만 보고 끝 -------------------------------------------
if [ "$STATUS_ONLY" = 1 ]; then
  say "컨테이너 상태"
  $SSH "$USER@$HOST" "cd $REMOTE_DIR && sudo docker compose --env-file .env.production ps"
  say "외부 응답"
  curl -s -m 10 -o /dev/null -w "  http://$HOST/           -> HTTP %{http_code}\n" "http://$HOST/" || true
  curl -s -m 10 -o /dev/null -w "  http://$HOST/api/health -> HTTP %{http_code}\n" "http://$HOST/api/health" || true
  exit 0
fi

# --- 1. 서버에 설정 파일이 있는지 먼저 확인 --------------------
say "서버 상태 확인"
$SSH "$USER@$HOST" "test -f $REMOTE_DIR/.env.production" \
  || die ".env.production 이 서버에 없다. 최초 1회는 서버에서 직접 만들어야 한다:
     ssh -i $KEY $USER@$HOST
     cp $REMOTE_DIR/.env.production.example $REMOTE_DIR/.env.production && vi $REMOTE_DIR/.env.production"
echo "  .env.production 존재 확인 (덮어쓰지 않음)"

# --- 2. 아카이브 생성 (비밀은 전부 제외) -----------------------
say "코드 아카이브 생성"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
tar --exclude='node_modules' --exclude='.git' --exclude='dist' \
    --exclude='.env' --exclude='.env.production' \
    --exclude='kiro_package' --exclude='*.pem' --exclude='*.log' \
    -czf "$TMP/app.tar.gz" client server db docker-compose.yml .env.production.example

# 안전장치: 비밀 파일이 섞였으면 배포를 중단한다
if tar -tzf "$TMP/app.tar.gz" | grep -Eq '(^|/)\.env$|\.env\.production$|\.pem$'; then
  die "아카이브에 비밀 파일이 섞였다. 배포 중단."
fi
echo "  $(du -h "$TMP/app.tar.gz" | cut -f1) — 비밀 파일 없음 확인"

# --- 3. 전송 및 적용 -------------------------------------------
say "서버로 전송"
$SCP_BIN -i "$KEY" -o StrictHostKeyChecking=accept-new -q "$TMP/app.tar.gz" "$USER@$HOST:/tmp/app.tar.gz"

say "빌드 및 재시작"
$SSH "$USER@$HOST" "set -eu
  cd $REMOTE_DIR
  tar -xzf /tmp/app.tar.gz -C $REMOTE_DIR
  rm -f /tmp/app.tar.gz
  sudo docker compose --env-file .env.production build $NO_CACHE
  sudo docker compose --env-file .env.production up -d
  sudo docker image prune -f >/dev/null 2>&1 || true
"

# --- 4. 배포 확인 ----------------------------------------------
say "확인"
for i in $(seq 1 30); do
  code=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://$HOST/api/health" || echo 000)
  if [ "$code" = "200" ]; then
    printf '  API  http://%s/api/health -> 200\n' "$HOST"
    printf '  WEB  http://%s/           -> %s\n' "$HOST" \
      "$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://$HOST/")"
    printf '\n\033[1;32m✓ 배포 완료 — http://%s\033[0m\n\n' "$HOST"
    [ "$FOLLOW_LOGS" = 1 ] && $SSH "$USER@$HOST" "cd $REMOTE_DIR && sudo docker compose --env-file .env.production logs -f --tail 50"
    exit 0
  fi
  sleep 2
done

printf '\n\033[1;31m✗ 헬스체크 실패. 로그를 확인한다:\033[0m\n' >&2
$SSH "$USER@$HOST" "cd $REMOTE_DIR && sudo docker compose --env-file .env.production ps && sudo docker compose --env-file .env.production logs --tail 40"
exit 1
