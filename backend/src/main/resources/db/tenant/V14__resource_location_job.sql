-- 자원(설비)에 <b>위치</b>와 <b>대상작업</b>을 붙인다.
--
-- 원본(이카운트) 자원등록의 열은 자원코드 · 자원명 · 위치 · 대상작업이다
-- (사본 열 id MT0_WH = 창고, MT0_JOB = 작업). 우리 자원에는 구분·가용능력·단위·시간당비용만
-- 있어서, 설비를 등록해도 <b>어디 있는지</b>도 <b>무슨 작업에 쓰는지</b>도 알 수 없었다.
-- 공정(BOR의 작업)과 이어 두면 "이 작업은 어느 설비로 하나" 가 답이 된다.
ALTER TABLE production_resources ADD COLUMN warehouse_id bigint REFERENCES warehouses(id);
ALTER TABLE production_resources ADD COLUMN process_id bigint REFERENCES production_processes(id);

-- FK 컬럼 인덱스는 직접 만든다(PostgreSQL 은 자동 생성하지 않는다).
CREATE INDEX idx_production_resources_warehouse ON production_resources (warehouse_id);
CREATE INDEX idx_production_resources_process ON production_resources (process_id);
