-- 관리 > 수당/공제그룹등록(E090104): 원본 [수당/공제그룹코드](00001 꼴)와 [적용사원등록](사원 · 지급율%).
ALTER TABLE pay_groups ADD COLUMN code varchar(20);
UPDATE pay_groups g SET code = lpad(n.rn::text, 5, '0')
  FROM (SELECT id, row_number() OVER (ORDER BY id) AS rn FROM pay_groups) n
 WHERE n.id = g.id;
ALTER TABLE pay_groups ALTER COLUMN code SET NOT NULL;
ALTER TABLE pay_groups ADD CONSTRAINT uk_pay_groups_code UNIQUE (code);

CREATE TABLE pay_group_employees (
    id bigserial PRIMARY KEY,
    group_id bigint NOT NULL,
    employee_id bigint NOT NULL,
    rate numeric(7,2) NOT NULL DEFAULT 100,
    CONSTRAINT fk_pay_group_employees_group FOREIGN KEY (group_id) REFERENCES pay_groups(id),
    CONSTRAINT fk_pay_group_employees_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT uk_pay_group_employees_employee UNIQUE (employee_id)
);
CREATE INDEX idx_pay_group_employees_group ON pay_group_employees (group_id);
