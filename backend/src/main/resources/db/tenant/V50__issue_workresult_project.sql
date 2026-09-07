-- 생산불출·작업내역에 귀속 프로젝트.
-- 원본 생산불출입력·작업내역입력 머리에 [프로젝트]가 있다(사본 실측).
-- 생산입고(productions.project_id)는 이미 있었고, 이 둘만 빠져 있어서
-- 같은 작업에서 나온 불출·작업내역이 프로젝트별 집계에 안 잡혔다.
ALTER TABLE material_issues ADD COLUMN project_id bigint;
ALTER TABLE material_issues ADD CONSTRAINT fk_material_issues_project
    FOREIGN KEY (project_id) REFERENCES projects (id);
CREATE INDEX idx_material_issues_project ON material_issues (project_id);

ALTER TABLE work_results ADD COLUMN project_id bigint;
ALTER TABLE work_results ADD CONSTRAINT fk_work_results_project
    FOREIGN KEY (project_id) REFERENCES projects (id);
CREATE INDEX idx_work_results_project ON work_results (project_id);
