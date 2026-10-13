-- 품질검사요청입력 줄 [추가수량] — 원본 E040628(2026-10-13 실측): 추가수량을 넣으면 수량이 그 값으로 바뀌고, 저장 뒤 다시 열어도 남는다.
ALTER TABLE quality_inspection_request_lines ADD COLUMN extra_qty numeric(18,2);
