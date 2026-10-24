-- 관리 > 사원등록 [기타설정] (원본 E090101): 사원마다 4대보험 계산 여부 · 국민연금 기준소득월액 · 원천징수 공제대상가족.
-- 급여계산이 이 값으로 4대보험 · 소득세를 셈한다(원본 2026-10-13 실측, 변종호 2019-002):
--   건강보험/고용보험 '안함' → 그 공제 줄 없음, 국민연금 '기준소득월액기준' → 급여가 아니라 기준소득월액에 요율.
--   소득세 = (간이세액표[과세급여, 본인 + 배우자 + 공제대상가족] - 8~20세 자녀 공제) × 간이세액표 적용방법(80/100/120%), 10원 미만 버림.
CREATE TABLE employee_payroll_settings (
    id bigserial PRIMARY KEY,
    employee_id bigint NOT NULL,
    health_mode varchar(10) NOT NULL DEFAULT 'AUTO',
    long_term_care boolean NOT NULL DEFAULT true,
    pension_mode varchar(10) NOT NULL DEFAULT 'AUTO',
    pension_base_amount numeric(18,2),
    employment_mode varchar(10) NOT NULL DEFAULT 'AUTO',
    spouse_deduction boolean NOT NULL DEFAULT false,
    dependents integer NOT NULL DEFAULT 0,
    children integer NOT NULL DEFAULT 0,
    tax_scale integer NOT NULL DEFAULT 100,
    created_at timestamp(6),
    updated_at timestamp(6),
    CONSTRAINT fk_employee_payroll_settings_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT uk_employee_payroll_settings_employee UNIQUE (employee_id),
    CONSTRAINT employee_payroll_settings_health_mode_check CHECK (health_mode IN ('AUTO', 'NONE')),
    CONSTRAINT employee_payroll_settings_pension_mode_check CHECK (pension_mode IN ('AUTO', 'NONE')),
    CONSTRAINT employee_payroll_settings_employment_mode_check CHECK (employment_mode IN ('AUTO', 'NONE')),
    CONSTRAINT employee_payroll_settings_pension_base_amount_check CHECK (pension_base_amount >= 0),
    CONSTRAINT employee_payroll_settings_dependents_check CHECK (dependents >= 0),
    CONSTRAINT employee_payroll_settings_children_check CHECK (children >= 0),
    CONSTRAINT employee_payroll_settings_tax_scale_check CHECK (tax_scale IN (80, 100, 120))
);
