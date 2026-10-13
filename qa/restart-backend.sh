#!/usr/bin/env bash
# 공유 백엔드(8081)를 **커밋된 HEAD** 로 재기동한다 — 작업 트리의 커밋 안 된 코드(마이그레이션 초안 · 엔티티만 바꾼 것 ·
# 반쯤 고친 파일)가 모두의 서버를 깨지 않게.
#
#   bash qa/restart-backend.sh <모듈>        # 예: bash qa/restart-backend.sh 회계1
#
# 2026-10-13 밤 공유 작업 트리에서 재기동하다 다섯 번 서버가 멈췄다(살아 있는 target 컴파일 · 컬럼 타입 · 미커밋 마이그레이션 초안 ·
# 마이그레이션 없는 엔티티 · 이름 바뀐 옛 마이그레이션 사본). 그래서 서버는 HEAD 를 꺼낸 사본에서만 띄운다.
# 내 백엔드 변경을 서버에서 보려면 **먼저 커밋**한다.
#
# 공유 개발 서버는 Flyway out-of-order 로 띄운다(본사 · 테넌트 둘 다) — 여럿이 받은 마이그레이션 번호의 커밋 차례가 엇갈려도 거절하지 않게.
# 순서: 재기동 잠금 → HEAD 의 backend 를 새 폴더로 꺼냄 → 거기서 컴파일(실패하면 서버는 그대로 두고 끝)
#       → 옛 서버를 내림 → 새 폴더에서 띄움 → 3분 안에 응답하는지 → 안 뜨면 직전 폴더로 되돌려 띄움.
set -u
cd "$(dirname "$0")/.."
WHO=${1:-unknown}
L=/tmp/erp-backend-restart.lock
RUN=/tmp/erp-run-shared          # 지금 서버가 도는 폴더
PREV=/tmp/erp-run-shared.prev    # 직전 폴더(되돌리기용)
NEW=/tmp/erp-run-shared.new
LOG=/tmp/erp-backend.log

[ -d $L ] && [ -n "$(find $L -maxdepth 0 -mmin +15)" ] && rm -rf $L      # 15분 넘은 잠금은 죽은 작업자 것
mkdir $L 2>/dev/null || { echo "재기동 잠금을 남이 쥐고 있다: $(cat $L/owner 2>/dev/null) — 2분 뒤 다시"; exit 2; }
echo "$WHO $(date +%T) restart-backend.sh $(git rev-parse --short HEAD)" > $L/owner
trap 'rm -rf $L' EXIT

up() { [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X POST http://localhost:8081/api/auth/login \
  -H 'Content-Type: application/json' -d '{}')" != "000" ]; }

stop_server() {
  local p pp
  p=$(lsof -nP -iTCP:8081 -sTCP:LISTEN -t 2>/dev/null | head -1)
  [ -z "$p" ] && return 0
  pp=$(ps -o ppid= -p "$p" | tr -d ' ')
  # spring-boot:run 은 maven(부모)이 java(자식)를 띄운다 — 둘 다 내린다
  if ps -o command= -p "$pp" 2>/dev/null | grep -q plexus-classworlds; then kill "$pp" 2>/dev/null; fi
  kill "$p" 2>/dev/null
  for _ in $(seq 1 30); do lsof -nP -iTCP:8081 -sTCP:LISTEN -t >/dev/null 2>&1 || return 0; sleep 1; done
  kill -9 "$p" 2>/dev/null; sleep 2
}

start_from() {   # $1 = 폴더
  (cd "$1" && nohup ./mvnw -o -q spring-boot:run -Dspring-boot.run.arguments=--spring.flyway.out-of-order=true > $LOG 2>&1 &) ; disown 2>/dev/null || true
  for _ in $(seq 1 36); do sleep 5; up && return 0; done
  return 1
}

# 1) HEAD 를 꺼내 컴파일 — 실패하면 서버는 건드리지 않는다
rm -rf $NEW && mkdir -p $NEW
git archive HEAD backend | tar -x -C $NEW --strip-components=1
if ! (cd $NEW && ./mvnw -o -q compile) > /tmp/erp-backend-compile.log 2>&1; then
  echo "HEAD $(git rev-parse --short HEAD) 컴파일 실패 — 서버는 그대로 둔다:"
  grep -E '^\[ERROR\].*\.java' /tmp/erp-backend-compile.log | head -5
  rm -rf $NEW; exit 1
fi

# 2) 옛 서버를 내리고 새 폴더로 바꿔 띄운다
stop_server
rm -rf $PREV; [ -d $RUN ] && mv $RUN $PREV
mv $NEW $RUN
if start_from $RUN; then
  echo "UP — HEAD $(git rev-parse --short HEAD), 폴더 $RUN, 기록 $LOG"
  exit 0
fi

# 3) 안 떴다 — 직전 폴더로 되돌린다
echo "새 서버가 3분 안에 뜨지 않았다. 마지막 기록:"; grep -E 'ERROR|Caused by|APPLICATION FAILED' $LOG | head -8
stop_server
if [ -d $PREV ]; then
  rm -rf $RUN.failed; mv $RUN $RUN.failed; mv $PREV $RUN
  start_from $RUN && { echo "직전 폴더로 되돌려 다시 띄웠다(실패한 HEAD 는 $RUN.failed). 원인을 고쳐 커밋한 뒤 다시."; exit 1; }
fi
echo "되돌리기도 실패 — 사용자에게 알린다"; exit 1
