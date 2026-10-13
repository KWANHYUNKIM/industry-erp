-- 관리 > 급여계산/대장 [사전작업] 금액직접입력(원본 E090106 '수당/공제 항목입력'): 귀속월(대장)마다 사원 · 항목별로 손으로 정한 금액.
-- 급여계산이 그 항목의 셈 대신 이 금액을 쓴다(기본급 · 수당 · 공제 모두). 항목은 이름으로 든다 — 기본급 · 법정 공제는 pay_items 에 없다.
CREATE TABLE pay_direct_amounts (
    id bigserial PRIMARY KEY,
    pay_month varchar(7) NOT NULL,
    employee_id bigint NOT NULL,
    kind varchar(20) NOT NULL,
    item_name varchar(100) NOT NULL,
    amount numeric(18,2) NOT NULL,
    memo varchar(200),
    created_at timestamp(6),
    updated_at timestamp(6),
    CONSTRAINT fk_pay_direct_amounts_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT uk_pay_direct_amounts UNIQUE (pay_month, employee_id, kind, item_name),
    CONSTRAINT pay_direct_amounts_kind_check CHECK (kind IN ('ALLOWANCE', 'DEDUCTION')),
    CONSTRAINT pay_direct_amounts_amount_check CHECK (amount >= 0)
);
CREATE INDEX idx_pay_direct_amounts_employee ON pay_direct_amounts (employee_id);
