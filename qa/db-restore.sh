#!/usr/bin/env bash
# qa/db-dump.sh 로 뜬 파일을 이 PC 의 개발 DB 에 되살린다. **이 PC 의 erp DB 는 통째로 지워지고 덤프 내용으로 바뀐다.**
#
#   docker compose up -d               # DB 컨테이너가 먼저 떠 있어야 한다
#   bash qa/db-restore.sh backups/erp-20261027-1700.dump
#
# 되살린 뒤 백엔드를 띄우면(./mvnw spring-boot:run) 덤프 뒤에 생긴 마이그레이션만 Flyway 가 이어서 적용한다.
# 덤프를 뜬 쪽보다 코드가 오래되면(덤프에 더 새 마이그레이션이 있으면) 기동이 거절된다 — git pull 먼저.
set -euo pipefail
cd "$(dirname "$0")/.."
F=${1:?사용법: bash qa/db-restore.sh <덤프 파일>}
[ -f "$F" ] || { echo "파일이 없다: $F"; exit 1; }
C=${ERP_DB_CONTAINER:-erp-postgres}
export MSYS_NO_PATHCONV=1

read -r -p "이 PC 의 erp DB 를 지우고 $F 로 바꿉니다. 계속할까요? (yes 입력) " ans
[ "$ans" = "yes" ] || { echo "그만둠"; exit 1; }

docker cp "$F" "$C":/tmp/erp.dump
# 접속을 끊고 DB 를 새로 만든 뒤 덤프를 붓는다
docker exec "$C" psql -U erp -d postgres -qc "select pg_terminate_backend(pid) from pg_stat_activity where datname='erp' and pid <> pg_backend_pid()" >/dev/null
docker exec "$C" dropdb -U erp --if-exists erp
docker exec "$C" createdb -U erp erp
docker exec "$C" pg_restore -U erp -d erp --no-owner /tmp/erp.dump
docker exec "$C" rm -f /tmp/erp.dump
echo "되살림 끝 — 회사 스키마: $(docker exec "$C" psql -U erp -d erp -Atc "select string_agg(nspname, ' ' order by nspname) from pg_namespace where nspname like 'co_%'")"
