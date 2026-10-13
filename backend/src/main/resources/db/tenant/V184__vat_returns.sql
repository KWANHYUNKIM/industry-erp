-- 세무 > 부가세 > 부가세신고서(일반) 목록 — 원본 E200928 [신규(F2)] 창(2026-10-12 loginaa 실측).
-- 신고구분(정기신고 · 기한후신고) · 신고서종류(예정/확정 · 월별신고(조기환급)) · 신고기간(연도 + 1기 예정(1~3) … 2기 확정(10~12)) ·
-- 예정누락(확정이면 그 기의 예정 석 달) · 신고작성일자 · 납부기한 · 세무대리인 여부 · 폐업신고 여부.
-- 같은 기간 · 같은 종류를 두 번 만들면 '동일한 부가가치세 신고서가 있습니다.' — 유니크 제약으로 받친다.
CREATE TABLE vat_returns (
    id              bigserial PRIMARY KEY,
    filing_type     varchar(10) NOT NULL CHECK (filing_type IN ('REGULAR', 'LATE')),
    return_kind     varchar(10) NOT NULL CHECK (return_kind IN ('PRELIM', 'FINAL', 'MONTHLY')),
    attribution_year integer NOT NULL,
    month_from      integer NOT NULL,
    month_to        integer NOT NULL,
    omitted_from    integer,
    omitted_to      integer,
    report_date     date NOT NULL,
    due_date        date NOT NULL,
    tax_agent       boolean NOT NULL,
    closure         boolean NOT NULL,
    created_at      timestamp(6),
    updated_at      timestamp(6),
    CONSTRAINT uk_vat_returns_period UNIQUE (attribution_year, month_from, month_to, return_kind)
);
