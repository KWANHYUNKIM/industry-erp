-- 계좌의 [외화통장환종] — 원본 계좌등록(EBA005M)의 조건이자 칸.
--
-- 외화통장은 <b>어느 돈으로 담긴 통장인지</b>가 계좌의 성질이다. 없으면 원화통장과
-- 외화통장이 잔액 숫자만으로 나란히 서서, 1,000,000 이 원인지 달러인지 알 수가 없다.
-- 안 정하면 원화 통장이다(대부분이 그렇다).
--
-- FK 컬럼에는 인덱스를 직접 만든다(CLAUDE.md 7.1).
ALTER TABLE bank_accounts ADD COLUMN currency_id bigint;
ALTER TABLE bank_accounts ADD CONSTRAINT fk_bank_accounts_currency
    FOREIGN KEY (currency_id) REFERENCES currencies(id);
CREATE INDEX idx_bank_accounts_currency ON bank_accounts(currency_id);
