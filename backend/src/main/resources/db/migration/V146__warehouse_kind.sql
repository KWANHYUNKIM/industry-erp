-- 창고에 <b>구분</b>·생산공정·외주거래처를 붙인다.
--
-- 원본(이카운트) 창고등록리스트의 열은
--   창고코드 · 창고명 · 구분 · 생산공정명 · 외주거래처명 · 사용 · 추가사업장명
-- 이고, 실제 자료에서 구분이 '창고'/'공장' 으로 갈리며 공장인 곳에는 생산공정이 붙어 있다
-- (반제품제조=반제품공정, 완제품제조=완제품공정).
--
-- 우리 창고에는 코드·이름·위치뿐이라
--   - 생산이 일어나는 <b>공장</b>과 그냥 쌓아 두는 <b>창고</b>를 구분할 수 없었고
--   - 외주처에 보낸 자재를 담을 <b>외주 창고</b> 개념이 없었다
ALTER TABLE warehouses ADD COLUMN kind varchar(20);
UPDATE warehouses SET kind = '창고' WHERE kind IS NULL;
ALTER TABLE warehouses ALTER COLUMN kind SET NOT NULL;
ALTER TABLE warehouses ALTER COLUMN kind SET DEFAULT '창고';

ALTER TABLE warehouses ADD COLUMN process_id bigint REFERENCES production_processes(id);
ALTER TABLE warehouses ADD COLUMN outsourcing_partner_id bigint REFERENCES business_partners(id);

-- FK 컬럼 인덱스는 직접 만든다(PostgreSQL 은 자동 생성하지 않는다).
CREATE INDEX idx_warehouses_process ON warehouses (process_id);
CREATE INDEX idx_warehouses_outsourcing_partner ON warehouses (outsourcing_partner_id);
