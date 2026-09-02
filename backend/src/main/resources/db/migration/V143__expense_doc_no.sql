-- 비용 전표에 번호를 붙인다.
--
-- 원본(이카운트) 비용내역현황의 첫 열이 <b>일자-No.</b> 다. 비용도 전표인데 우리에겐
-- 번호가 없어서 "그 비용 건" 을 지목할 방법이 없었다 — 증빙을 붙이거나 회계반영을
-- 되짚을 때 일자와 금액으로 더듬는 수밖에 없다.
-- 판매·구매·수금·은행거래·카드사용은 이미 다 번호가 있다(SO-·PO-·RC-·BK-·CU-).
ALTER TABLE expenses ADD COLUMN doc_no varchar(30);

-- 기존 행 백필: 같은 날짜 안에서 id 순서대로 EX-yyyyMMdd-0001 …
UPDATE expenses e SET doc_no = 'EX-' || to_char(e.expense_date, 'YYYYMMDD') || '-'
    || lpad(x.rn::text, 4, '0')
FROM (SELECT id, row_number() OVER (PARTITION BY expense_date ORDER BY id) AS rn FROM expenses) x
WHERE x.id = e.id AND e.doc_no IS NULL;

ALTER TABLE expenses ALTER COLUMN doc_no SET NOT NULL;
CREATE UNIQUE INDEX uq_expenses_doc_no ON expenses (doc_no);
