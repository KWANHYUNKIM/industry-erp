-- 일용직 지급의 회계전표(QA 69회차). 원본 일용근로 급여대장 [확정] → [전표생성].
--
-- 지급 처리가 '지급됨' 표시만 하고 분개를 남기지 않아, 일용직 인건비가 손익에서 빠지고
-- 떼어 둔 원천세가 예수금에 잡히지 않았다. 이제 지급하면
--   차) 잡급(805) 지급액 / 대) 예수금(254) 원천세 · 현금(101) 또는 지급계좌 예금 실지급액
-- 을 만들고, 그 전표를 출역마다 가리킨다(한 번에 여러 건이면 같은 전표).

ALTER TABLE daily_work_records ADD COLUMN journal_entry_id bigint;
ALTER TABLE daily_work_records ADD CONSTRAINT fk_daily_work_records_journal_entry
    FOREIGN KEY (journal_entry_id) REFERENCES journal_entries (id);
CREATE INDEX idx_daily_work_records_journal_entry ON daily_work_records (journal_entry_id);

ALTER TABLE journal_entries DROP CONSTRAINT ck_journal_entries_source_type;
ALTER TABLE journal_entries ADD CONSTRAINT ck_journal_entries_source_type
    CHECK (source_type IN ('SALES','PURCHASE','EXPENSE','BANK','CARD','NOTE',
                           'DEPRECIATION','DISPOSAL','VOUCHER','NONCASH','CHECK',
                           'PAYROLL','ACCOUNT_TRANSFER','CARD_PAYMENT','SETTLEMENT','MANUAL',
                           'SUBCONTRACT','DAILY_WAGE'));

-- 잡급(판매관리비). 일용직 지급 분개가 코드로 찾는 계정이다 — 기존 회사에도 넣는다.
INSERT INTO accounts (created_at, updated_at, code, name, division, detail_category, active)
SELECT now(), now(), '805', '잡급', 'EXPENSE', '판매관리비', true
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE code = '805');
