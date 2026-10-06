-- 외근 주행전/주행후 계기판거리(원본 외근입력 E070254 · 외근현황 E070255, 2026-10-03 실측).
--
-- 원본은 이동수단(차량)을 고르면 그 아래 [주행전 계기판거리][주행후 계기판거리][운행거리] 세 칸이 뜬다.
-- 주행전은 그 차량의 마지막 주행후 값으로 채워지고(16,500), 주행후를 넣으면 운행거리 = 주행후 − 주행전(500).
-- 외근현황은 두 계기판 값을 열로 보이고 차량종류 계 · 합계에 더한다.
ALTER TABLE field_works ADD COLUMN odometer_before numeric(12, 2);
ALTER TABLE field_works ADD COLUMN odometer_after numeric(12, 2);
