-- 수당 · 공제 항목코드는 종류별로 유일하다(원본: 수당 01 과 공제 01 이 따로 있다).
ALTER TABLE pay_items DROP CONSTRAINT uk_pay_items_code;
ALTER TABLE pay_items ADD CONSTRAINT uk_pay_items_kind_code UNIQUE (kind, code);
