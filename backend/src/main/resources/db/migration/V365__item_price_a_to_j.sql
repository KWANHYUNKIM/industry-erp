-- 원본 품목등록 [단가] 탭의 단가A ~ 단가J (재고 I › 기초등록 › 단가관리 › 품목별단가 E040122 의 열).
-- 출고단가(unit_price) · 입고단가(purchase_price) 와 따로, 품목마다 열 개의 단가를 더 둔다.
ALTER TABLE items
    ADD COLUMN price_a numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN price_b numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN price_c numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN price_d numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN price_e numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN price_f numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN price_g numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN price_h numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN price_i numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN price_j numeric(18,2) NOT NULL DEFAULT 0;
