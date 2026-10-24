-- [회사별] 원천징수이행상황신고서(E030101) — 신고서를 '만들어 두는' 목록.
--
-- 원본은 귀속월을 골라 조회하는 화면이 아니라, [신규]로 신고서를 만들어 두고 목록에서 고르는 화면이다
-- (신고구분 정기 · 기한후, 신고방법 매월 · 반기, 귀속연월, 지급연월, 신고일자, 연말정산포함).
-- 같은 귀속연월 · 지급연월 · 신고구분이 또 있으면 원본은 '동일한 원천징수이행상황신고서가 있습니다.' 로 막는다.
-- 금액은 저장하지 않는다 — 열 때마다 확정된 급여명세 · 일용근로 · 기타원천세에서 다시 센다.

CREATE TABLE withholding_returns (
    id               bigserial PRIMARY KEY,
    filing_type      varchar(20) NOT NULL CHECK (filing_type IN ('REGULAR', 'LATE')),
    filing_method    varchar(20) NOT NULL CHECK (filing_method IN ('MONTHLY', 'HALF')),
    attribution_month varchar(7) NOT NULL,
    pay_month        varchar(7) NOT NULL,
    report_date      date NOT NULL,
    include_year_end boolean NOT NULL DEFAULT false,
    created_at       timestamp,
    updated_at       timestamp,
    CONSTRAINT uq_withholding_returns UNIQUE (attribution_month, pay_month, filing_type)
);
