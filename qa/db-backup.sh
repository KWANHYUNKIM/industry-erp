#!/usr/bin/env bash
# 매일 백업 — qa/db-dump.sh 로 뜨고, 보관 규칙대로 오래된 것을 지운다. 작업 스케줄러 등록법은 docs/백업.md.
#
#   bash qa/db-backup.sh
#   ERP_BACKUP_COPY_DIR=/d/OneDrive/erp-backup bash qa/db-backup.sh   # 복사본도 따로 보관
#
# 보관: 최근 7개(일별) + ISO 주마다 가장 새 1개씩 4주. backups/daily(와 복사 폴더)의 erp-*.dump 만 지운다.
# pg_dump 실패 · 파일이 너무 작으면(100KB 미만) 0 이 아닌 값으로 끝난다.
set -euo pipefail
cd "$(dirname "$0")/.."
DIR=backups/daily
MIN=102400
OUT=$DIR/erp-$(date +%Y%m%d-%H%M).dump
mkdir -p "$DIR"

bash qa/db-dump.sh "$OUT" >/dev/null || { echo "백업 실패: pg_dump 오류"; rm -f "$OUT"; exit 1; }
SIZE=$(wc -c <"$OUT")
if [ "$SIZE" -lt "$MIN" ]; then echo "백업 실패: 파일이 너무 작다($SIZE 바이트) $OUT"; exit 1; fi

# 보관 정리: 이름(날짜순) 내림차순으로 훑어 최근 7개 + ISO 주별 첫(가장 새) 것 4주만 남긴다
prune() {
  local d=$1 n=0 f day wk
  local -a weeks=()
  for f in $(ls -1 "$d"/erp-*.dump 2>/dev/null | sort -r); do
    n=$((n+1))
    [ "$n" -le 7 ] && continue
    day=$(basename "$f" | sed -E 's/^erp-([0-9]{4})([0-9]{2})([0-9]{2}).*/\1-\2-\3/')
    wk=$(date -d "$day" +%G-W%V 2>/dev/null || echo "?")
    if [[ " ${weeks[*]:-} " != *" $wk "* ]] && [ "${#weeks[@]}" -lt 4 ] && [ "$wk" != "?" ]; then
      weeks+=("$wk")
    else
      rm -f "$f"
    fi
  done
}
prune "$DIR"
KEPT=$(ls -1 "$DIR"/erp-*.dump | wc -l)

COPY=""
if [ -n "${ERP_BACKUP_COPY_DIR:-}" ]; then
  mkdir -p "$ERP_BACKUP_COPY_DIR"
  cp "$OUT" "$ERP_BACKUP_COPY_DIR"/ || { echo "백업 실패: 복사 오류 $ERP_BACKUP_COPY_DIR"; exit 1; }
  prune "$ERP_BACKUP_COPY_DIR"
  COPY=" · 복사 $ERP_BACKUP_COPY_DIR"
fi
echo "백업 완료: $OUT ($((SIZE/1024)) KB) · 보관 ${KEPT}개$COPY"
