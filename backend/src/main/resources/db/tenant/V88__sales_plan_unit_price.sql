-- 매출계획에 [단가]를 준다.
--
-- 원본 매출계획입력 격자에는 <수량 · 단가 · 금액> 셋이 나란히 있다(사본 실측 —
-- ecount-column-align.json 의 매출계획입력: 금액 우 · 적요 좌 · 수량 우 … 단가 우).
-- 우리는 수량과 금액만 받아서, 계획을 세우는 사람이 <b>둘을 손으로 곱해</b> 금액 칸에
-- 적어야 했다. 단가가 없으니 "이 계획이 얼마짜리로 잡은 것인가" 도 표에서 알 수 없다 —
-- 금액을 수량으로 되나누어 짐작하는 수밖에 없었다.
--
-- 이미 있는 줄에는 <b>수량이 0이 아니면 금액÷수량</b> 을 넣는다. 그것이 그 줄이
-- 실제로 잡았던 단가다. 수량이 0인 줄(금액만 잡은 계획)은 0으로 둔다 — 나눌 수 없다.
-- 데이터가 있는 테이블이라 세 걸음으로 나눈다(nullable 추가 → 백필 → NOT NULL).

ALTER TABLE sales_plans ADD COLUMN unit_price numeric(18,2);
UPDATE sales_plans SET unit_price =
  CASE WHEN plan_qty IS NULL OR plan_qty = 0 THEN 0
       ELSE round(plan_amount / plan_qty, 2) END
 WHERE unit_price IS NULL;
ALTER TABLE sales_plans ALTER COLUMN unit_price SET NOT NULL;
