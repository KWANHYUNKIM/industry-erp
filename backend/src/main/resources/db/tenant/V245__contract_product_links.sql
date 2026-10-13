-- 회계 II › 계약관리 — 품목연결설정 · 판매반영(E060906 [판매전표 발행]) (2026-10-13 loginaa 실측).
-- 계약항목등록의 [품목별단가 › 설정] 창(품목연결설정: 품목코드 · 품목명 · 규격 · 수량 · 단가 · 공급가액 · 부가세)이 기본값이고,
-- 계약입력 줄의 [상세]가 그것을 복사해 계약 줄마다 든다. 상세-품목연결설정을 [적용]한 계약 줄의 청구자료만 판매반영에 나온다.
CREATE TABLE contract_item_products (
    id bigserial PRIMARY KEY,
    contract_item_id bigint NOT NULL REFERENCES contract_items (id) ON DELETE CASCADE,
    line_no integer NOT NULL,
    item_id bigint NOT NULL REFERENCES items (id),
    quantity numeric(18, 2) NOT NULL,
    unit_price numeric(18, 2) NOT NULL,
    supply_amount numeric(18, 2) NOT NULL,
    vat_amount numeric(18, 2) NOT NULL
);
CREATE INDEX idx_contract_item_products_contract_item ON contract_item_products (contract_item_id);
CREATE INDEX idx_contract_item_products_item ON contract_item_products (item_id);

CREATE TABLE billing_contract_line_products (
    id bigserial PRIMARY KEY,
    contract_line_id bigint NOT NULL REFERENCES billing_contract_lines (id) ON DELETE CASCADE,
    line_no integer NOT NULL,
    item_id bigint NOT NULL REFERENCES items (id),
    quantity numeric(18, 2) NOT NULL,
    unit_price numeric(18, 2) NOT NULL,
    supply_amount numeric(18, 2) NOT NULL,
    vat_amount numeric(18, 2) NOT NULL
);
CREATE INDEX idx_billing_contract_line_products_line ON billing_contract_line_products (contract_line_id);
CREATE INDEX idx_billing_contract_line_products_item ON billing_contract_line_products (item_id);

-- [판매전표 발행]으로 만든 판매. 판매조회에서 그 전표를 지우면 줄이 다시 판매반영 격자에 나온다(원본 실측, ON DELETE SET NULL).
ALTER TABLE contract_bill_lines ADD COLUMN sales_id bigint REFERENCES sales (id) ON DELETE SET NULL;
CREATE INDEX idx_contract_bill_lines_sales ON contract_bill_lines (sales_id);
