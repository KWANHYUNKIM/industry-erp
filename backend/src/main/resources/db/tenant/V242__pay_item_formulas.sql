-- 관리 > 수당항목등록 [계산식] (원본 E090103, 2026-10-13 loginaa 실측): 항목마다 적용시점별 계산식(계산식리스트 · 계산식등록).
--   예) 부양가족수당 2019/01 ~ R( ( 기본급(급여지급사항) * 0.01 * 간이세액표 적용 부양가족수(계산항목) ) )
--   급여계산은 귀속월에 걸리는 가장 늦은 적용시점의 계산식으로 그 항목 금액을 셈한다.
CREATE TABLE pay_item_formulas (
    id bigserial PRIMARY KEY,
    pay_item_id bigint NOT NULL,
    effective_from varchar(7) NOT NULL,
    formula varchar(2000) NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamp(6),
    updated_at timestamp(6),
    CONSTRAINT fk_pay_item_formulas_item FOREIGN KEY (pay_item_id) REFERENCES pay_items(id),
    CONSTRAINT uk_pay_item_formulas_item_from UNIQUE (pay_item_id, effective_from),
    CONSTRAINT pay_item_formulas_effective_from_check CHECK (effective_from ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
CREATE INDEX idx_pay_item_formulas_pay_item_id ON pay_item_formulas (pay_item_id);
