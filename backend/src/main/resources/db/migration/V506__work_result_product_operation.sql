-- 작업내역 줄의 생산품목 · 작업(작업코드) — 원본 작업내역입력은 작업지시 없이 줄마다
-- 생산품목코드 · 작업 · 작업품목 · 수량 · 투입자원 · 작업시간(H) · 적요 를 바로 넣는다(2026-10-29 데이터이관 QA 79회).
-- 우리는 생산품목을 작업지시에서만 읽어, 지시 없는 작업내역은 생산품목을 가질 수 없었다.
ALTER TABLE work_results ADD COLUMN product_id bigint REFERENCES items(id);
ALTER TABLE work_results ADD COLUMN operation_id bigint REFERENCES process_operations(id);
CREATE INDEX idx_work_results_product ON work_results (product_id);
CREATE INDEX idx_work_results_operation ON work_results (operation_id);
-- 이미 있는 줄은 작업지시의 생산품목을 옮겨 적는다(화면에 보이던 값 그대로).
UPDATE work_results wr SET product_id = wo.product_id FROM work_orders wo WHERE wr.work_order_id = wo.id;
