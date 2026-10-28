-- 발주서 외화 — 원본 발주서입력은 통화 '달러 [100]' 을 고르면 옆에 환율 칸이 생기고 격자가 단가 · 외화금액 · 원화금액이 된다
-- (2026-10-29 loginaa 발주서 2026/11/12-1 실측). 구매(purchases.exchange_rate · purchase_lines.foreign_price/foreign_amount)와 같은 꼴.
-- 내자 발주서는 셋 다 비어 있다.
ALTER TABLE purchase_orders ADD COLUMN exchange_rate numeric(18,4);
ALTER TABLE purchase_order_lines ADD COLUMN foreign_price numeric(18,4);
ALTER TABLE purchase_order_lines ADD COLUMN foreign_amount numeric(18,2);
