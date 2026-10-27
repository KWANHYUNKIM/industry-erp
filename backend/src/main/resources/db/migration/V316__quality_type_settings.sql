-- 원본 품질검사유형등록(E040632) 다시 잼(2026-10-12 loginaa):
--  · 검사항목 형식은 코드형식 · 숫자형식 · 문자형식 셋이다(V315 는 둘만 받았다).
--  · [검사항목설정] 창은 형식마다 칸 넷(코드형검사항목1~4 · 숫자형검사항목1~4 · 문자형검사항목1~4)이라
--    몇 번째 칸인지(slot)를 든다.
--  · 코드형식 검사항목은 [상세항목](상세항목코드 · 상세항목명 · 사용)을 따로 가진다 — 검사 때 고르는 값.
--  · 유형마다 [품목설정] 으로 품목을 붙인다. 한 품목은 한 유형에만 붙는다([품목별설정리스트] 의 [검사유형] 한 칸).
ALTER TABLE quality_check_items DROP CONSTRAINT ck_quality_check_items_format;
ALTER TABLE quality_check_items ADD CONSTRAINT ck_quality_check_items_format CHECK (format IN ('CODE', 'NUMBER', 'TEXT'));

ALTER TABLE quality_type_check_items ADD COLUMN slot smallint;
UPDATE quality_type_check_items SET slot = 1 WHERE slot IS NULL;
ALTER TABLE quality_type_check_items ALTER COLUMN slot SET NOT NULL;
ALTER TABLE quality_type_check_items ADD CONSTRAINT ck_quality_type_check_items_slot CHECK (slot BETWEEN 1 AND 4);

CREATE TABLE quality_check_item_details (
    id            bigserial PRIMARY KEY,
    check_item_id bigint       NOT NULL REFERENCES quality_check_items (id),
    code          varchar(20)  NOT NULL,
    name          varchar(100) NOT NULL,
    active        boolean      NOT NULL DEFAULT true,
    created_at    timestamp(6),
    updated_at    timestamp(6),
    CONSTRAINT uk_quality_check_item_details UNIQUE (check_item_id, code)
);

CREATE TABLE quality_type_items (
    type_id bigint NOT NULL REFERENCES quality_inspection_types (id),
    item_id bigint NOT NULL REFERENCES items (id),
    PRIMARY KEY (type_id, item_id),
    CONSTRAINT uk_quality_type_items_item UNIQUE (item_id)
);
