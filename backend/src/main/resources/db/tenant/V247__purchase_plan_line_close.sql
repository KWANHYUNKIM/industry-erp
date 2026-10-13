-- 본사 V374 와 같다 — 발주계획 줄 종결 · 발주서 최종수정자.
ALTER TABLE purchase_order_lines ADD COLUMN plan_closed boolean NOT NULL DEFAULT false;
ALTER TABLE purchase_orders ADD COLUMN updated_by varchar(50);
UPDATE purchase_orders SET updated_by = created_by WHERE updated_by IS NULL;
