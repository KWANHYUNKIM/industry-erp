-- 회계 II › 계약관리 › 회계/판매일괄반영(E060906) — 청구자료 줄이 어느 회계전표(매출전표 I)로 반영됐나 (2026-10-13 loginaa 실측).
-- 원본은 거래처별로 묶어 매출전표 I 한 장을 만든다(차 외상매출금 / 대 제품매출 · 부가세예수금). 한 청구자료([일괄생성])에 거래처가
-- 여럿일 수 있어 줄마다 전표를 든다. 회계거래조회에서 그 전표를 지우면 줄이 다시 미반영으로 돌아간다(ON DELETE SET NULL).
-- contract_bills.accounting_reflected 는 이제 줄에서 셈하므로 쓰지 않는다(기본 false 로 남음).
ALTER TABLE contract_bill_lines ADD COLUMN journal_entry_id bigint REFERENCES journal_entries (id) ON DELETE SET NULL;
CREATE INDEX idx_contract_bill_lines_journal ON contract_bill_lines (journal_entry_id);
