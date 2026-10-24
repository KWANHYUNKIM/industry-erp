-- 발주요청조회 [종결여부] · 하단 [진행상태변경] — 본사 V356 과 같다.
ALTER TABLE purchase_orders ADD COLUMN request_progress varchar(20);
ALTER TABLE purchase_orders ADD CONSTRAINT ck_purchase_orders_request_progress
    CHECK (request_progress IN ('UNCONFIRMED', 'IN_PROGRESS', 'COMPLETED'));
