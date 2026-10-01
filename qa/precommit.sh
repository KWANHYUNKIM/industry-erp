#!/usr/bin/env bash
# 커밋 전에 서버 없이 도는 검사를 한 번에 — 하나라도 실패하면 0 이 아닌 값으로 끝난다.
#
#   bash qa/precommit.sh
#
# 17회차에 'ui-check | tail -1' 로 결과만 보고 커밋하다 실패를 흘렸다(출력 끝줄만 보면 종료 코드가 안 보인다).
# 그래서 각 검사의 종료 코드를 직접 모은다. 백엔드를 고쳤으면 이것과 별개로 재기동 후 qa.mjs 를 돌린다.
set -u
cd "$(dirname "$0")/.."
fail=0
run() {
  local name="$1"; shift
  if "$@" > "${TMPDIR:-/tmp}/precommit-$name.log" 2>&1; then
    echo "  ✅ $name"
  else
    echo "  ❌ $name — ${TMPDIR:-/tmp}/precommit-$name.log"
    tail -15 "${TMPDIR:-/tmp}/precommit-$name.log" | sed 's/^/     /'
    fail=1
  fi
}
run typecheck bash -c 'cd frontend && npm run -s typecheck'
run unit      bash -c 'cd frontend && npm run -s test:unit'
run ui-check  node qa/ui-check.mjs
run dto-check node qa/dto-check.mjs
run arch      node qa/arch-check.mjs
exit $fail
