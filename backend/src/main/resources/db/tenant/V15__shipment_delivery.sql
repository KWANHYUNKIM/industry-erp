-- 출하지시서에 <b>배송 정보</b>와 출하예정일·창고·담당자를 붙인다.
--
-- 원본(이카운트) 출하지시서입력의 머리는
--   일자-No. · 거래처 · 담당자 · 출하창고 · 연락처 · 출하예정일 · 우편번호 · 주소
-- 인데 우리 출하에는 거래처·일자·적요밖에 없었다. 그래서
--   - 어디로 보낼지 적을 자리가 없다(거래처 주소와 배송지가 다른 경우가 흔하다)
--   - 언제 나가기로 했는지 없다. 미출하현황 조건에는 [출하예정일] 이 있는데 그 값이 없었다
--   - 어느 창고에서 빼는지, 누가 담당인지도 없다
ALTER TABLE shipments ADD COLUMN due_date date;
ALTER TABLE shipments ADD COLUMN warehouse_id bigint REFERENCES warehouses(id);
ALTER TABLE shipments ADD COLUMN employee_id bigint REFERENCES employees(id);
ALTER TABLE shipments ADD COLUMN contact varchar(50);
ALTER TABLE shipments ADD COLUMN postal_code varchar(10);
ALTER TABLE shipments ADD COLUMN address varchar(255);

-- FK 컬럼 인덱스는 직접 만든다(PostgreSQL 은 자동 생성하지 않는다).
CREATE INDEX idx_shipments_warehouse ON shipments (warehouse_id);
CREATE INDEX idx_shipments_employee ON shipments (employee_id);
