-- 관리 > 수당항목등록(E090103) 수당리스트의 [표시순서]·[배율]·[비과세유형]·[지급유형]·[산출방법].
-- 기존 비과세 수당은 시드대로 식대·차량유지비로 채운다(그 밖의 비과세는 아직 없다).
ALTER TABLE pay_items ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE pay_items ADD COLUMN rate numeric(9,4);
ALTER TABLE pay_items ADD COLUMN tax_free_type varchar(20) NOT NULL DEFAULT 'NONE';
ALTER TABLE pay_items ADD CONSTRAINT ck_pay_items_tax_free_type
    CHECK (tax_free_type IN ('NONE', 'NIGHT_WORK', 'CHILDCARE', 'MEAL', 'VEHICLE'));
ALTER TABLE pay_items ADD COLUMN pay_method varchar(20) NOT NULL DEFAULT 'FIXED';
ALTER TABLE pay_items ADD CONSTRAINT ck_pay_items_pay_method
    CHECK (pay_method IN ('FIXED', 'DAILY', 'HOURLY', 'RATE', 'MANUAL'));
ALTER TABLE pay_items ADD COLUMN calc_note varchar(200);
UPDATE pay_items SET tax_free_type = 'MEAL' WHERE code = 'MEAL' AND kind = 'ALLOWANCE' AND NOT taxable;
UPDATE pay_items SET tax_free_type = 'VEHICLE' WHERE code = 'VEHICLE' AND kind = 'ALLOWANCE' AND NOT taxable;
