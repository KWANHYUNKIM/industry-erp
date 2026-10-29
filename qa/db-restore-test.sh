#!/usr/bin/env bash
# 가장 새 백업이 실제로 되살려지는지 시험한다 — 임시 DB(erp_restore_test)에만 붓고 지운다. 운영 erp DB 는 읽기만 한다.
#
#   bash qa/db-restore-test.sh [덤프 파일]     # 없으면 backups/daily 의 가장 새 것
set -euo pipefail
cd "$(dirname "$0")/.."
C=${ERP_DB_CONTAINER:-erp-postgres}
T=erp_restore_test
export MSYS_NO_PATHCONV=1
F=${1:-$(ls -1 backups/daily/erp-*.dump 2>/dev/null | sort | tail -1)}
[ -n "$F" ] && [ -f "$F" ] || { echo "덤프 파일이 없다"; exit 1; }

q() { docker exec "$C" psql -U erp -d "$1" -Atc "$2" 2>/dev/null || echo "-"; }
cleanup() { docker exec "$C" dropdb -U erp --if-exists "$T" >/dev/null 2>&1 || true; docker exec "$C" rm -f /tmp/restore-test.dump >/dev/null 2>&1 || true; }
trap cleanup EXIT

cleanup
docker cp "$F" "$C":/tmp/restore-test.dump
docker exec "$C" createdb -U erp "$T"
docker exec "$C" pg_restore -U erp -d "$T" --no-owner /tmp/restore-test.dump 2>&1 | grep -v '^$' | head -5 || true

echo "덤프: $F"
printf '%-28s %12s %12s\n' 항목 복원본 운영
fail=0
cmp() { # 이름 SQL
  local a b; a=$(q "$T" "$2"); b=$(q erp "$2")
  printf '%-28s %12s %12s\n' "$1" "$a" "$b"
  [ "$a" = "-" ] && fail=1
  return 0
}
cmp "회사 스키마(co_%)" "select count(*) from pg_namespace where nspname like 'co\_%'"
cmp "flyway 최대 버전" "select max(version::int) from flyway_schema_history where success"
for t in items journal_entries sales users stock_transactions; do
  cmp "public.$t" "select count(*) from public.$t"
done
[ "$fail" = 0 ] || { echo "시험 실패: 복원본에서 조회되지 않는 항목이 있다"; exit 1; }
echo "복원 시험 통과 (운영 DB 와의 차이는 백업 이후 입력분)"
