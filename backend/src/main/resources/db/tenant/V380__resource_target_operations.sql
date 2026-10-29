-- 자원등록 [대상작업] — 원본은 작업코드(분쇄 · 압착 …)를 여러 개 고른다(태그, 2026-10-29 데이터이관 QA 79회:
-- 00001 분쇄기 → 분쇄). 우리는 공정 하나(production_resources.process_id)를 들고 있었다.
CREATE TABLE production_resource_operations (
    resource_id  bigint NOT NULL REFERENCES production_resources(id) ON DELETE CASCADE,
    operation_id bigint NOT NULL REFERENCES process_operations(id) ON DELETE CASCADE,
    PRIMARY KEY (resource_id, operation_id)
);
CREATE INDEX idx_production_resource_operations_operation ON production_resource_operations (operation_id);
-- 옛 값은 그 공정의 작업코드가 꼭 하나일 때만 옮긴다(어느 작업인지 모르는 것은 지어내지 않는다).
INSERT INTO production_resource_operations (resource_id, operation_id)
SELECT r.id, min(o.id) FROM production_resources r JOIN process_operations o ON o.process_id = r.process_id
WHERE r.process_id IS NOT NULL
GROUP BY r.id HAVING count(o.id) = 1;
ALTER TABLE production_resources DROP COLUMN process_id;
