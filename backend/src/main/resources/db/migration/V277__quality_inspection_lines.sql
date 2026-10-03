-- 품질검사(E040621 입력 · E040622 조회) — 원본은 여러 품목 줄을 든 전표다(2026-10-04 loginaa 실측).
-- 줄마다 검사방법(전수 · 샘플링) · 수량 · 시료 · 부적격(적격 = 시료 − 부적격) · 합격여부(해당없음 · 합격 · 불합격).
-- 전표는 [종결여부] 진행중 · 완료 를 든다. 머리의 품목 · 검사수량 · 불량수량은 줄에서 모은 값으로 남긴다(현황 · 불량률이 읽는다).
CREATE TABLE quality_inspection_lines (
    id            bigserial PRIMARY KEY,
    inspection_id bigint        NOT NULL REFERENCES quality_inspections (id),
    line_no       integer       NOT NULL,
    item_id       bigint        NOT NULL REFERENCES items (id),
    method        varchar(20)   NOT NULL CHECK (method IN ('FULL','SAMPLING')),
    quantity      numeric(18,2) NOT NULL,
    sample_qty    numeric(18,2) NOT NULL,
    defect_qty    numeric(18,2) NOT NULL,
    pass_result   varchar(20)   NOT NULL CHECK (pass_result IN ('NA','PASS','FAIL')),
    defect_type   varchar(50)
);
CREATE INDEX idx_quality_inspection_lines_inspection ON quality_inspection_lines (inspection_id);
CREATE INDEX idx_quality_inspection_lines_item ON quality_inspection_lines (item_id);

INSERT INTO quality_inspection_lines (inspection_id, line_no, item_id, method, quantity, sample_qty, defect_qty, pass_result, defect_type)
SELECT id, 1, item_id, 'FULL', inspected_qty, inspected_qty, defect_qty,
       CASE result WHEN 'PASS' THEN 'PASS' WHEN 'FAIL' THEN 'FAIL' ELSE 'NA' END, defect_type
FROM quality_inspections;

ALTER TABLE quality_inspections ADD COLUMN status varchar(20);
UPDATE quality_inspections SET status = 'IN_PROGRESS' WHERE status IS NULL;
ALTER TABLE quality_inspections ALTER COLUMN status SET NOT NULL;
ALTER TABLE quality_inspections ADD CONSTRAINT quality_inspections_status_check CHECK (status IN ('IN_PROGRESS','COMPLETED'));
