-- 회계 I › 고정자산 — 원본(loginaa 2026-10-20 실측 E010610 · E010611 · E010612)처럼
-- 자산마다 감가상각충당금계정 · 감가상각비계정을 고르고, 취득(증가)은 부가세 · 출금계정으로 분개하며,
-- 감소는 매각/폐기 · 부가세 · 입금계정을 든다. 비어 있으면 예전 고정 계정(203 · 818 · 101)으로 분개한다.
ALTER TABLE fixed_assets ADD COLUMN accum_account_id bigint
    CONSTRAINT fk_fixed_assets_accum_account_id REFERENCES accounts (id);
ALTER TABLE fixed_assets ADD COLUMN expense_account_id bigint
    CONSTRAINT fk_fixed_assets_expense_account_id REFERENCES accounts (id);
ALTER TABLE fixed_assets ADD COLUMN payment_account_id bigint
    CONSTRAINT fk_fixed_assets_payment_account_id REFERENCES accounts (id);
ALTER TABLE fixed_assets ADD COLUMN acquisition_vat numeric(18, 2);
UPDATE fixed_assets SET acquisition_vat = 0 WHERE acquisition_vat IS NULL;
ALTER TABLE fixed_assets ALTER COLUMN acquisition_vat SET NOT NULL;
ALTER TABLE fixed_assets ADD COLUMN disposal_type varchar(10)
    CONSTRAINT ck_fixed_assets_disposal_type CHECK (disposal_type IN ('SALE', 'SCRAP'));
ALTER TABLE fixed_assets ADD COLUMN disposal_vat numeric(18, 2);
ALTER TABLE fixed_assets ADD COLUMN receipt_account_id bigint
    CONSTRAINT fk_fixed_assets_receipt_account_id REFERENCES accounts (id);

CREATE INDEX idx_fixed_assets_accum_account_id ON fixed_assets (accum_account_id);
CREATE INDEX idx_fixed_assets_expense_account_id ON fixed_assets (expense_account_id);
CREATE INDEX idx_fixed_assets_payment_account_id ON fixed_assets (payment_account_id);
CREATE INDEX idx_fixed_assets_receipt_account_id ON fixed_assets (receipt_account_id);

-- 취득(고정자산증가) 분개의 출처.
ALTER TABLE journal_entries DROP CONSTRAINT ck_journal_entries_source_type;
ALTER TABLE journal_entries ADD CONSTRAINT ck_journal_entries_source_type
    CHECK (source_type IN ('SALES','PURCHASE','EXPENSE','BANK','CARD','NOTE',
                           'DEPRECIATION','DISPOSAL','VOUCHER','NONCASH','CHECK',
                           'PAYROLL','ACCOUNT_TRANSFER','CARD_PAYMENT','SETTLEMENT','MANUAL',
                           'SUBCONTRACT','DAILY_WAGE','VAT_SALES','VAT_PURCHASE','BALANCE_ADJUST','IMPORT_COST',
                           'ASSET_ACQUISITION'));
