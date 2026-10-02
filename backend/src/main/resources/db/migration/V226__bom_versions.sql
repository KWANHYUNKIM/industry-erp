-- BOM <b>버전</b> — 원본 BOM(소요량)조회 [BOM등록] → 기본버전 · 다중버전, 품목별BOM조회(BOM번호 · BOM버전 · 기본BOM).
-- 제품 하나에 BOM 이 여럿일 수 있고 그중 하나가 기본이다. 생산입고 줄의 [BOM버전] 으로 고르지 않으면 기본을 쓴다.
-- 지금 있는 BOM 은 모두 '기본' 버전 · 기본 BOM 이 된다.

ALTER TABLE boms DROP CONSTRAINT uksqyw1w2qecwb6u6glwom2xtix;
ALTER TABLE boms ADD COLUMN version_name varchar(50) NOT NULL DEFAULT '기본';
ALTER TABLE boms ADD COLUMN is_default boolean NOT NULL DEFAULT true;
ALTER TABLE boms ADD CONSTRAINT uk_boms_product_version UNIQUE (product_id, version_name);
-- 제품마다 기본은 하나뿐이다.
CREATE UNIQUE INDEX uk_boms_product_default ON boms (product_id) WHERE is_default;

-- 생산입고 줄이 어느 BOM 버전으로 소모했나(원본 격자 [BOM버전]). 비었으면 기본이었다.
ALTER TABLE productions ADD COLUMN bom_id bigint;
ALTER TABLE productions ADD CONSTRAINT fk_productions_bom FOREIGN KEY (bom_id) REFERENCES boms (id);
CREATE INDEX idx_productions_bom ON productions (bom_id);
