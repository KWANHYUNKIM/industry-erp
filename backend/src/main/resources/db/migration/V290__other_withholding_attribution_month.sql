-- 기타원천세 [귀속연월] — 원본 기타원천세는 지급일과 따로 귀속연월을 든다(2026/01/21 지급 · 2025/12 귀속).
-- 소득자료제출집계표 · 원천세신고자료비교표가 귀속연월로 센다(2026-10-04 실측). 있던 자료는 지급일의 연월로 채운다.
ALTER TABLE other_withholdings ADD COLUMN attribution_month varchar(7);
UPDATE other_withholdings SET attribution_month = to_char(pay_date, 'YYYY-MM') WHERE attribution_month IS NULL;
ALTER TABLE other_withholdings ALTER COLUMN attribution_month SET NOT NULL;
