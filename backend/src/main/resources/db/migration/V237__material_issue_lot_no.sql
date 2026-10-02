-- 생산불출 줄의 [시리얼/로트No.] — 판매·구매·생산입고 줄처럼 글자로 남긴다. 품목등록에서 로트관리를 켠 품목은
-- 불출 때도 로트번호를 받는다(QA 62회차 · 판매/구매 4ec68d6 과 같은 규칙). 지금까지의 불출은 비어 있다.
ALTER TABLE material_issues ADD COLUMN lot_no varchar(60);
