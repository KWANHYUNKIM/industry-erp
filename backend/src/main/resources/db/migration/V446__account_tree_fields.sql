-- 회계1 계정등록(E010107) 계정 나무 · 대차구분 · 평가구분 · 수입지출구분 · 검색창내용 · 적요1 · 2 (2026-10-13 loginaa 실측, plans/회계1/E010107.md).
-- 원본은 묶음 계정(굵은 줄, 전표 입력 불가)과 전표입력계정이 상위계정으로 이어진 나무다.
ALTER TABLE accounts ADD COLUMN parent_id bigint REFERENCES accounts (id);
CREATE INDEX idx_accounts_parent_id ON accounts (parent_id);
ALTER TABLE accounts ADD COLUMN group_account boolean NOT NULL DEFAULT false;
ALTER TABLE accounts ADD COLUMN debit_credit varchar(10);
ALTER TABLE accounts ADD COLUMN eval_kind varchar(20) NOT NULL DEFAULT 'NONE';
ALTER TABLE accounts ADD COLUMN cash_flow_kind varchar(20) NOT NULL DEFAULT 'NONE';
ALTER TABLE accounts ADD COLUMN search_keyword varchar(100);
ALTER TABLE accounts ADD COLUMN remark1 varchar(100);
ALTER TABLE accounts ADD COLUMN remark2 varchar(100);

-- 자산 · 비용 = 차변, 그 밖 = 대변. 대변에 쓰는 차감 계정(충당금 · 누계액)은 대변.
UPDATE accounts SET debit_credit = CASE WHEN division IN ('ASSET', 'EXPENSE') THEN 'DEBIT' ELSE 'CREDIT' END;
UPDATE accounts SET debit_credit = 'CREDIT' WHERE division = 'ASSET' AND (name LIKE '%충당금%' OR name LIKE '%누계액%');
UPDATE accounts SET eval_kind = 'EVAL' WHERE name LIKE '%대손충당금%';
UPDATE accounts SET eval_kind = 'TARGET' WHERE name = '외상매출금';
ALTER TABLE accounts ALTER COLUMN debit_credit SET NOT NULL;
ALTER TABLE accounts ADD CONSTRAINT accounts_debit_credit_check CHECK (debit_credit IN ('DEBIT', 'CREDIT'));
ALTER TABLE accounts ADD CONSTRAINT accounts_eval_kind_check CHECK (eval_kind IN ('NONE', 'TARGET', 'EVAL'));
ALTER TABLE accounts ADD CONSTRAINT accounts_cash_flow_kind_check CHECK (cash_flow_kind IN ('NONE', 'INCOME', 'EXPENSE', 'DEPOSIT'));
