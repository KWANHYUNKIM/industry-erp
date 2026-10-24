-- 고정자산 수량관리(원본 E010610 [수량관리] ○사용 ◉사용안함) · 수량(증가 전표의 [수량]).
-- 수불부는 수량관리 사용 자산만, 대장 [수량] 은 사용 자산만 찍는다(원본 2026-10-21 실측).
ALTER TABLE fixed_assets ADD COLUMN quantity_managed boolean;
UPDATE fixed_assets SET quantity_managed = false WHERE quantity_managed IS NULL;
ALTER TABLE fixed_assets ALTER COLUMN quantity_managed SET NOT NULL;

ALTER TABLE fixed_assets ADD COLUMN quantity numeric(18, 2);
UPDATE fixed_assets SET quantity = 1 WHERE quantity IS NULL;
ALTER TABLE fixed_assets ALTER COLUMN quantity SET NOT NULL;
