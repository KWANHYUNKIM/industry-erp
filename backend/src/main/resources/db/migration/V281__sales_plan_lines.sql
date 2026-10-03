-- 매출계획입력(E040624) — 원본은 여러 줄 전표다(2026-10-04 실측: 예상매출일자-No. 머리, 줄마다 거래처 · 담당자 · 품목 · 수량 · 단가 ·
-- 예상매출액 · 비고). 우리 sales_plans 한 줄이 곧 전표 한 줄이 되고, 같은 plan_no 를 가진 줄들이 한 전표다.
ALTER TABLE sales_plans DROP CONSTRAINT uq_sales_plans_plan_no;
ALTER TABLE sales_plans ADD COLUMN line_no integer;
UPDATE sales_plans SET line_no = 1 WHERE line_no IS NULL;
ALTER TABLE sales_plans ALTER COLUMN line_no SET NOT NULL;
ALTER TABLE sales_plans ADD CONSTRAINT uq_sales_plans_plan_no_line UNIQUE (plan_no, line_no);
