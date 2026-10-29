-- 회계 II › 계약관리 › 계약항목등록 [수량별단가 › 설정] — 수량 N 이상 → 단가(VAT포함).
-- 원본 00003 정수기 렌탈비_월말청구 목록 [수량별단가] 50,000 (2026-10-29 데이터이관 QA C2). 원본 [설정] 창 칸은 미실측.
CREATE TABLE contract_item_qty_prices (
    id bigserial PRIMARY KEY,
    contract_item_id bigint NOT NULL REFERENCES contract_items (id) ON DELETE CASCADE,
    line_no integer NOT NULL,
    min_quantity numeric(18, 2) NOT NULL,
    unit_price numeric(18, 2) NOT NULL,
    vat_included boolean NOT NULL
);
CREATE INDEX idx_contract_item_qty_prices_contract_item ON contract_item_qty_prices (contract_item_id);
