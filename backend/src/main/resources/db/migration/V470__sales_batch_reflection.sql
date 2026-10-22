-- 판매일괄회계반영(E040215) — 거래처별 여러 판매를 회계전표 한 장으로, 판매 줄 단위 반영.
-- 원본 2026-10-22 2차 재기: 같은 거래처 두 판매 18,000 · 1,800 · 19,800 → 전표 1장, 일부반영 창에서 품목 줄마다 골라 반영.

-- 1) 판매 줄별 반영 표시. 이미 회계반영된 판매의 줄은 모두 반영된 것으로 채운다.
ALTER TABLE sales_lines ADD COLUMN accounting_reflected boolean;
UPDATE sales_lines SET accounting_reflected = false;
UPDATE sales_lines SET accounting_reflected = true
    WHERE sales_id IN (SELECT id FROM sales WHERE accounting_reflected);
ALTER TABLE sales_lines ALTER COLUMN accounting_reflected SET NOT NULL;
ALTER TABLE sales_lines ALTER COLUMN accounting_reflected SET DEFAULT false;

-- 2) 회계전표 ↔ 판매 연결(여러 건). source_type = SALES_BATCH 인 전표가 쓴다.
--    sales_amount = 이 전표가 덮은 판매 쪽 금액(채권의 기타할인등차액 = 전표 외상매출금 − 이 합).
CREATE TABLE journal_entry_sales (
    id bigserial PRIMARY KEY,
    journal_entry_id bigint NOT NULL
        CONSTRAINT fk_journal_entry_sales_journal_entry_id REFERENCES journal_entries (id) ON DELETE CASCADE,
    sales_id bigint NOT NULL
        CONSTRAINT fk_journal_entry_sales_sales_id REFERENCES sales (id) ON DELETE CASCADE,
    sales_amount numeric(18, 2) NOT NULL
);
CREATE INDEX idx_journal_entry_sales_journal_entry_id ON journal_entry_sales (journal_entry_id);
CREATE INDEX idx_journal_entry_sales_sales_id ON journal_entry_sales (sales_id);

ALTER TABLE journal_entries DROP CONSTRAINT ck_journal_entries_source_type;
ALTER TABLE journal_entries ADD CONSTRAINT ck_journal_entries_source_type
    CHECK (source_type IN ('SALES','PURCHASE','EXPENSE','BANK','CARD','NOTE',
                           'DEPRECIATION','DISPOSAL','VOUCHER','NONCASH','CHECK',
                           'PAYROLL','ACCOUNT_TRANSFER','CARD_PAYMENT','SETTLEMENT','MANUAL',
                           'SUBCONTRACT','DAILY_WAGE','VAT_SALES','VAT_PURCHASE','BALANCE_ADJUST','IMPORT_COST',
                           'ASSET_ACQUISITION','SALES_BATCH'));
