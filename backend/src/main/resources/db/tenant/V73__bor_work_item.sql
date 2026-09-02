-- BOR(작업소요시간)의 [작업기준품목]·[작업량] — 원본 격자의 열.
--
-- 우리 BOR 은 "완제품 <b>생산수량</b> 만큼에 몇 시간" 만 적는다. 원본은 그 작업이
-- <b>어느 품목을 얼마만큼</b> 다루는지도 적는다 — 같은 공정이라도 다루는 물건과 양이
-- 다르면 걸리는 시간이 달라지는데, 그 근거가 어디에도 안 남았다.
--
-- 안 적을 수도 있다(완제품 기준으로만 재는 공정). FK 인덱스는 직접 만든다(CLAUDE.md 7.1).
ALTER TABLE bor_operations ADD COLUMN work_item_id bigint;
ALTER TABLE bor_operations ADD COLUMN work_qty numeric(15,3);
ALTER TABLE bor_operations ADD CONSTRAINT fk_bor_operations_work_item
    FOREIGN KEY (work_item_id) REFERENCES items(id);
CREATE INDEX idx_bor_operations_work_item ON bor_operations(work_item_id);
