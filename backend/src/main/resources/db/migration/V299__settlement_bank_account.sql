-- 수금 · 지급의 입출금계좌 — 원본 '매출처로부터'/'매입처로' [입금계좌]/[출금계좌] 는 등록된 계좌를 고른다(2026-10-06 loginaa 실측).
-- 비어 있으면 예전처럼 결제방법(현금 · 이체)으로 현금/보통예금을 가른다.
ALTER TABLE settlements ADD COLUMN bank_account_id bigint;
ALTER TABLE settlements ADD CONSTRAINT fk_settlements_bank_account_id FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id);
CREATE INDEX idx_settlements_bank_account_id ON settlements (bank_account_id);
