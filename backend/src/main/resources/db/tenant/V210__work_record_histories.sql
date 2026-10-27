-- 근무조회 [이력] (원본 E090105 이력조회): 근무 전표를 만들고 고치고 지울 때마다 한 줄.
-- 전표가 지워져도 남아야 하므로 work_records 에 FK 를 걸지 않고 그때의 값(사원 · 수당항목 · 근무기록)을 적어 둔다.
CREATE TABLE work_record_histories (
    id             BIGSERIAL PRIMARY KEY,
    slip_date      DATE         NOT NULL,
    slip_no        INTEGER      NOT NULL,
    action         VARCHAR(10)  NOT NULL CHECK (action IN ('신규', '수정', '삭제')),
    employee_name  VARCHAR(200) NOT NULL,
    pay_item_name  VARCHAR(100) NOT NULL,
    quantity       NUMERIC(10, 2) NOT NULL,
    worker         VARCHAR(100) NOT NULL,
    acted_at       TIMESTAMP    NOT NULL
);
CREATE INDEX idx_work_record_histories_slip ON work_record_histories (slip_date, slip_no);
CREATE INDEX idx_work_record_histories_acted_at ON work_record_histories (acted_at);
