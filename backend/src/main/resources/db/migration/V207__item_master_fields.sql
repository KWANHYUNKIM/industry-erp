-- 품목등록(E020101) 폼의 빠진 칸들. 원본 폼에는 있는데 우리 품목에는 담을 데가 없어
-- 화면에 그릴 수조차 없던 값들이다.

ALTER TABLE items ADD COLUMN remark varchar(200);
ALTER TABLE items ADD COLUMN vat_rate_sales numeric(5,2);
ALTER TABLE items ADD COLUMN vat_rate_purchase numeric(5,2);
ALTER TABLE items ADD COLUMN subcontract_price numeric(15,2);
ALTER TABLE items ADD COLUMN lead_time_days integer;
ALTER TABLE items ADD COLUMN min_purchase_unit numeric(15,3);
ALTER TABLE items ADD COLUMN item_type varchar(30);
ALTER TABLE items ADD COLUMN qc_type varchar(20);
ALTER TABLE items ADD COLUMN qc_method varchar(10);

-- 기존 품목의 세율은 10% 로 본다 — 지금 전표가 그렇게 매기고 있다.
UPDATE items SET vat_rate_sales = 10, vat_rate_purchase = 10, subcontract_price = 0,
                 lead_time_days = 0, min_purchase_unit = 0;

-- 대표품목. 같은 표를 가리키므로 FK 를 나중에 건다.
ALTER TABLE items ADD COLUMN parent_item_id bigint;
ALTER TABLE items ADD CONSTRAINT fk_items_parent_item
    FOREIGN KEY (parent_item_id) REFERENCES items(id);
-- PostgreSQL 은 FK 를 만들어도 참조하는 쪽 컬럼에 인덱스를 만들지 않는다.
CREATE INDEX idx_items_parent_item ON items(parent_item_id);

-- 참/거짓 칸들. 기존 행이 있어 한 번에 NOT NULL 을 못 건다 — 넣고 → 백필 → 제약.
ALTER TABLE items ADD COLUMN set_item boolean;
ALTER TABLE items ADD COLUMN shared_item boolean;
ALTER TABLE items ADD COLUMN lot_managed boolean;
ALTER TABLE items ADD COLUMN qc_on_purchase boolean;
ALTER TABLE items ADD COLUMN qc_on_production boolean;
ALTER TABLE items ADD COLUMN auto_production_on_sales boolean;
ALTER TABLE items ADD COLUMN auto_production_on_transfer boolean;
UPDATE items SET set_item = false, shared_item = false, lot_managed = false,
                 qc_on_purchase = false, qc_on_production = false,
                 auto_production_on_sales = false, auto_production_on_transfer = false;
ALTER TABLE items ALTER COLUMN set_item SET NOT NULL;
ALTER TABLE items ALTER COLUMN shared_item SET NOT NULL;
ALTER TABLE items ALTER COLUMN lot_managed SET NOT NULL;
ALTER TABLE items ALTER COLUMN qc_on_purchase SET NOT NULL;
ALTER TABLE items ALTER COLUMN qc_on_production SET NOT NULL;
ALTER TABLE items ALTER COLUMN auto_production_on_sales SET NOT NULL;
ALTER TABLE items ALTER COLUMN auto_production_on_transfer SET NOT NULL;
