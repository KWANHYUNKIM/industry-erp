-- 생산입고의 [시리얼/로트No.] — 원본 생산입고 I·II 격자의 열, [소모] 탭에도 같은 칸이 있다.
--
-- 판매 줄(sales_lines.lot_no)과 같이 글자로 남긴다. 로트 재고(lots)는 아직 판매·구매도 움직이지 않아
-- 생산만 따로 움직이면 로트 현황이 판매와 다른 말을 한다 — 함께 붙일 때 같이 묶는다.

ALTER TABLE productions ADD COLUMN lot_no varchar(60);
ALTER TABLE production_materials ADD COLUMN lot_no varchar(60);
