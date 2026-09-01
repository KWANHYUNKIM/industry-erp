-- 카드사·결제대행사 등록 화면의 빠진 칸들. 원본 E010109·E010114 의 폼에는 있는데
-- 우리 마스터에는 코드·이름·수수료율·적요뿐이라 그 값을 아예 담을 수가 없었다.

-- 둘 다 갖는 것: 계정 · 입금계좌 · 검색창내용
ALTER TABLE card_issuers ADD COLUMN account_id bigint;
ALTER TABLE card_issuers ADD COLUMN deposit_account varchar(100);
ALTER TABLE card_issuers ADD COLUMN search_keyword varchar(100);
ALTER TABLE card_issuers ADD CONSTRAINT fk_card_issuers_account
    FOREIGN KEY (account_id) REFERENCES accounts(id);
-- PostgreSQL 은 FK 를 만들어도 참조하는 쪽 컬럼에 인덱스를 만들지 않는다.
CREATE INDEX idx_card_issuers_account ON card_issuers(account_id);

ALTER TABLE payment_agencies ADD COLUMN account_id bigint;
ALTER TABLE payment_agencies ADD COLUMN deposit_account varchar(100);
ALTER TABLE payment_agencies ADD COLUMN search_keyword varchar(100);
ALTER TABLE payment_agencies ADD CONSTRAINT fk_payment_agencies_account
    FOREIGN KEY (account_id) REFERENCES accounts(id);
CREATE INDEX idx_payment_agencies_account ON payment_agencies(account_id);

-- 결제대행사만 갖는 것
ALTER TABLE payment_agencies ADD COLUMN fee_rate numeric(6,3) DEFAULT 0;
ALTER TABLE payment_agencies ADD COLUMN biz_type varchar(100);
ALTER TABLE payment_agencies ADD COLUMN biz_item varchar(100);
ALTER TABLE payment_agencies ADD COLUMN manager varchar(50);
ALTER TABLE payment_agencies ADD COLUMN postal_code varchar(20);
ALTER TABLE payment_agencies ADD COLUMN address varchar(300);
ALTER TABLE payment_agencies ADD COLUMN postal_code2 varchar(20);
ALTER TABLE payment_agencies ADD COLUMN address2 varchar(300);

-- NOT NULL 셋은 한 번에 못 건다(기존 행이 있다). nullable 로 넣고 → 백필 → 제약.
ALTER TABLE payment_agencies ADD COLUMN reg_no_kind varchar(20);
ALTER TABLE payment_agencies ADD COLUMN industry_kind varchar(20);
ALTER TABLE payment_agencies ADD COLUMN tax_report boolean;
UPDATE payment_agencies SET reg_no_kind = '사업자등록번호' WHERE reg_no_kind IS NULL;
UPDATE payment_agencies SET industry_kind = '일반' WHERE industry_kind IS NULL;
UPDATE payment_agencies SET tax_report = true WHERE tax_report IS NULL;
ALTER TABLE payment_agencies ALTER COLUMN reg_no_kind SET NOT NULL;
ALTER TABLE payment_agencies ALTER COLUMN industry_kind SET NOT NULL;
ALTER TABLE payment_agencies ALTER COLUMN tax_report SET NOT NULL;
