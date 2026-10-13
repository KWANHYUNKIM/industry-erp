-- 원본 <b>생산계획/MRP리스트</b>(생산계획/MRP생성) — 계산을 한 번 돌린 것을 한 줄로 남긴다.
--
-- 원본은 [신규] 로 생성일자 · 생산계획기간 · 기준품목 · 적요를 정해 한 줄을 만들고, 그 줄의
-- [생산계획계산 생성] · [MRP계산 생성] 이 그 기간의 순소요를 계산해 결과를 <b>저장</b>한다.
-- [수정] 으로 계획수량을 손보고, [생산계획현황]·[MRP현황] 으로 보고, [작업지시서생성]·[발주계획/발주서생성] 으로 넘긴다.
-- 다시 [생성] 하면 고친 것은 사라지고 새로 계산된다(2026-10-02 loginaa 실측: "수정내역이 모두 사라지고 새롭게 계산됩니다").
--
-- 우리는 계산 결과를 그때그때 보여 주기만 해서, 고친 계획수량을 둘 곳도 "언제 무엇으로 계산했나" 도 없었다.
CREATE TABLE mrp_runs (
    id                bigserial PRIMARY KEY,
    created_at        timestamp(6),
    updated_at        timestamp(6),
    run_no            varchar(30)  NOT NULL,
    run_date          date         NOT NULL,
    period_from       date         NOT NULL,
    period_to         date         NOT NULL,
    base_item_id      bigint,
    note              varchar(300),
    plan_generated_at timestamp(6),
    mrp_generated_at  timestamp(6),
    created_by        varchar(50),
    CONSTRAINT uk_mrp_runs_run_no UNIQUE (run_no),
    CONSTRAINT fk_mrp_runs_base_item FOREIGN KEY (base_item_id) REFERENCES items(id),
    CONSTRAINT fk_mrp_runs_created_by FOREIGN KEY (created_by) REFERENCES users(username)
        ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX idx_mrp_runs_base_item ON mrp_runs (base_item_id);
CREATE INDEX idx_mrp_runs_created_by ON mrp_runs (created_by);

-- 계산 결과 — 품목 · 필요일마다 한 줄(계획이 없는 품목은 필요일 없이 한 줄). kind 가 생산계획(PLAN) · MRP 를 가른다.
CREATE TABLE mrp_run_lines (
    id              bigserial PRIMARY KEY,
    run_id          bigint        NOT NULL,
    kind            varchar(10)   NOT NULL,
    line_no         integer       NOT NULL,
    item_id         bigint        NOT NULL,
    need_date       date,
    prev_stock      numeric(18,4) NOT NULL,
    safety_stock    numeric(18,4) NOT NULL,
    min_unit        numeric(18,4) NOT NULL,
    lead_time_days  integer,
    decrease_qty    numeric(18,4) NOT NULL,
    increase_qty    numeric(18,4) NOT NULL,
    calc_qty        numeric(18,4) NOT NULL,
    plan_qty        numeric(18,4) NOT NULL,
    supplier_id     bigint,
    CONSTRAINT mrp_run_lines_kind_check CHECK (kind IN ('PLAN', 'MRP')),
    CONSTRAINT fk_mrp_run_lines_run FOREIGN KEY (run_id) REFERENCES mrp_runs(id) ON DELETE CASCADE,
    CONSTRAINT fk_mrp_run_lines_item FOREIGN KEY (item_id) REFERENCES items(id)
);
CREATE INDEX idx_mrp_run_lines_run ON mrp_run_lines (run_id);
CREATE INDEX idx_mrp_run_lines_item ON mrp_run_lines (item_id);
