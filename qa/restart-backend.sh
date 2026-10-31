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

# 내 커밋이 이미 지금 서버에 들어 있으면(남이 내 커밋 뒤에 재기동했다) 다시 내리지 않는다 — 작업자가 많을 때 재기동이 몇 분마다 겹쳐 모두가 502 를 맞았다
H=$(git rev-parse HEAD)
if [ -z "${FORCE:-}" ] && [ -f $RUN/.head ] && git merge-base --is-ancestor "$H" "$(cat $RUN/.head)" 2>/dev/null; then
  echo "UP — 이미 반영됨: 지금 서버($(git rev-parse --short "$(cat $RUN/.head)"))가 HEAD $(git rev-parse --short "$H") 를 담고 있다. 재기동 안 함"
  exit 0
fi

up() { [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X POST http://localhost:8081/api/auth/login \
  -H 'Content-Type: application/json' -d '{}')" != "000" ]; }

listen_pid() {   # 8081 을 듣는 프로세스 — 맥은 lsof, 윈도(Git Bash)는 netstat
  if command -v lsof >/dev/null 2>&1; then lsof -nP -iTCP:8081 -sTCP:LISTEN -t 2>/dev/null | head -1
  else netstat -ano 2>/dev/null | awk '$2 ~ /:8081$/ && $4 == "LISTENING" {print $5; exit}'; fi
}

stop_server() {
  local p pp
  if ! command -v lsof >/dev/null 2>&1; then   # 윈도: java 를 나무째(부모 maven 포함) 내린다
    p=$(listen_pid); [ -z "$p" ] && return 0
    pp=$(powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=$p').ParentProcessId" 2>/dev/null | tr -d '\r ')
    taskkill //PID "$p" //T //F >/dev/null 2>&1
    if [ -n "$pp" ] && powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=$pp').CommandLine" 2>/dev/null | grep -q plexus-classworlds; then
      taskkill //PID "$pp" //T //F >/dev/null 2>&1; fi
    for _ in $(seq 1 30); do [ -z "$(listen_pid)" ] && return 0; sleep 1; done
    return 0
  fi
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
  # 메모리 상한 — 띄우기만 하는 maven 부모가 0.9GB, 앱이 기본 상한(물리 메모리 1/4 = 4GB)까지 자라는 것을 막는다(2026-10-21, 16GB 기계에 작업자 여럿)
  # 앱 1g 는 작업자 8명이 동시에 조회하자 OutOfMemoryError(Java heap space)로 응답이 멈췄다(2026-10-21 16:4x) → 1536m
  # 멈춘 서버는 HEAD 가 같아도 내려야 하므로 FORCE=1 bash qa/restart-backend.sh <이름표> 로 '이미 반영됨' 건너뛰기를 끈다
  (cd "$1" && MAVEN_OPTS="-Xmx256m -XX:+UseSerialGC" nohup ./mvnw -o -q spring-boot:run \
     -Dspring-boot.run.arguments=--spring.flyway.out-of-order=true \
     "-Dspring-boot.run.jvmArguments=-Xmx1536m -XX:+UseSerialGC -XX:MaxMetaspaceSize=320m -XX:+ExitOnOutOfMemoryError" > $LOG 2>&1 < /dev/null &) ; disown 2>/dev/null || true
  for _ in $(seq 1 36); do sleep 5; up && return 0; done
  return 1
}

# 1) HEAD 를 꺼내 컴파일 — 실패하면 서버는 건드리지 않는다
rm -rf $NEW && mkdir -p $NEW
git archive "$H" backend | tar -x -C $NEW --strip-components=1
echo "$H" > $NEW/.head
# 로컬 비밀(backend/config/local.properties, .gitignore) — 저장소엔 비밀이 없다(docs/보안-점검.md H1). 없으면 처음 한 번 무작위로 만들고,
# 빠진 열쇠만 덧붙인다. 앱은 작업 디렉터리의 ./config/local.properties 를 읽으므로 새 폴더에 복사한다.
LOCAL=backend/config/local.properties
mkdir -p backend/config && touch $LOCAL && chmod 600 $LOCAL
grep -q '^app.jwt.secret=' $LOCAL || echo "app.jwt.secret=$(openssl rand -base64 48 | tr -d '\n')" >> $LOCAL
# 주민번호 암호화 키 — 잃으면 암호화된 값을 되살릴 수 없다. 이 파일을 지우지 말 것(백업은 DB 와 따로)
grep -q '^app.pii.key=' $LOCAL || echo "app.pii.key=$(openssl rand -base64 32 | tr -d '\n')" >> $LOCAL
mkdir -p $NEW/config && cp $LOCAL $NEW/config/local.properties
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
