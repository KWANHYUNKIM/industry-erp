-- 관리 > 급여계산/대장(E090106): 대장(귀속월 · 대장명칭 · 지급일). 명세는 귀속월로 묶는다.
-- 이미 명세가 있는 귀속월은 대장을 하나씩 만들어 둔다(원본처럼 목록에 '2026/10 급여' 로 보이게).
CREATE TABLE pay_ledgers (
    id bigserial PRIMARY KEY,
    pay_month varchar(7) NOT NULL,
    name varchar(100) NOT NULL,
    pay_date date NOT NULL,
    created_by varchar(50),
    created_at timestamp(6) without time zone,
    updated_at timestamp(6) without time zone,
    CONSTRAINT uk_pay_ledgers_pay_month UNIQUE (pay_month)
);
INSERT INTO pay_ledgers (pay_month, name, pay_date, created_at, updated_at)
SELECT DISTINCT pay_month, replace(pay_month, '-', '/') || ' 급여',
       (pay_month || '-01')::date + interval '1 month' - interval '1 day', now(), now()
  FROM payslips;
