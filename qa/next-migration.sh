#!/usr/bin/env bash
# 다음 Flyway 번호를 본사 · 테넌트 한 쌍으로 잡는다 — 여러 작업자가 동시에 마이그레이션을 만들 때 번호가 겹치지 않게.
#
#   bash qa/next-migration.sh        # 예: V376 V249  (db/migration 번호 · db/tenant 번호)
#
# `ls` 로 최신을 보고 +1 하면 두 작업자가 같은 번호를 집는다. 여기서는 /tmp/erp-flyway-<종류>/V<n> 을 mkdir 로
# 잡는다(mkdir 은 원자적이라 한 쪽만 성공한다). 예약만 하고 안 쓴 번호는 빈 번호로 남는데, Flyway 는 빈 번호를 괜찮아한다.
#
# 주의: outOfOrder 가 꺼져 있어서, 내 번호보다 큰 번호가 먼저 DB 에 적용되면 내 마이그레이션은 기동 검증에서 막힌다.
# 번호를 잡았으면 미루지 말고 파일을 쓰고 → 커밋하고 → 재기동한다.
set -eu
cd "$(dirname "$0")/.."
DB=backend/src/main/resources/db
take() {  # $1 = 폴더(migration|tenant)
  local reserve="/tmp/erp-flyway-$1" n
  mkdir -p "$reserve"
  n=$( { ls "$DB/$1"; ls "$reserve"; } | grep -oE '^V[0-9]+' | tr -d V | sort -n | tail -1)
  while :; do
    n=$((n + 1))
    mkdir "$reserve/V$n" 2>/dev/null && break
  done
  echo "V$n"
}
echo "$(take migration) $(take tenant)"
