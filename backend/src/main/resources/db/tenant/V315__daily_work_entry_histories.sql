-- 일용근로 근무조회 [이력](원본 E020751 이력조회): 근무 전표를 만들고 고치고 지울 때마다 한 줄. 전표가 지워져도 남도록 FK 없이 그때의 값을 적는다.
CREATE TABLE daily_work_entry_histories (
    id             BIGSERIAL PRIMARY KEY,
    slip_date      DATE         NOT NULL,
    slip_no        INTEGER      NOT NULL,
    action         VARCHAR(10)  NOT NULL CHECK (action IN ('신규', '수정', '삭제')),
    employee_name  VARCHAR(200) NOT NULL,
    pay_item_name  VARCHAR(100) NOT NULL,
    quantity       NUMERIC(10, 2) NOT NULL,
    worker         VARCHAR(100) NOT NULL,
    acted_at       TIMESTAMP    NOT NULL,
    lines_json     TEXT
);
CREATE INDEX idx_daily_work_entry_histories_slip ON daily_work_entry_histories (slip_date, slip_no);
CREATE INDEX idx_daily_work_entry_histories_acted_at ON daily_work_entry_histories (acted_at);
