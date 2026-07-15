-- 발주서에 이카운트 발주요청 화면에 맞춘 필드 추가.
-- 헤더: 담당자(employee)·창고(warehouse)·통화(currency). 라인: 적요(remark)·거래처(partner).
-- FK 컬럼에는 인덱스를 직접 만든다(PostgreSQL 자동 생성 안 함 — CLAUDE.md 7.1).

ALTER TABLE purchase_orders ADD COLUMN employee_id  bigint;
ALTER TABLE purchase_orders ADD COLUMN warehouse_id bigint;
ALTER TABLE purchase_orders ADD COLUMN currency     varchar(10) NOT NULL DEFAULT 'KRW';

ALTER TABLE purchase_orders
    ADD CONSTRAINT fk_po_employee  FOREIGN KEY (employee_id)  REFERENCES employees (id),
    ADD CONSTRAINT fk_po_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses (id);

CREATE INDEX idx_po_employee  ON purchase_orders (employee_id);
CREATE INDEX idx_po_warehouse ON purchase_orders (warehouse_id);

ALTER TABLE purchase_order_lines ADD COLUMN remark     varchar(200);
ALTER TABLE purchase_order_lines ADD COLUMN partner_id bigint;

ALTER TABLE purchase_order_lines
    ADD CONSTRAINT fk_pol_partner FOREIGN KEY (partner_id) REFERENCES business_partners (id);

CREATE INDEX idx_pol_partner ON purchase_order_lines (partner_id);
