-- BOM 등록 창을 원본(E040401 BOM등록 · BOM수정) 격자 꼴로: 머리 생산공정 · 생산수량, 줄 생산공정 · 위치 · 적요.
-- 원본의 줄 [수량] 은 '생산수량' 개를 만드는 데 드는 양이다. 지금 쓰는 quantity(제품 1단위당)는 그대로 두고
-- 사람이 넣은 양을 input_qty 에 따로 둔다(기존 줄은 생산수량 1 이라 같은 값).
ALTER TABLE boms ADD COLUMN produce_qty numeric(18,4);
UPDATE boms SET produce_qty = 1 WHERE produce_qty IS NULL;
ALTER TABLE boms ALTER COLUMN produce_qty SET NOT NULL;
ALTER TABLE boms ADD COLUMN process_id bigint REFERENCES production_processes(id);
CREATE INDEX idx_boms_process_id ON boms(process_id);

ALTER TABLE bom_lines ADD COLUMN input_qty numeric(18,4);
UPDATE bom_lines SET input_qty = quantity WHERE input_qty IS NULL;
ALTER TABLE bom_lines ALTER COLUMN input_qty SET NOT NULL;
ALTER TABLE bom_lines ADD COLUMN process_id bigint REFERENCES production_processes(id);
CREATE INDEX idx_bom_lines_process_id ON bom_lines(process_id);
ALTER TABLE bom_lines ADD COLUMN location varchar(100);
ALTER TABLE bom_lines ADD COLUMN remark varchar(200);
