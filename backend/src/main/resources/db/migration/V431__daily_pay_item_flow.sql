-- 일용근로 수당 · 공제 항목이 근무입력 → 근무기록확정 → 급여대장으로 흐르게(원본 E020136 · E020137 · E020138 · E020139, 2026-10-21 실측).
-- 사원 [급여지급사항] 에 항목마다 내역(수당) · 금액(공제)을 두고, 근무입력 줄은 수당항목을 고르며(비면 일근무),
-- 근무기록확정은 변동(일) 수당마다 근무기록을, 급여대장 줄은 일근무 밖의 수당 · 공제 금액을 항목마다 든다.
CREATE TABLE daily_worker_pay_amounts (
    id              bigserial PRIMARY KEY,
    daily_worker_id bigint        NOT NULL REFERENCES daily_workers(id) ON DELETE CASCADE,
    item_id         bigint        NOT NULL REFERENCES daily_pay_items(id) ON DELETE CASCADE,
    amount          numeric(15,0) NOT NULL,
    CONSTRAINT uk_daily_worker_pay_amounts UNIQUE (daily_worker_id, item_id)
);
CREATE INDEX idx_daily_worker_pay_amounts_item ON daily_worker_pay_amounts (item_id);

ALTER TABLE daily_work_entries ADD COLUMN pay_item_id bigint REFERENCES daily_pay_items(id);
CREATE INDEX idx_daily_work_entries_pay_item ON daily_work_entries (pay_item_id);

CREATE TABLE daily_work_confirm_items (
    id         bigserial PRIMARY KEY,
    confirm_id bigint        NOT NULL REFERENCES daily_work_confirms(id) ON DELETE CASCADE,
    item_id    bigint        NOT NULL REFERENCES daily_pay_items(id),
    days       numeric(10,2) NOT NULL
);
CREATE INDEX idx_daily_work_confirm_items_confirm ON daily_work_confirm_items (confirm_id);
CREATE INDEX idx_daily_work_confirm_items_item ON daily_work_confirm_items (item_id);

CREATE TABLE daily_pay_line_items (
    id       bigserial PRIMARY KEY,
    line_id  bigint        NOT NULL REFERENCES daily_pay_lines(id) ON DELETE CASCADE,
    item_id  bigint        NOT NULL REFERENCES daily_pay_items(id),
    quantity numeric(10,2),
    amount   numeric(15,0) NOT NULL
);
CREATE INDEX idx_daily_pay_line_items_line ON daily_pay_line_items (line_id);
CREATE INDEX idx_daily_pay_line_items_item ON daily_pay_line_items (item_id);
