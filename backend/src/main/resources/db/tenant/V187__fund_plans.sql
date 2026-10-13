-- 회계 II > 자금계획 [계획전표입력] — 원본 E020511 계획전표조회 [신규(F2)] 창(2026-10-12 loginaa 실측).
-- 입출구분(출금/입금) · 발생일자 · 부서 · 프로젝트 · 입력구분(예금(현금)/어음) + 계좌 · 상대계정 · 거래처 · 금액 · 적요.
-- 원본은 아무 칸도 필수가 아니다(빈 창 저장 → 금액 빈 줄 하나). 회계반영 전에는 분개가 없다.
CREATE TABLE fund_plans (
    id               bigserial PRIMARY KEY,
    direction        varchar(10) NOT NULL CHECK (direction IN ('OUT', 'IN')),
    plan_date        date NOT NULL,
    department_id    bigint REFERENCES departments(id),
    project_id       bigint REFERENCES projects(id),
    method           varchar(10) NOT NULL CHECK (method IN ('DEPOSIT', 'NOTE')),
    bank_account_id  bigint REFERENCES bank_accounts(id),
    note_no          varchar(50),
    counter_account_id bigint REFERENCES accounts(id),
    partner_id       bigint REFERENCES business_partners(id),
    amount           numeric(18,2) NOT NULL DEFAULT 0,
    memo             varchar(300),
    created_by       varchar(50),
    updated_by       varchar(50),
    created_at       timestamp(6),
    updated_at       timestamp(6)
);
CREATE INDEX idx_fund_plans_department_id ON fund_plans (department_id);
CREATE INDEX idx_fund_plans_project_id ON fund_plans (project_id);
CREATE INDEX idx_fund_plans_bank_account_id ON fund_plans (bank_account_id);
CREATE INDEX idx_fund_plans_counter_account_id ON fund_plans (counter_account_id);
CREATE INDEX idx_fund_plans_partner_id ON fund_plans (partner_id);
CREATE INDEX idx_fund_plans_plan_date ON fund_plans (plan_date);
