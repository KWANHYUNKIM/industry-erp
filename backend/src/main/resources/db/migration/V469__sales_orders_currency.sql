-- 주문서 [통화] — 다른전표생성 입력 창의 통화 직접입력(내자는 비어 있음).
ALTER TABLE sales_orders ADD COLUMN currency_code varchar(10);
