-- 비용내역입력(E060812) 전표 한 장 = 줄 여럿 (2026-10-20 loginaa: 두 줄 20,000 + 15,000 → 전표 '2026/10/20 -2' 하나)
-- 줄마다 expenses 행 하나, slip_doc_no 로 묶는다. 비면 그 행 하나가 전표(옛 지출).
ALTER TABLE expenses ADD COLUMN slip_doc_no varchar(30);
ALTER TABLE expenses ADD COLUMN line_no integer;
-- 줄 [배부액] · [금액1] · [금액2] · [적요1~3], 머리 [출금계좌]
ALTER TABLE expenses ADD COLUMN alloc_amount numeric(18,2);
ALTER TABLE expenses ADD COLUMN amount1 numeric(18,2);
ALTER TABLE expenses ADD COLUMN amount2 numeric(18,2);
ALTER TABLE expenses ADD COLUMN memo1 varchar(200);
ALTER TABLE expenses ADD COLUMN memo2 varchar(200);
ALTER TABLE expenses ADD COLUMN memo3 varchar(200);
ALTER TABLE expenses ADD COLUMN bank_account_id bigint REFERENCES bank_accounts(id);
CREATE INDEX idx_expenses_slip_doc_no ON expenses(slip_doc_no);
CREATE INDEX idx_expenses_bank_account_id ON expenses(bank_account_id);
