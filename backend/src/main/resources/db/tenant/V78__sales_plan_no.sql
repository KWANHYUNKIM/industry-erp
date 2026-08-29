-- 매출계획에 전표일자와 전표번호를 준다.
--
-- 원본 매출계획 격자의 첫 열은 [일자-No.] 다(사본 실측). 계획 한 줄을 가리킬 이름이
-- 없어서, 어느 계획을 고쳤다거나 지웠다고 말할 방법이 없었다.
--
-- plan_date 는 예상매출일자가 있으면 그것, 없으면 계획연월 1일이다. 예상매출일자는
-- 계획연월과 어긋날 수 없도록 서비스가 막고 있으므로 둘이 갈라질 일은 없다.
-- 데이터가 있는 테이블이라 세 걸음으로 나눈다(nullable 추가 → 백필 → NOT NULL).

ALTER TABLE sales_plans ADD COLUMN plan_date date;
UPDATE sales_plans SET plan_date = coalesce(expected_date, make_date(plan_year, plan_month, 1))
 WHERE plan_date IS NULL;
ALTER TABLE sales_plans ALTER COLUMN plan_date SET NOT NULL;

ALTER TABLE sales_plans ADD COLUMN plan_no varchar(30);
UPDATE sales_plans p SET plan_no = n.no FROM (
  SELECT id, 'SP-' || to_char(plan_date, 'YYYYMMDD') || '-'
         || lpad((row_number() OVER (PARTITION BY plan_date ORDER BY id))::text, 4, '0') AS no
    FROM sales_plans
) n WHERE p.id = n.id AND p.plan_no IS NULL;
ALTER TABLE sales_plans ALTER COLUMN plan_no SET NOT NULL;
ALTER TABLE sales_plans ADD CONSTRAINT uq_sales_plans_plan_no UNIQUE (plan_no);

CREATE INDEX idx_sales_plans_plan_date ON sales_plans (plan_date);
