-- 오더관리유형에 <b>단계 목록</b>을 붙인다.
--
-- 원본(이카운트) 오더관리유형리스트의 열은
--   유형코드 · 유형명 · 1단계 ~ 10단계 · 사용구분 · 입력메뉴에서 사용 · 담당자
-- 이고, '기본형' 유형의 단계가 주문서 · 발주서 · 구매 · 판매 · 출하지시서 · 출하다.
-- 즉 유형은 <b>그 오더가 밟아 갈 단계의 순서</b>를 담는 템플릿이다.
--
-- 우리 유형에는 코드·이름·설명뿐이라 "이 유형은 어떤 단계를 밟나" 를 적을 자리가 없었고,
-- 그래서 오더관리진행단계 화면도 단계 마스터만 나열할 뿐 진행을 보여 주지 못했다.
CREATE TABLE order_type_steps (
    id             bigserial PRIMARY KEY,
    order_type_id  bigint  NOT NULL REFERENCES order_types(id) ON DELETE CASCADE,
    seq            integer NOT NULL,
    order_stage_id bigint  NOT NULL REFERENCES order_stages(id),
    created_at     timestamp,
    updated_at     timestamp
);

CREATE INDEX idx_order_type_steps_type ON order_type_steps (order_type_id);
CREATE INDEX idx_order_type_steps_stage ON order_type_steps (order_stage_id);
CREATE UNIQUE INDEX uq_order_type_steps_seq ON order_type_steps (order_type_id, seq);

-- 원본 열 [입력메뉴에서 사용] · [담당자]
ALTER TABLE order_types ADD COLUMN use_in_input boolean;
UPDATE order_types SET use_in_input = true WHERE use_in_input IS NULL;
ALTER TABLE order_types ALTER COLUMN use_in_input SET NOT NULL;
ALTER TABLE order_types ALTER COLUMN use_in_input SET DEFAULT true;

ALTER TABLE order_types ADD COLUMN manager varchar(50);
