-- 퇴직금계산(E030117) — 퇴직금과 퇴직소득세를 셈해 남긴다.
--
-- 원본은 사원을 고르면 최근 3개월 급여 · 1년 상여로 1일 평균임금을 내고(ⓖ = ⓔ/ⓕ),
-- 퇴직산출액 = ⓖ × 30 × 재직일수 / 365(윤년 366) 으로 퇴직급여를 채운 뒤 퇴직소득세(근속연수공제 →
-- 환산급여 → 환산급여별공제 → 세율 → × 근속연수/12)를 계산한다. 퇴직급여는 손으로 고칠 수 있고
-- 고치면 세금만 다시 센다. 그래서 계산에 쓴 값과 결과를 같이 저장한다.
CREATE TABLE retirement_pays (
    id                 bigserial PRIMARY KEY,
    employee_id        bigint NOT NULL REFERENCES employees (id),
    withholding_month  varchar(7) NOT NULL,
    pay_date           date NOT NULL,
    start_date         date NOT NULL,
    retire_date        date NOT NULL,
    retire_reason      varchar(50),
    executive          boolean NOT NULL DEFAULT false,
    wage_3m            numeric(18, 2) NOT NULL DEFAULT 0,
    bonus_1y           numeric(18, 2) NOT NULL DEFAULT 0,
    extra_pay          numeric(18, 2) NOT NULL DEFAULT 0,
    work_days_3m       integer NOT NULL DEFAULT 0,
    service_days       integer NOT NULL DEFAULT 0,
    service_months     integer NOT NULL DEFAULT 0,
    service_years      integer NOT NULL DEFAULT 0,
    retirement_pay     numeric(18, 2) NOT NULL DEFAULT 0,
    non_taxable        numeric(18, 2) NOT NULL DEFAULT 0,
    income_tax         numeric(18, 2) NOT NULL DEFAULT 0,
    local_income_tax   numeric(18, 2) NOT NULL DEFAULT 0,
    created_at         timestamp,
    updated_at         timestamp
);
CREATE INDEX idx_retirement_pays_employee ON retirement_pays (employee_id);
