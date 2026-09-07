-- 프로젝트계획조회(E040636) 격자의 [판매]·[구매]·[노무비]·[경비].
-- 원본은 계획을 네 갈래로 적는데 우리는 plan_revenue(판매)·plan_cost(원가 합계) 둘뿐이라,
-- 구매·노무비·경비를 갈라 적어도 담을 데가 아예 없었다. plan_cost 는 합계 그대로 두고
-- 갈래 셋을 더한다(달성률 계산이 plan_cost 를 쓰고 있어 뜻을 바꾸지 않는다).
ALTER TABLE project_plans ADD COLUMN plan_purchase numeric(18, 2);
ALTER TABLE project_plans ADD COLUMN plan_labor numeric(18, 2);
ALTER TABLE project_plans ADD COLUMN plan_expense numeric(18, 2);

UPDATE project_plans SET plan_purchase = 0 WHERE plan_purchase IS NULL;
UPDATE project_plans SET plan_labor    = 0 WHERE plan_labor    IS NULL;
UPDATE project_plans SET plan_expense  = 0 WHERE plan_expense  IS NULL;

ALTER TABLE project_plans ALTER COLUMN plan_purchase SET NOT NULL;
ALTER TABLE project_plans ALTER COLUMN plan_labor    SET NOT NULL;
ALTER TABLE project_plans ALTER COLUMN plan_expense  SET NOT NULL;

ALTER TABLE project_plans ALTER COLUMN plan_purchase SET DEFAULT 0;
ALTER TABLE project_plans ALTER COLUMN plan_labor    SET DEFAULT 0;
ALTER TABLE project_plans ALTER COLUMN plan_expense  SET DEFAULT 0;
