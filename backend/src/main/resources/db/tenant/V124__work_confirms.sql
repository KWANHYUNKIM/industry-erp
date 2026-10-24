-- 관리 > 급여계산/대장 [사전작업] 근무기록확정 · 근무확정현황(E090116): 귀속월마다 사원 · 변동수당 항목별로 확정한 근무기록.
-- 급여계산은 근무입력이 아니라 이 확정값을 쓴다(원본 계산식 '야근수당(근무기록확정)').
CREATE TABLE work_confirms (
    id bigserial PRIMARY KEY,
    pay_month varchar(7) NOT NULL,
    employee_id bigint NOT NULL,
    pay_item_id bigint NOT NULL,
    quantity numeric(10,2) NOT NULL,
    CONSTRAINT fk_work_confirms_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_work_confirms_pay_item FOREIGN KEY (pay_item_id) REFERENCES pay_items(id),
    CONSTRAINT uk_work_confirms_month_emp_item UNIQUE (pay_month, employee_id, pay_item_id)
);
CREATE INDEX idx_work_confirms_employee ON work_confirms (employee_id);
CREATE INDEX idx_work_confirms_pay_item ON work_confirms (pay_item_id);
