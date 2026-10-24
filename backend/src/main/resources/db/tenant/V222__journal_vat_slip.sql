-- 회계 I › 매출/매입거래 › 매출전표 I · 매입전표 I (2026-10-13 loginaa 실측).
-- 매출전표 I [부가세유형 카드매출 · 좋은컴퓨터 · 공급가액 100,000 · 부가세 10,000 · 적요 QA회계1] 저장 → 회계거래조회 26/10/13-6 거래유형 '매출전표 I',
-- 전표 인쇄 차) 외상매출금 110,000 / 대) 제품매출 100,000 · 부가세예수금 10,000, 합계 줄 '매출 : 카드매출 / 좋은컴퓨터 / 100,000 / 10,000'.
-- 부가세유형(세금계산서 · 카드매출 · 현금영수증 …)을 전표가 들어야 지출증빙현황 · 전표vs매출매입자료비교가 유형으로 나눈다.

ALTER TABLE journal_entries ADD COLUMN vat_type varchar(30);

ALTER TABLE journal_entries DROP CONSTRAINT ck_journal_entries_source_type;
ALTER TABLE journal_entries ADD CONSTRAINT ck_journal_entries_source_type
    CHECK (source_type IN ('SALES','PURCHASE','EXPENSE','BANK','CARD','NOTE',
                           'DEPRECIATION','DISPOSAL','VOUCHER','NONCASH','CHECK',
                           'PAYROLL','ACCOUNT_TRANSFER','CARD_PAYMENT','SETTLEMENT','MANUAL',
                           'SUBCONTRACT','DAILY_WAGE','VAT_SALES','VAT_PURCHASE'));
