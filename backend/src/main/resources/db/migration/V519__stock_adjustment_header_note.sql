-- 원본 자가사용입력 머리의 [새로운 항목 추가](비고 — '자가사용전표에 표시될 비고사항을 입력할 수 있습니다.', 2026-10-30 클릭 대조).
-- 전표 한 장의 값이라 줄마다 같은 값을 적는다(처리방법 handling 과 같은 방식).
ALTER TABLE stock_adjustments ADD COLUMN header_note varchar(300);
