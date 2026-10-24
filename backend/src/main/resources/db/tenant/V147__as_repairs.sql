-- A/S수리(E040605 · E040606) — 원본은 접수와 따로인 전표다(2026-10-03 loginaa 실측).
-- 수리는 재고를 움직이지 않는다. 부품 · 수리비는 [판매연결전표]로 판매를 만들어 잇는다(as_repair_sales).
-- 판매는 trade 의 것이라 sales_id 만 든다(trade 가 quality 를 알면 순환) — FK 를 걸면 판매를 지울 때 막히므로 걸지 않는다.
CREATE TABLE as_repairs (
    id            bigserial PRIMARY KEY,
    repair_no     varchar(30)  NOT NULL UNIQUE,
    repair_date   date         NOT NULL,
    partner_id    bigint       NOT NULL REFERENCES business_partners (id),
    as_request_id bigint       REFERENCES as_requests (id),
    warehouse_id  bigint       NOT NULL REFERENCES warehouses (id),
    charge        varchar(50)  NOT NULL,
    repair_type   varchar(20)  CHECK (repair_type IN ('FREE_EXCHANGE','FREE_REPAIR','PAID_EXCHANGE','PAID_REPAIR','RETURN')),
    title         varchar(200),
    content       varchar(1000),
    status        varchar(20)  NOT NULL CHECK (status IN ('IN_PROGRESS','COMPLETED')),
    created_by    varchar(50),
    created_at    timestamp,
    updated_at    timestamp
);
CREATE INDEX idx_as_repairs_partner ON as_repairs (partner_id);
CREATE INDEX idx_as_repairs_as_request ON as_repairs (as_request_id);
CREATE INDEX idx_as_repairs_warehouse ON as_repairs (warehouse_id);

CREATE TABLE as_repair_lines (
    id           bigserial PRIMARY KEY,
    as_repair_id bigint        NOT NULL REFERENCES as_repairs (id),
    line_no      integer       NOT NULL,
    item_id      bigint        NOT NULL REFERENCES items (id),
    quantity     numeric(18,4) NOT NULL
);
CREATE INDEX idx_as_repair_lines_repair ON as_repair_lines (as_repair_id);
CREATE INDEX idx_as_repair_lines_item ON as_repair_lines (item_id);

CREATE TABLE as_repair_sales (
    id           bigserial PRIMARY KEY,
    as_repair_id bigint NOT NULL REFERENCES as_repairs (id),
    sales_id     bigint NOT NULL UNIQUE
);
CREATE INDEX idx_as_repair_sales_repair ON as_repair_sales (as_repair_id);
