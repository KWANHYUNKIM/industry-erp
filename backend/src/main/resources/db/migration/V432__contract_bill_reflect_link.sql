-- 회계 II › 계약관리 › 회계/판매일괄반영(E060906) — 반영 연결을 전표와 따로 남긴다(2026-10-21 loginaa 실측).
-- 원본은 [매출전표 I] 로 반영한 전표를 회계 쪽(매출전표 I 수정 [삭제])에서 지워도 청구예정자료의 회계반영여부 ✓ 가 그대로이고,
-- 그 줄은 회계/판매일괄반영 · 회계미반영현황(계약)에 다시 나오지 않으며, [선택삭제] 는 '1. 일괄반영한 내역' 으로 막힌다.
-- 청구자료수정 [회계전표삭제] → 회계전표번호보기(20261021-1 · 2026/10/21-16 — 지운 전표 번호 그대로) [삭제] 를 해야 풀린다.
-- journal_entry_id 는 전표가 지워지면 비므로(V354 ON DELETE SET NULL), 반영한 전표의 일자 · 번호를 따로 든다.
ALTER TABLE contract_bill_lines ADD COLUMN reflected_entry_date date;
ALTER TABLE contract_bill_lines ADD COLUMN reflected_entry_no integer;
UPDATE contract_bill_lines l SET reflected_entry_date = j.entry_date,
       reflected_entry_no = CAST(substring(j.doc_no from '([0-9]+)$') AS integer)
  FROM journal_entries j WHERE j.id = l.journal_entry_id;
