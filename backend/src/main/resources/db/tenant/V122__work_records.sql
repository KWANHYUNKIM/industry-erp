-- 관리 > 근무기록 > 근무입력(E090113) · 근무조회(E090105): 전표(일자 + 번호) 한 장에 줄 여러 개 —
-- 근무일자 · 사원 · 수당항목 · 근무기록(시간 · 일수). 급여계산이 변동수당을 셈할 때 더한다.
CREATE TABLE work_records (
    id bigserial PRIMARY KEY,
    slip_date date NOT NULL,
    slip_no integer NOT NULL,
    line_no integer NOT NULL,
    work_date date NOT NULL,
    employee_id bigint NOT NULL,
    pay_item_id bigint NOT NULL,
    quantity numeric(10,2) NOT NULL,
    created_at timestamp(6) without time zone,
    updated_at timestamp(6) without time zone,
    CONSTRAINT fk_work_records_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_work_records_pay_item FOREIGN KEY (pay_item_id) REFERENCES pay_items(id),
    CONSTRAINT uk_work_records_slip_line UNIQUE (slip_date, slip_no, line_no)
);
CREATE INDEX idx_work_records_employee ON work_records (employee_id);
CREATE INDEX idx_work_records_pay_item ON work_records (pay_item_id);
CREATE INDEX idx_work_records_work_date ON work_records (work_date);
