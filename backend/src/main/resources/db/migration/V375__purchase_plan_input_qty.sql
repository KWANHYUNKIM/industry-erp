-- 발주계획조회 [수량조정] 창(C000076, 2026-10-13 loginaa 실측): 줄마다 [입력수량] · [발주확정수량] · [최종계산일자] 를 따로 보인다.
-- 격자에서 수량을 7 → 9 로 고쳐도 [입력수량] 은 7 그대로였다 — 처음 넣은 수량을 따로 둔다. 목록 [수량] 이 곧 발주확정수량이다.
ALTER TABLE public.purchase_order_lines ADD COLUMN input_quantity numeric(18,2);
ALTER TABLE public.purchase_order_lines ADD COLUMN plan_calc_date date;
UPDATE public.purchase_order_lines l SET input_quantity = l.quantity,
    plan_calc_date = (SELECT o.order_date FROM public.purchase_orders o WHERE o.id = l.purchase_order_id);
