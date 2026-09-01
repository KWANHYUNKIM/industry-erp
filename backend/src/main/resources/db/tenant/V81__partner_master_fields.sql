-- 거래처등록(E010101) 폼의 빠진 칸들.

ALTER TABLE business_partners ADD COLUMN sales_tax_type varchar(10);
ALTER TABLE business_partners ADD COLUMN purchase_tax_type varchar(10);
ALTER TABLE business_partners ADD COLUMN credit_days integer;
ALTER TABLE business_partners ADD COLUMN settle_due_day integer;
UPDATE business_partners SET credit_days = 0, settle_due_day = 0;

-- 참/거짓 셋. 기존 행이 있어 한 번에 NOT NULL 을 못 건다 — 넣고 → 백필 → 제약.
ALTER TABLE business_partners ADD COLUMN foreign_currency boolean;
ALTER TABLE business_partners ADD COLUMN ar_no_managed boolean;
ALTER TABLE business_partners ADD COLUMN ap_no_managed boolean;
UPDATE business_partners SET foreign_currency = false, ar_no_managed = false, ap_no_managed = false;
ALTER TABLE business_partners ALTER COLUMN foreign_currency SET NOT NULL;
ALTER TABLE business_partners ALTER COLUMN ar_no_managed SET NOT NULL;
ALTER TABLE business_partners ALTER COLUMN ap_no_managed SET NOT NULL;

-- 결제대행사의 [외화거래처]를 바로잡는다.
-- V206 에서 이 칸을 [업종별구분](일반·관세사·외화거래처)으로 보고 만들었는데, 사본의 id 가
-- ddlForeignFlag(깃발)이고 이 화면에는 업종별구분이 아예 없다. 이름만 맞고 뜻이 다른 칸이라
-- 지우고 깃발로 다시 만든다. V206 은 이미 적용됐으므로 고치지 않고 여기서 되돌린다.
ALTER TABLE payment_agencies ADD COLUMN foreign_currency boolean;
UPDATE payment_agencies SET foreign_currency = (industry_kind = '외화거래처');
ALTER TABLE payment_agencies ALTER COLUMN foreign_currency SET NOT NULL;
ALTER TABLE payment_agencies DROP COLUMN industry_kind;
