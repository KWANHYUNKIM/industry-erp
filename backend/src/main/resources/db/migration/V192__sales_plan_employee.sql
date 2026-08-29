-- 매출계획의 [담당자] — 원본 매출계획비교표(ESQ401R)의 조건.
--
-- 창고·거래처·프로젝트와 <b>같은 성질의 축</b>이다. 담당자를 고른 계획은 그 담당자가 친
-- 판매만 실적으로 센다. 안 고르면 그 축을 안 나눈다는 뜻이라 전부를 합친다.
--
-- FK 컬럼에는 인덱스를 직접 만든다(CLAUDE.md 7.1) — 없으면 사원을 지울 때 이 표를 전부 훑는다.
ALTER TABLE sales_plans ADD COLUMN employee_id bigint;
ALTER TABLE sales_plans ADD CONSTRAINT fk_sales_plans_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id);
CREATE INDEX idx_sales_plans_employee ON sales_plans(employee_id);
