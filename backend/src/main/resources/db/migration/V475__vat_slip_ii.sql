-- 매출전표 II · 매입전표 II — 매출전표 I · 매입전표 I 의 [II로 변경] 이 바꾸는 일반전표 꼴 종류(원본 2026-10-22 실측).
ALTER TABLE journal_entries DROP CONSTRAINT ck_journal_entries_source_type;
ALTER TABLE journal_entries ADD CONSTRAINT ck_journal_entries_source_type
    CHECK (source_type IN ('SALES','PURCHASE','EXPENSE','BANK','CARD','NOTE',
                           'DEPRECIATION','DISPOSAL','VOUCHER','NONCASH','CHECK',
                           'PAYROLL','ACCOUNT_TRANSFER','CARD_PAYMENT','SETTLEMENT','MANUAL',
                           'SUBCONTRACT','DAILY_WAGE','VAT_SALES','VAT_PURCHASE','BALANCE_ADJUST','IMPORT_COST',
                           'ASSET_ACQUISITION','SALES_BATCH','VAT_SALES_II','VAT_PURCHASE_II'));
