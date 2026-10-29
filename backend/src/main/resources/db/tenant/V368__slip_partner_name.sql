-- 판매 · 구매 · 견적 · 주문 전표에 거래처명 스냅샷.
-- 원본: 임의거래처(12341234)를 고르면 거래처 이름 칸을 고칠 수 있고 저장한 이름이 목록 거래처명이 된다(2026-10-28 실측).
-- 옛 전표는 지금 거래처 이름으로 채운다.
ALTER TABLE sales ADD COLUMN partner_name varchar(200);
ALTER TABLE purchases ADD COLUMN partner_name varchar(200);
ALTER TABLE quotations ADD COLUMN partner_name varchar(200);
ALTER TABLE sales_orders ADD COLUMN partner_name varchar(200);

UPDATE sales s SET partner_name = p.name FROM business_partners p WHERE p.id = s.partner_id;
UPDATE purchases s SET partner_name = p.name FROM business_partners p WHERE p.id = s.partner_id;
UPDATE quotations s SET partner_name = p.name FROM business_partners p WHERE p.id = s.partner_id;
UPDATE sales_orders s SET partner_name = p.name FROM business_partners p WHERE p.id = s.partner_id;
