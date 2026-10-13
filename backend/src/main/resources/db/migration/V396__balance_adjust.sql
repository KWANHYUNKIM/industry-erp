-- 회계 I › FastEntry › 잔액조정입력(E010209) · 잔액실사조회(E010211) · 잔액조정조회(E010210) · 잔액조정현황(E010212) — 2026-10-14 loginaa 실측.
-- 잔액실사(계정별) 창에서 [8109] 복리후생비(판) 부서 없음 줄 장부잔액 6,620,000 → 실잔액 6,631,000 · 적요 'QA회계1 잔액조정' [저장(F8)]
-- → 회계전표 2026/09/30 -16 '일반전표' 차변 복리후생비(판) 11,000 · 대변 없음(한쪽 전표), 잔액조정입력 차변금액 6,630,500 → 6,641,500,
-- 잔액조정조회 '2026/09/30 -16 | 복리후생비(판) | 6,620,000 | 6,631,000', 잔액조정현황 조정후잔액(차변) 6,631,000 · 차이(차변) 11,000.
-- 전표 줄이 조정 금액(차이)을 들고, 실가액(실잔액)은 이 칸에 적는다 — 장부가액 = 실가액 − 차이.

ALTER TABLE journal_lines ADD COLUMN adjust_actual numeric(18,2);

ALTER TABLE journal_entries DROP CONSTRAINT ck_journal_entries_source_type;
ALTER TABLE journal_entries ADD CONSTRAINT ck_journal_entries_source_type
    CHECK (source_type IN ('SALES','PURCHASE','EXPENSE','BANK','CARD','NOTE',
                           'DEPRECIATION','DISPOSAL','VOUCHER','NONCASH','CHECK',
                           'PAYROLL','ACCOUNT_TRANSFER','CARD_PAYMENT','SETTLEMENT','MANUAL',
                           'SUBCONTRACT','DAILY_WAGE','VAT_SALES','VAT_PURCHASE','BALANCE_ADJUST'));
