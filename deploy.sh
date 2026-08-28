#!/usr/bin/env bash
# ---------------------------------------------------------------
# 랜덤 밥친구 — EC2 재배포 스크립트 (git 기반)
#
#   서버가 GitHub 에서 직접 코드를 받는다. 로컬 작업트리는 전송하지 않으므로
#   "내 PC 에서만 되던 코드"가 배포되는 일이 없고, 배포된 커밋이 항상 명확하다.
#
#   사용법:  ./deploy.sh                 origin/main 을 받아 빌드 + 재시작
#            ./deploy.sh -b feature/x    다른 브랜치로 배포
#            ./deploy.sh --logs          배포 후 로그를 계속 따라감
#            ./deploy.sh --no-cache      캐시 없이 처음부터 다시 빌드
#            ./deploy.sh --status        배포하지 않고 현재 상태만 확인
#
#   Windows 는 Git Bash 에서 실행한다 (PowerShell 아님).
#
#   ※ 서버의 .env.production 은 절대 건드리지 않는다.
#      .gitignore 에 걸려 있어 git 이 추적하지 않으므로
#      fetch / reset --hard / 최초 init 어느 경우에도 그대로 남는다.
# ---------------------------------------------------------------
set -euo pipefail

HOST="${DEPLOY_HOST:-35.86.162.39}"
USER="${DEPLOY_USER:-ubuntu}"
KEY="${DEPLOY_KEY:-kiro_package/hackathon-e1-t06-key.pem}"
REMOTE_DIR="${DEPLOY_DIR:-/home/ubuntu/bapfriend}"
REPO="${DEPLOY_REPO:-https://github.com/qaz444411/hackaton.git}"
BRANCH="${DEPLOY_BRANCH:-main}"

FOLLOW_LOGS=0; NO_CACHE=""; STATUS_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    -b|--branch) BRANCH="${2:?브랜치 이름이 필요하다}"; shift 2 ;;
    --logs)      FOLLOW_LOGS=1; shift ;;
    --no-cache)  NO_CACHE="--no-cache"; shift ;;
    --status)    STATUS_ONLY=1; shift ;;
    *) echo "알 수 없는 옵션: $1"; exit 1 ;;
  esac
done

cd "$(dirname "$0")"

# Windows(Git Bash)의 ssh 는 경로 해석이 갈리므로 OpenSSH 를 직접 지정한다
SSH_BIN="ssh"
[ -x "/c/Windows/System32/OpenSSH/ssh.exe" ] && SSH_BIN="/c/Windows/System32/OpenSSH/ssh.exe"
SSH="$SSH_BIN -i $KEY -o StrictHostKeyChecking=accept-new"

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

[ -f "$KEY" ] || die "SSH 키가 없다: $KEY  (DEPLOY_KEY 로 경로 지정 가능)"

# --- 상태만 보고 끝 -------------------------------------------
if [ "$STATUS_ONLY" = 1 ]; then
  say "서버에 배포된 커밋"
  $SSH "$USER@$HOST" "cd $REMOTE_DIR 2>/dev/null && git log --oneline -1 2>/dev/null || echo '  (아직 git 저장소가 아님 — 최초 배포 필요)'"
  say "컨테이너 상태"
  $SSH "$USER@$HOST" "cd $REMOTE_DIR && sudo docker compose --env-file .env.production ps"
  say "외부 응답"
  curl -s -m 10 -o /dev/null -w "  http://$HOST/           -> HTTP %{http_code}\n" "http://$HOST/" || true
  curl -s -m 10 -o /dev/null -w "  http://$HOST/api/health -> HTTP %{http_code}\n" "http://$HOST/api/health" || true
  exit 0
fi

# --- 1. 로컬이 푸시됐는지 확인 ---------------------------------
# 서버는 GitHub 에서 받는다. 안 밀어둔 커밋은 절대 배포되지 않으므로 미리 경고한다.
say "로컬 상태 확인"
if ! git diff --quiet HEAD 2>/dev/null; then
  echo "  ⚠ 커밋되지 않은 변경이 있다 — 서버에는 반영되지 않는다:"
  git status --short | sed 's/^/     /'
fi
git fetch -q origin "$BRANCH" 2>/dev/null || true
UNPUSHED="$(git log "origin/$BRANCH..HEAD" --oneline 2>/dev/null || true)"
if [ -n "$UNPUSHED" ]; then
  echo "  ⚠ 푸시되지 않은 커밋이 있다 — 서버에는 반영되지 않는다:"
  echo "$UNPUSHED" | sed 's/^/     /'
  printf '\n  그래도 배포할까? [y/N] '
  read -r ans
  case "$ans" in y|Y) ;; *) die "중단했다. git push 후 다시 실행한다." ;; esac
fi
echo "  배포 대상: $REPO ($BRANCH)"

# --- 2. 서버에서 코드 받기 -------------------------------------
say "서버에서 코드 받기"
$SSH "$USER@$HOST" "set -eu
  # 최초 1회: 디렉토리가 git 저장소가 아니면 '그 자리에서' 저장소로 만든다.
  # clone 을 안 쓰는 이유 — clone 은 비어있지 않은 디렉토리에 받지 못하는데
  # 여기엔 이미 .env.production 이 들어 있다. 그래서 init + fetch 로 간다.
  if [ ! -d '$REMOTE_DIR/.git' ]; then
    echo '  git 저장소가 아니다 — 그 자리에서 초기화한다 (.env.production 보존)'
    mkdir -p '$REMOTE_DIR'
    cd '$REMOTE_DIR'
    git init -q -b '$BRANCH' 2>/dev/null || { git init -q; git symbolic-ref HEAD refs/heads/'$BRANCH'; }
    git remote add origin '$REPO'
  else
    cd '$REMOTE_DIR'
    git remote set-url origin '$REPO'
  fi

  cd '$REMOTE_DIR'
  git fetch -q --depth 1 origin '$BRANCH'

  # reset 을 checkout 보다 먼저 한다.
  #   이전 방식(tarball)으로 풀어둔 파일이 untracked 로 남아 있으면 checkout 이
  #   'untracked working tree files would be overwritten' 으로 거부한다.
  #   reset --hard 는 대상 트리의 파일을 그냥 덮어써서 이 문제를 피한다.
  # .env.production 은 추적 대상이 아니라 대상 트리에 없으므로 건드려지지 않는다.
  git reset -q --hard FETCH_HEAD
  git checkout -q -B '$BRANCH' FETCH_HEAD
  printf '  배포 커밋: '; git log --oneline -1
"

# --- 3. 설정 파일 확인 (최초 배포 대비) -------------------------
$SSH "$USER@$HOST" "test -f $REMOTE_DIR/.env.production" || die ".env.production 이 서버에 없다. 최초 1회는 서버에서 직접 만든다:
     ssh -i $KEY $USER@$HOST
     cd $REMOTE_DIR
     cp .env.production.example .env.production && vi .env.production
     chmod 600 .env.production"
echo "  .env.production 유지됨 (git 추적 대상 아님)"

# --- 4. 빌드 및 재시작 ------------------------------------------
say "빌드 및 재시작"
$SSH "$USER@$HOST" "set -eu
  cd $REMOTE_DIR
  sudo docker compose --env-file .env.production build $NO_CACHE
  sudo docker compose --env-file .env.production up -d
  sudo docker image prune -f >/dev/null 2>&1 || true
"

# --- 5. 배포 확인 -----------------------------------------------
say "확인"
for _ in $(seq 1 30); do
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
