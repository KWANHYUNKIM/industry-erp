-- 판매/구매 전표의 라인별 적요(remark).
-- 이카운트 ESG009M(구매입력)·판매입력 그리드의 "적요" 컬럼에 대응한다.
-- 선택 입력이므로 nullable 로 둔다(기존 행 백필 불필요).
ALTER TABLE purchase_lines ADD COLUMN remark varchar(255);
ALTER TABLE sales_lines    ADD COLUMN remark varchar(255);
