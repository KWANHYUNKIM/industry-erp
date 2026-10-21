-- (테넌트) 외화장부(원본 회계 I › 출력물 › 장부 아홉째): 회계 전표 줄에 외화 코드 · 외화금액을 든다.
-- 원화 차변/대변은 그대로 두고, 외화 줄만 두 칸을 채운다(둘 다 비면 원화 줄).
ALTER TABLE journal_lines ADD COLUMN currency_code varchar(10);
ALTER TABLE journal_lines ADD COLUMN foreign_amount numeric(18,4);
CREATE INDEX idx_journal_lines_currency_code ON journal_lines (currency_code);
