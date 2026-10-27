#!/usr/bin/env bash
# 로컬 개발 DB(erp-postgres 컨테이너의 erp)를 파일 하나로 뜬다 — 집 · 다른 PC 에서 qa/db-restore.sh 로 그대로 되살린다.
#
#   bash qa/db-dump.sh                 # → backups/erp-YYYYMMDD-HHMM.dump
#   bash qa/db-dump.sh 경로.dump        # 파일 이름을 직접
#
# 본사(public) + 회사별 스키마(co_0002 …) + Flyway 기록까지 전부 들어간다(pg_dump -Fc, 압축).
# 파일에는 시험 자료 · 사용자 비밀번호 해시가 들어 있다 — 공개된 곳(공개 저장소 · 공개 링크)에 올리지 말 것.
# backups/ 는 .gitignore 에 있다(저장소에 넣지 않는다). 옮길 때는 본인만 보는 클라우드 드라이브나 USB 로.
set -euo pipefail
cd "$(dirname "$0")/.."
C=${ERP_DB_CONTAINER:-erp-postgres}
OUT=${1:-backups/erp-$(date +%Y%m%d-%H%M).dump}
mkdir -p "$(dirname "$OUT")"
# Git Bash 가 /tmp 를 윈도 경로로 바꾸지 않게
export MSYS_NO_PATHCONV=1
docker exec "$C" pg_dump -U erp -d erp -Fc -f /tmp/erp.dump
docker cp "$C":/tmp/erp.dump "$OUT"
docker exec "$C" rm -f /tmp/erp.dump
echo "덤프: $OUT ($(du -h "$OUT" | cut -f1))"
