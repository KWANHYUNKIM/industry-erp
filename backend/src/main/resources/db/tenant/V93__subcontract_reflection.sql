-- 외주비회계반영. 원본 생산/외주 > 외주비회계반영 > 외주비일괄회계반영.
--
-- 생산입고의 [외주비합계]·[외주비부가세](V218)를 외주처(생산된공장 = 외주 창고의 외주거래처)별로 모아
-- 매입전표로 넘긴다: 차) 외주가공비 · 부가세대급금 / 대) 외상매입금.
-- 넘긴 회계전표는 줄마다 id 로 남긴다(production 은 accounting 을 참조할 수 없어 FK 엔티티가 아니다).

ALTER TABLE productions ADD COLUMN subcontract_journal_id bigint;
ALTER TABLE productions ADD CONSTRAINT fk_productions_subcontract_journal
    FOREIGN KEY (subcontract_journal_id) REFERENCES journal_entries (id);
CREATE INDEX idx_productions_subcontract_journal ON productions (subcontract_journal_id);

ALTER TABLE journal_entries DROP CONSTRAINT ck_journal_entries_source_type;
ALTER TABLE journal_entries ADD CONSTRAINT ck_journal_entries_source_type
    CHECK (source_type IN ('SALES','PURCHASE','EXPENSE','BANK','CARD','NOTE',
                           'DEPRECIATION','DISPOSAL','VOUCHER','NONCASH','CHECK',
                           'PAYROLL','ACCOUNT_TRANSFER','CARD_PAYMENT','SETTLEMENT','MANUAL',
                           'SUBCONTRACT'));

-- 외주가공비(제조원가). 회계반영이 코드로 찾는 계정이다 — 기존 회사에도 넣는다.
INSERT INTO accounts (created_at, updated_at, code, name, division, detail_category, active)
SELECT now(), now(), '533', '외주가공비', 'EXPENSE', '제조원가', true
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE code = '533');
