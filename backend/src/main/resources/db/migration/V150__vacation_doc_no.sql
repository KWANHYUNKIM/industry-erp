-- 근태(휴가) 전표에 <b>근태번호</b>를 붙인다.
--
-- 원본(이카운트) 근태조회의 첫 열이 [근태번호] 다. 우리 휴가에는 번호가 없어서
-- "그 근태 건" 을 지목할 방법이 없었다 — 결재를 붙이거나 이력을 되짚을 때
-- 사원과 일자로 더듬어야 한다. 판매·구매·수금·비용은 이미 다 번호가 있다.
ALTER TABLE vacation_requests ADD COLUMN doc_no varchar(30);

-- 기존 행 백필: 같은 날짜 안에서 id 순서대로 AT-yyyyMMdd-0001 …
UPDATE vacation_requests v SET doc_no = 'AT-' || to_char(v.start_date, 'YYYYMMDD') || '-'
    || lpad(x.rn::text, 4, '0')
FROM (SELECT id, row_number() OVER (PARTITION BY start_date ORDER BY id) AS rn FROM vacation_requests) x
WHERE x.id = v.id AND v.doc_no IS NULL;

ALTER TABLE vacation_requests ALTER COLUMN doc_no SET NOT NULL;
CREATE UNIQUE INDEX uq_vacation_requests_doc_no ON vacation_requests (doc_no);
