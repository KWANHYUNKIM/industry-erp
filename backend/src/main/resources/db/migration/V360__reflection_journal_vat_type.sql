-- 판매 · 구매 회계반영 전표의 부가세유형(원본 매입/매출장 유형명 '세금계산서', 2026-10-13 loginaa 실측).
-- 과세 '세금계산서' · 면세 '계산서'. 이제 JournalService.createFromSales/Purchase 가 넣는다 — 이미 만든 전표를 채운다.
UPDATE journal_entries e SET vat_type = CASE WHEN s.taxable THEN '세금계산서' ELSE '계산서' END
  FROM sales s WHERE e.source_type = 'SALES' AND e.source_id = s.id AND e.vat_type IS NULL;
UPDATE journal_entries e SET vat_type = CASE WHEN p.taxable THEN '세금계산서' ELSE '계산서' END
  FROM purchases p WHERE e.source_type = 'PURCHASE' AND e.source_id = p.id AND e.vat_type IS NULL;
