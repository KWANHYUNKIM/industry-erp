-- 본사 V375 와 같다 — 발주계획 줄의 [입력수량] · [최종계산일자].
ALTER TABLE purchase_order_lines ADD COLUMN input_quantity numeric(18,2);
ALTER TABLE purchase_order_lines ADD COLUMN plan_calc_date date;
UPDATE purchase_order_lines l SET input_quantity = l.quantity,
    plan_calc_date = (SELECT o.order_date FROM purchase_orders o WHERE o.id = l.purchase_order_id);
