-- 관리 > 사원등록 [급여지급사항] (원본 E090101): 사원마다 수당항목 · 공제항목의 금액.
-- 고정수당 · 월정공제는 그 금액이 그대로 명세 줄이 되고, 일급수당 · 시급수당은 단가다(근무기록확정 × 단가).
-- 원본 계산식 'R( 야근수당(급여지급사항) * 야근수당(근무기록확정) , 0 )' 의 '(급여지급사항)'.
CREATE TABLE employee_pay_items (
    id bigserial PRIMARY KEY,
    employee_id bigint NOT NULL,
    pay_item_id bigint NOT NULL,
    amount numeric(18,2) NOT NULL,
    created_at timestamp(6),
    updated_at timestamp(6),
    CONSTRAINT fk_employee_pay_items_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_employee_pay_items_pay_item FOREIGN KEY (pay_item_id) REFERENCES pay_items(id),
    CONSTRAINT uk_employee_pay_items UNIQUE (employee_id, pay_item_id),
    CONSTRAINT employee_pay_items_amount_check CHECK (amount >= 0)
);
CREATE INDEX idx_employee_pay_items_pay_item ON employee_pay_items (pay_item_id);
