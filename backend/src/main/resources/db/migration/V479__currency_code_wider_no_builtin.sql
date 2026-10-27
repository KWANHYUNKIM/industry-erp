-- 외화등록(재고1 QA 2026-10-23 · 원본 실측).
-- 1) 원본 외화코드는 사용자가 정하는 코드다('00001' · '100' · '500' …) — 3자 제한을 풀어 다른 통화 컬럼(varchar(10))과 맞춘다.
-- 2) 원본 외화리스트는 회사가 직접 등록한 것만 있다. 우리가 처음부터 깔던 USD · JPY · EUR · CNY 를 빼되,
--    이미 고시환율이나 전표 · 계좌 · 거래처가 쓰는 것은 건드리지 않는다.
ALTER TABLE currencies ALTER COLUMN code TYPE varchar(10);

DELETE FROM currencies c
 WHERE c.code IN ('USD', 'JPY', 'EUR', 'CNY')
   AND NOT EXISTS (SELECT 1 FROM exchange_rates x WHERE x.currency_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM export_orders x WHERE x.currency_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM bank_accounts x WHERE x.currency_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM payment_agencies x WHERE x.currency_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM purchase_orders x WHERE x.currency = c.code)
   AND NOT EXISTS (SELECT 1 FROM purchases x WHERE x.currency_code = c.code)
   AND NOT EXISTS (SELECT 1 FROM sales_orders x WHERE x.currency_code = c.code)
   AND NOT EXISTS (SELECT 1 FROM business_partners x WHERE x.currency_code = c.code)
   AND NOT EXISTS (SELECT 1 FROM journal_lines x WHERE x.currency_code = c.code);
