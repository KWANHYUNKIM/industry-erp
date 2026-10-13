-- 의료기기공급내역보고(C001403) — 원본은 보고할 줄을 <저장>한다(입력 · 수정 창, 전송상태 미전송/전송).
-- 판매에서 시리얼(UDI)이 달린 줄을 불러오며, 판매 줄 하나는 한 번만 보고한다(sales_line_id UNIQUE).
-- 품목 · 거래처 · 판매 줄은 다른 모듈의 것이라 id 와 그때의 이름만 적는다(FK 없음).
CREATE TABLE medical_supply_entries (
    id             bigserial PRIMARY KEY,
    entry_date     date        NOT NULL,
    entry_seq      integer     NOT NULL,
    report_month   varchar(7)  NOT NULL,
    supply_type    varchar(10) NOT NULL CHECK (supply_type IN ('OUT','RETURN','DISPOSAL','RENTAL','RECALL')),
    supply_shape   varchar(30) NOT NULL,
    transmitted    boolean     NOT NULL DEFAULT false,
    transmitted_at timestamp,
    created_by     varchar(50),
    created_at     timestamp,
    updated_at     timestamp,
    UNIQUE (entry_date, entry_seq)
);

CREATE TABLE medical_supply_entry_lines (
    id                  bigserial PRIMARY KEY,
    entry_id            bigint        NOT NULL REFERENCES medical_supply_entries (id),
    line_no             integer       NOT NULL,
    sales_line_id       bigint        UNIQUE,
    source_doc_no       varchar(40),
    udi                 varchar(120),
    delivery_date       date,
    used                boolean       NOT NULL DEFAULT false,
    partner_system_code varchar(50),
    partner_id          bigint,
    partner_name        varchar(100),
    different_place     boolean       NOT NULL DEFAULT false,
    item_id             bigint,
    item_name           varchar(200),
    quantity            numeric(18,4) NOT NULL DEFAULT 0,
    unit_price          numeric(18,2) NOT NULL DEFAULT 0,
    amount              numeric(18,2) NOT NULL DEFAULT 0
);
CREATE INDEX idx_medical_supply_entry_lines_entry ON medical_supply_entry_lines (entry_id);
