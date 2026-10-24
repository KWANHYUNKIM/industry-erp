-- 외근조회(E070254) 원본은 외근을 '차량 운행 기록'으로 적는다(2026-10-03 실측):
-- 사용자 · 이동수단(차량번호·차량명) · 사용목적명 · 출발지 주소 · 도착지 주소 · 운행거리 · 적요.
-- 필수는 사용자와 이동수단뿐이라 도착지(destination)·적요(purpose)는 비워 둘 수 있게 한다.
ALTER TABLE field_works ADD COLUMN departure varchar(200);
ALTER TABLE field_works ADD COLUMN vehicle_no varchar(30);
ALTER TABLE field_works ADD COLUMN vehicle_name varchar(100);
ALTER TABLE field_works ADD COLUMN use_purpose varchar(100);
ALTER TABLE field_works ADD COLUMN distance numeric(12, 2);
ALTER TABLE field_works ALTER COLUMN destination DROP NOT NULL;
ALTER TABLE field_works ALTER COLUMN purpose DROP NOT NULL;
