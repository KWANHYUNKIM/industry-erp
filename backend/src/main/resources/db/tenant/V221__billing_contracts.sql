-- 회계 II › 계약관리(정기청구) — 원본 계약항목등록 E060901 · 계약입력 E060902 · 계약조회 E060903 · 청구예정자료생성 E060905 (2026-10-13 loginaa 실측).
-- 계약항목(무엇을 · 얼마에 · 1회/주기적) → 계약(거래처 · 청구기간 · 부가세유형 + 줄: 항목 · 청구예정월 · 수량 · 단가 · 청구단위)
-- → 청구예정자료(그 달에 청구할 줄을 계약에서 끌어와 한 장으로). 같은 달을 다시 생성해도 원본은 막지 않는다.

CREATE TABLE contract_items (
    id               bigserial     PRIMARY KEY,
    code             varchar(20)   NOT NULL,
    name             varchar(100)  NOT NULL,
    unit_price       numeric(18,2) NOT NULL DEFAULT 0,
    vat_included     boolean       NOT NULL DEFAULT false,
    billing_cycle    varchar(10)   NOT NULL,
    sales_account_id bigint        REFERENCES accounts (id),
    active           boolean       NOT NULL DEFAULT true,
    created_at       timestamp(6),
    updated_at       timestamp(6),
    CONSTRAINT uq_contract_items_code UNIQUE (code),
    CONSTRAINT ck_contract_items_cycle CHECK (billing_cycle IN ('ONCE', 'PERIODIC'))
);
CREATE INDEX idx_contract_items_sales_account ON contract_items (sales_account_id);

-- 청구단위 — 원본 코드도움 '청구단위'(000 기본청구 · 00001 월말청구).
CREATE TABLE billing_units (
    id         bigserial   PRIMARY KEY,
    code       varchar(20) NOT NULL,
    name       varchar(50) NOT NULL,
    created_at timestamp(6),
    updated_at timestamp(6),
    CONSTRAINT uq_billing_units_code UNIQUE (code)
);
INSERT INTO billing_units (code, name, created_at, updated_at) VALUES
    ('000', '기본청구', now(), now()),
    ('00001', '월말청구', now(), now());

CREATE TABLE billing_contracts (
    id               bigserial    PRIMARY KEY,
    contract_date    date         NOT NULL,
    doc_no           integer      NOT NULL,
    code             varchar(20)  NOT NULL,
    name             varchar(100),
    partner_id       bigint       NOT NULL REFERENCES business_partners (id),
    bill_start       date         NOT NULL,
    bill_end         date         NOT NULL,
    vat_type         varchar(30)  NOT NULL,
    foreign_currency boolean      NOT NULL DEFAULT false,
    employee_id      bigint,
    department_id    bigint,
    project_id       bigint       REFERENCES projects (id),
    remark           varchar(200),
    created_by       varchar(50),
    created_at       timestamp(6),
    updated_at       timestamp(6),
    CONSTRAINT uq_billing_contracts_code UNIQUE (code),
    CONSTRAINT uq_billing_contracts_doc UNIQUE (contract_date, doc_no)
);
CREATE INDEX idx_billing_contracts_partner ON billing_contracts (partner_id);
CREATE INDEX idx_billing_contracts_project ON billing_contracts (project_id);

CREATE TABLE billing_contract_lines (
    id              bigserial     PRIMARY KEY,
    contract_id     bigint        NOT NULL REFERENCES billing_contracts (id) ON DELETE CASCADE,
    line_no         integer       NOT NULL,
    item_id         bigint        NOT NULL REFERENCES contract_items (id),
    bill_months     varchar(40)   NOT NULL DEFAULT '',
    quantity        numeric(18,2) NOT NULL DEFAULT 0,
    unit_price      numeric(18,2) NOT NULL DEFAULT 0,
    supply_amount   numeric(18,2) NOT NULL DEFAULT 0,
    vat_amount      numeric(18,2) NOT NULL DEFAULT 0,
    billing_unit_id bigint        REFERENCES billing_units (id),
    remark          varchar(200)
);
CREATE INDEX idx_billing_contract_lines_contract ON billing_contract_lines (contract_id);
CREATE INDEX idx_billing_contract_lines_item ON billing_contract_lines (item_id);
CREATE INDEX idx_billing_contract_lines_unit ON billing_contract_lines (billing_unit_id);

-- 청구예정자료 — [청구생성번호] '2026/10/13 -1'. 회계반영 · 판매생성은 다음 단계(회계/판매일괄반영)가 켠다.
CREATE TABLE contract_bills (
    id                   bigserial   PRIMARY KEY,
    bill_date            date        NOT NULL,
    doc_no               integer     NOT NULL,
    vat_type             varchar(30) NOT NULL,
    accounting_reflected boolean     NOT NULL DEFAULT false,
    sales_created        boolean     NOT NULL DEFAULT false,
    created_by           varchar(50),
    created_at           timestamp(6),
    updated_at           timestamp(6),
    CONSTRAINT uq_contract_bills_doc UNIQUE (bill_date, doc_no)
);

CREATE TABLE contract_bill_lines (
    id               bigserial     PRIMARY KEY,
    bill_id          bigint        NOT NULL REFERENCES contract_bills (id) ON DELETE CASCADE,
    line_no          integer       NOT NULL,
    contract_line_id bigint        NOT NULL REFERENCES billing_contract_lines (id),
    bill_month       varchar(7)    NOT NULL,
    quantity         numeric(18,2) NOT NULL DEFAULT 0,
    unit_price       numeric(18,2) NOT NULL DEFAULT 0,
    supply_amount    numeric(18,2) NOT NULL DEFAULT 0,
    vat_amount       numeric(18,2) NOT NULL DEFAULT 0,
    remark           varchar(200)
);
CREATE INDEX idx_contract_bill_lines_bill ON contract_bill_lines (bill_id);
CREATE INDEX idx_contract_bill_lines_contract_line ON contract_bill_lines (contract_line_id);
