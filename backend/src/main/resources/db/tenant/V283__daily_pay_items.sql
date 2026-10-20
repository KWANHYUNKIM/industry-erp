-- 일용근로 수당등록(E020136) · 공제등록(E020137) 항목 마스터.
-- 원본 2026-10-20 실측: 코드 · 항목명 · 표시순서(빈칸이면 '데이터를 입력하기 바랍니다.') 를 넣고 [저장(F8)] 하면 안내 없이 저장,
-- 계산식은 이름으로 자동(수당 변동(일) 'R( 이름(급여지급사항) * 이름(근무기록확정) , 0 )' · 공제 'R( 이름(급여지급사항) , 0 )').
-- builtin 은 급여계산(DailyPayService)이 셈하는 기본 항목(일근무 · 소득세 · 지방소득세) — 지우지 못한다.
CREATE TABLE daily_pay_items (
    id          bigserial PRIMARY KEY,
    kind        varchar(20)  NOT NULL CHECK (kind IN ('ALLOWANCE', 'DEDUCTION')),
    code        varchar(10)  NOT NULL,
    name        varchar(50)  NOT NULL,
    sort_order  integer      NOT NULL,
    pay_method  varchar(20),
    rate        numeric(9,4),
    tax_type    varchar(20),
    active      boolean      NOT NULL DEFAULT true,
    builtin     boolean      NOT NULL DEFAULT false,
    created_at  timestamp,
    updated_at  timestamp,
    CONSTRAINT uk_daily_pay_items_kind_code UNIQUE (kind, code)
);

INSERT INTO daily_pay_items (kind, code, name, sort_order, pay_method, tax_type, builtin, created_at, updated_at) VALUES
    ('ALLOWANCE', '02', '일근무', 1, '변동(일)', '전액과세', true, now(), now()),
    ('DEDUCTION', '01', '소득세', 1, NULL, NULL, true, now(), now()),
    ('DEDUCTION', '02', '지방소득세', 2, NULL, NULL, true, now(), now());
