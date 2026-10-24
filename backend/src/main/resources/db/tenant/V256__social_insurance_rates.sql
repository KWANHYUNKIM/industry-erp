-- 관리 > 공제항목등록 Option › 세율/세액등록(원본 E090114) — 회사가 연도마다 4대보험 근로자 부담 요율을 정한다.
-- 원본 loginaa 는 2026/10 급여에도 2025 요율(연금 4.5 % · 건강 3.545 % · 장기요양 건강의 12.95 %)로 공제한다(2026-10-13 실측).
-- 그 해 줄이 없으면 급여계산은 법정 요율(SocialInsuranceRates — 2026 연금 4.75 % · 건강 3.595 % · 장기요양 13.14 %)을 쓴다.
CREATE TABLE social_insurance_rates (
    id bigserial PRIMARY KEY,
    rate_year integer NOT NULL,
    pension_rate numeric(8,6) NOT NULL,
    health_rate numeric(8,6) NOT NULL,
    long_term_care_rate numeric(8,6) NOT NULL,
    employment_rate numeric(8,6) NOT NULL,
    created_at timestamp(6),
    updated_at timestamp(6),
    CONSTRAINT uk_social_insurance_rates_year UNIQUE (rate_year),
    CONSTRAINT social_insurance_rates_check CHECK (pension_rate >= 0 AND health_rate >= 0 AND long_term_care_rate >= 0 AND employment_rate >= 0)
);
