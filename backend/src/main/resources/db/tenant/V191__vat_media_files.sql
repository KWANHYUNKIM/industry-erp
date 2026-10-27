-- 세무 > 부가세 > 과세자료전산매체 — 원본 E030208 [신규(F2)] '전산매체 파일생성' 창(2026-10-12 loginaa 실측).
-- 전산매체(계산서합계표 · 세금계산서합계표, 전체는 둘 다) · 신고기간(연도 + 시작월 ~ 끝월) · 예정누락기간 · 신고작성일자.
-- 같은 기간을 또 만들면 '동일한 기간에 이미 생성된 자료가 있습니다.' — 유니크 제약으로 받친다. 수정 창은 신고작성일자만 고친다.
CREATE TABLE vat_media_files (
    id              bigserial PRIMARY KEY,
    attribution_year integer NOT NULL,
    month_from      integer NOT NULL,
    month_to        integer NOT NULL,
    omitted_from    integer,
    omitted_to      integer,
    invoice_summary boolean NOT NULL,
    tax_invoice_summary boolean NOT NULL,
    report_date     date NOT NULL,
    created_at      timestamp(6),
    updated_at      timestamp(6),
    CONSTRAINT uk_vat_media_files_period UNIQUE (attribution_year, month_from, month_to)
);
