-- 계약항목 품목연결설정 · 계약 줄 [상세] 의 규격 — 사용자가 친 글.
-- 원본 이카운트는 품목 규격을 자동으로 찍지 않고 칸을 비워 둔다(2026-10-29 데이터이관 QA C4).
ALTER TABLE contract_item_products ADD COLUMN spec varchar(100);
ALTER TABLE billing_contract_line_products ADD COLUMN spec varchar(100);
