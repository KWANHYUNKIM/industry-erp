-- 원본 재고 II > 품질관리 > 품질검사 > 품질검사유형등록(E040632 검사유형리스트, 2026-10-12 loginaa 실측).
-- 유형: 품질검사유형코드 · 품질검사유형명 (+ 사용중단). 검사항목(검사항목등록): 검사항목코드 · 검사항목명 · 형식(코드형식 · 문자형식) ·
-- 필수항목 · 사용. 유형마다 [검사항목설정] 으로 그 유형이 쓰는 검사항목을 고른다.
CREATE TABLE quality_inspection_types (
    id         bigserial PRIMARY KEY,
    code       varchar(20)  NOT NULL,
    name       varchar(100) NOT NULL,
    active     boolean      NOT NULL DEFAULT true,
    created_at timestamp(6),
    updated_at timestamp(6),
    CONSTRAINT uk_quality_inspection_types_code UNIQUE (code)
);

CREATE TABLE quality_check_items (
    id         bigserial PRIMARY KEY,
    code       varchar(20)  NOT NULL,
    name       varchar(100) NOT NULL,
    format     varchar(10)  NOT NULL,
    required   boolean      NOT NULL DEFAULT false,
    active     boolean      NOT NULL DEFAULT true,
    created_at timestamp(6),
    updated_at timestamp(6),
    CONSTRAINT uk_quality_check_items_code UNIQUE (code),
    CONSTRAINT ck_quality_check_items_format CHECK (format IN ('CODE', 'TEXT'))
);

CREATE TABLE quality_type_check_items (
    type_id       bigint NOT NULL REFERENCES quality_inspection_types (id),
    check_item_id bigint NOT NULL REFERENCES quality_check_items (id),
    PRIMARY KEY (type_id, check_item_id)
);
CREATE INDEX idx_quality_type_check_items_check_item_id ON quality_type_check_items (check_item_id);
