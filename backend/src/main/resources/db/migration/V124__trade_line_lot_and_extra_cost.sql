-- 판매·구매 명세 라인에 시리얼/로트와 부대비용을 추가한다.
-- 이카운트 판매입력(ESD006M) 그리드의 serial_cd / cust_amt 컬럼에 대응한다.
-- 둘 다 선택 입력이라 nullable 이다. 기존 행 백필이 필요 없다.

ALTER TABLE sales_lines ADD COLUMN lot_no varchar(60);
ALTER TABLE sales_lines ADD COLUMN extra_cost numeric(18,2);

ALTER TABLE purchase_lines ADD COLUMN lot_no varchar(60);
ALTER TABLE purchase_lines ADD COLUMN extra_cost numeric(18,2);
