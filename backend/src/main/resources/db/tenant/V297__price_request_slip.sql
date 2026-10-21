-- 단가요청을 따로 된 전표로(원본 단가요청입력 E040321 · 진행단계 E040323 · 현황 E040325, 2026-10-21 loginaa 실측).
-- 표는 그대로 purchase_orders 하나 — 요청 · 계획 · 발주서처럼 단가요청도 다른 행(status PRICE_REQUESTED)이다.
-- 줄 단가(unit_price)가 원본 현황 [구분] 의 요청단가, 진행단계 [수취단가확인] 이 수취단가, [단가확정] 이 확정단가.
-- 발주서로 베낄 때 확정단가가 발주서 단가가 된다.
ALTER TABLE purchase_orders DROP CONSTRAINT ck_purchase_orders_status;
ALTER TABLE purchase_orders ADD CONSTRAINT ck_purchase_orders_status
    CHECK (status IN ('REQUESTED', 'PLANNED', 'PRICE_REQUESTED', 'PRICED', 'ORDERED', 'RECEIVED', 'CANCELLED'));
ALTER TABLE purchase_order_lines ADD COLUMN received_price numeric(18,2);
ALTER TABLE purchase_order_lines ADD COLUMN confirmed_price numeric(18,2);
