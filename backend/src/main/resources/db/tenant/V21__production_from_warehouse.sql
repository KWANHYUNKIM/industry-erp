-- 생산입고에 <b>생산된공장</b>을 붙인다.
--
-- 원본(이카운트) 생산입고조회의 열은
--   일자-No. · <b>생산된공장명</b> · <b>받는창고명</b> · 품목명[규격] · 수량 · 담당자명
-- 이다. 생산불출(창고 → 공장)과 짝을 이루는 반대 방향 이동이다 —
-- 자재는 공장에서 소모되고, 완제품은 공장에서 만들어져 창고로 들어간다.
--
-- 우리 생산실적에는 창고가 하나뿐이라 자재도 완제품도 <b>같은 창고</b>에서 오갔다.
-- 그래서 공장으로 불출한 자재가 정작 생산에서는 창고 재고에서 빠졌다.
ALTER TABLE productions ADD COLUMN from_warehouse_id bigint REFERENCES warehouses(id);
CREATE INDEX idx_productions_from_warehouse ON productions (from_warehouse_id);
