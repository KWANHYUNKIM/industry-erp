-- 계약수정 [H] 이력 창(원본 E060903 계약수정 '이력': 작업자ID · 작업일시 · 상태) — 마지막으로 고친 사람
ALTER TABLE billing_contracts ADD COLUMN updated_by varchar(50);
