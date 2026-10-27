-- 관리 > 사원등록 [기타설정] 나머지 칸 (원본 E090101, 2026-10-13 loginaa 실측 — 2019-002 변종호, QA 대장 '이번 지급사항만으로 소득세 등 계산'):
--   건강 · 고용보험 '보수월액기준'(+ 보수월액) → 그 공제 줄이 빈다(보수월액 3,000,000 · 2,000,000 을 넣어도 대장에 안 찍힘).
--   보험료경감 '대상' → 장기요양만 0.7 배(19,070 → 13,340, 10원 미만 버림을 두 번). 건강보험료는 그대로.
--   단일세율 → 소득세 = 지급총액(비과세 포함) × 19 % (4,138,000 → 786,220), 4대보험 기준도 지급총액.
--   종교관련종사자 · 세대주여부 · 무주택자 · 외국인 · 비거주자 → 급여 셈에 변화 없음(값만 둔다).
ALTER TABLE employee_payroll_settings
    ADD COLUMN health_base_amount numeric(18,2),
    ADD COLUMN employment_base_amount numeric(18,2),
    ADD COLUMN health_card_no varchar(30),
    ADD COLUMN insurance_reduction boolean NOT NULL DEFAULT false,
    ADD COLUMN religious_worker boolean NOT NULL DEFAULT false,
    ADD COLUMN household_type varchar(20) NOT NULL DEFAULT 'HEAD',
    ADD COLUMN homeless boolean NOT NULL DEFAULT false,
    ADD COLUMN foreigner boolean NOT NULL DEFAULT false,
    ADD COLUMN nationality varchar(50),
    ADD COLUMN non_resident boolean NOT NULL DEFAULT false,
    ADD COLUMN residence_country varchar(50),
    ADD COLUMN single_tax_rate boolean NOT NULL DEFAULT false,
    ADD COLUMN domestic_dispatched boolean NOT NULL DEFAULT false;

ALTER TABLE employee_payroll_settings DROP CONSTRAINT employee_payroll_settings_health_mode_check;
ALTER TABLE employee_payroll_settings ADD CONSTRAINT employee_payroll_settings_health_mode_check
    CHECK (health_mode IN ('AUTO', 'NONE', 'BASE'));
ALTER TABLE employee_payroll_settings DROP CONSTRAINT employee_payroll_settings_employment_mode_check;
ALTER TABLE employee_payroll_settings ADD CONSTRAINT employee_payroll_settings_employment_mode_check
    CHECK (employment_mode IN ('AUTO', 'NONE', 'BASE'));
ALTER TABLE employee_payroll_settings ADD CONSTRAINT employee_payroll_settings_household_type_check
    CHECK (household_type IN ('HEAD', 'MEMBER', 'HEAD_SPOUSE'));
ALTER TABLE employee_payroll_settings ADD CONSTRAINT employee_payroll_settings_health_base_amount_check
    CHECK (health_base_amount >= 0);
ALTER TABLE employee_payroll_settings ADD CONSTRAINT employee_payroll_settings_employment_base_amount_check
    CHECK (employment_base_amount >= 0);
