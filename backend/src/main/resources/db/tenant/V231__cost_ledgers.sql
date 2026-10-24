-- 원가생성/수정(E040802) 원가계산 [수정] · [기말금액재계산] 이 여는 '원가계산내역'(2026-10-13 loginaa 실측) —
-- 품목마다 기초 · 증가(구매 · 생산입고 · 노무비 · 경비 · 외주비 · 조정/대체/반품) · 감소 · 기말의 수량과 금액.
-- [생성] 이 장부(재고수불 · 구매 · 생산실적)로 채우고, 체크 → [변경] 원가수정이 단가 · 노무비 · 경비를 고친다.
-- 고치면 감소 · 기말 금액은 '자동계산'(null)으로 비우고 [기말금액재계산] 이 총평균으로 다시 낸다.
CREATE TABLE cost_ledgers (
    id                  bigserial PRIMARY KEY,
    cost_period_id      bigint        NOT NULL REFERENCES cost_periods (id),
    item_id             bigint        NOT NULL REFERENCES items (id),
    opening_qty         numeric(18, 2) NOT NULL DEFAULT 0,
    opening_amount      numeric(18, 2) NOT NULL DEFAULT 0,
    purchase_qty        numeric(18, 2) NOT NULL DEFAULT 0,
    purchase_amount     numeric(18, 2) NOT NULL DEFAULT 0,
    production_qty      numeric(18, 2) NOT NULL DEFAULT 0,
    production_amount   numeric(18, 2) NOT NULL DEFAULT 0,
    labor_amount        numeric(18, 2) NOT NULL DEFAULT 0,
    overhead_amount     numeric(18, 2) NOT NULL DEFAULT 0,
    outsourcing_qty     numeric(18, 2) NOT NULL DEFAULT 0,
    outsourcing_amount  numeric(18, 2) NOT NULL DEFAULT 0,
    adjust_qty          numeric(18, 2) NOT NULL DEFAULT 0,
    adjust_amount       numeric(18, 2) NOT NULL DEFAULT 0,
    decrease_qty        numeric(18, 2) NOT NULL DEFAULT 0,
    decrease_amount     numeric(18, 2),
    closing_amount      numeric(18, 2),
    created_at          timestamp(6),
    updated_at          timestamp(6),
    CONSTRAINT uk_cost_ledgers_period_item UNIQUE (cost_period_id, item_id)
);
CREATE INDEX idx_cost_ledgers_item_id ON cost_ledgers (item_id);
