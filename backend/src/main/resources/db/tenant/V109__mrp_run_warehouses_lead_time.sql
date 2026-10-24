-- 생산계획/MRP생성 [설정] 의 기초재고 기준창고 · 전표수집 기준창고 · 조달기간반영(2026-10-02 loginaa 실측: 창고는 전체/직접입력,
-- 조달기간반영은 생산계획·MRP 둘 다 ✓ 가 기본). 창고를 비워 두면 전체다. 조달기간을 끄면 지시일·발주일을 필요일로 둔다.
ALTER TABLE mrp_runs ADD COLUMN stock_warehouse_id bigint;
ALTER TABLE mrp_runs ADD COLUMN doc_warehouse_id bigint;
ALTER TABLE mrp_runs ADD COLUMN plan_lead_time boolean NOT NULL DEFAULT true;
ALTER TABLE mrp_runs ADD COLUMN mrp_lead_time boolean NOT NULL DEFAULT true;
ALTER TABLE mrp_runs ADD CONSTRAINT fk_mrp_runs_stock_warehouse FOREIGN KEY (stock_warehouse_id) REFERENCES warehouses(id);
ALTER TABLE mrp_runs ADD CONSTRAINT fk_mrp_runs_doc_warehouse FOREIGN KEY (doc_warehouse_id) REFERENCES warehouses(id);
CREATE INDEX idx_mrp_runs_stock_warehouse ON mrp_runs (stock_warehouse_id);
CREATE INDEX idx_mrp_runs_doc_warehouse ON mrp_runs (doc_warehouse_id);
