-- 판매 · 구매 줄 시리얼/로트: 수량 2 한 줄에 시리얼 둘을 'ㆍ' 로 이어 담는 원본 자료(69자)를 받도록 60 → 500.
ALTER TABLE sales_lines ALTER COLUMN lot_no TYPE varchar(500);
ALTER TABLE purchase_lines ALTER COLUMN lot_no TYPE varchar(500);
-- 주문서 줄 적요(원본 주문서입력 줄 열 '적요').
ALTER TABLE sales_order_lines ADD COLUMN remark varchar(255);
