-- 생산불출에 <b>받는공장</b>을 붙인다.
--
-- 원본(이카운트) 생산불출입력의 머리는 일자 · 담당자 · <b>보내는창고</b> · <b>받는공장</b> ·
-- 생산품목이다. 우리에겐 창고가 하나뿐이라 "어디서 어디로" 가 아니라 "어디서" 만 있었고,
-- 그마저 <b>재고를 전혀 움직이지 않았다</b> — 불출 기록과 창고 재고가 따로 놀았다.
ALTER TABLE material_issues ADD COLUMN to_warehouse_id bigint REFERENCES warehouses(id);
CREATE INDEX idx_material_issues_to_warehouse ON material_issues (to_warehouse_id);
