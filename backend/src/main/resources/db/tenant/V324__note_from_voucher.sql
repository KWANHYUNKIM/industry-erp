-- 회계2 채권감소등록 · 채무감소등록 [입금보고서작성] · [지출결의서작성] 수금(지급)형태 '어음'(2026-10-21 loginaa 실측).
-- 결의서 줄의 돈 들어온(나간) 쪽이 계좌가 아니라 계정(1109 받을어음)이 되고, 줄마다 받을어음(지급어음)이 증가한다(거래유형 '입금보고서').
-- 결의서를 지우면 그 어음도 사라진다(bond_entries · bank_checks.source_voucher_id 와 같은 방식).
ALTER TABLE fast_voucher_lines ADD COLUMN settle_account_id bigint REFERENCES accounts (id);
CREATE INDEX idx_fast_voucher_lines_settle_account_id ON fast_voucher_lines (settle_account_id);
ALTER TABLE promissory_notes ADD COLUMN source_voucher_id bigint REFERENCES fast_vouchers (id) ON DELETE CASCADE;
CREATE INDEX idx_promissory_notes_source_voucher_id ON promissory_notes (source_voucher_id);
